class AudioPlayer {
    constructor() {
        this.currentAudio = null;
        this.currentTrack = null;
        this.audioContext = null;
        this.analyser = null;
        this.dataArray = null;
        this.animationId = null;
        this.waveformData = new Map();
        this.trackColors = new Map();
        this.isDragging = false;
        this.rainEffect = new RainEffect();
        this.lightningEffect = new LightningEffect();
        this.realtimeAnalysers = new Map();

        this.init();
    }

    async init() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (error) {
            console.warn('Web Audio API not supported');
        }

        this.setupEventListeners();
        this.generateTrackColors();
        await this.preloadWaveforms();
    }

    generateTrackColors() {
        const colors = [
            '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
            '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
            '#FFFF00', '#ADFF2F', '#00FF00', '#FFD700', '#FFA500',
            '#E6E6FA', '#DDA0DD', '#DA70D6', '#BA55D3', '#9370DB',
            '#FF69B4', '#FF1493', '#DC143C', '#B22222', '#8B0000',
            '#00CED1', '#40E0D0', '#48D1CC', '#00FFFF', '#7FFFD4',
            '#98FB98', '#90EE90', '#32CD32', '#228B22', '#006400'
        ];

        document.querySelectorAll('.track').forEach((track, index) => {
            const src = track.dataset.src;
            // Randomize colors each time - no consistency needed
            const randomColor = colors[Math.floor(Math.random() * colors.length)];
            this.trackColors.set(src, randomColor);
        });
    }

    setupEventListeners() {
        document.querySelectorAll('.track').forEach(track => {
            const playButton = track.querySelector('.play-button');
            const canvas = track.querySelector('.waveform');

            playButton.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleTrack(track);
            });

            // Add scrubbing functionality
            canvas.addEventListener('click', (e) => {
                if (this.currentTrack === track && this.currentAudio) {
                    const rect = canvas.getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    const progress = x / rect.width;
                    const newTime = progress * this.currentAudio.duration;
                    this.currentAudio.currentTime = newTime;
                }
            });

            // Mouse events
            canvas.addEventListener('mousedown', (e) => {
                if (this.currentTrack === track && this.currentAudio) {
                    this.isDragging = true;
                    this.handleScrub(e, canvas);
                }
            });

            canvas.addEventListener('mousemove', (e) => {
                if (this.isDragging && this.currentTrack === track && this.currentAudio) {
                    this.handleScrub(e, canvas);
                }
            });

            canvas.addEventListener('mouseup', () => {
                this.isDragging = false;
            });

            canvas.addEventListener('mouseleave', () => {
                this.isDragging = false;
            });

            // Touch events for mobile
            canvas.addEventListener('touchstart', (e) => {
                e.preventDefault();
                if (this.currentTrack === track && this.currentAudio) {
                    this.isDragging = true;
                    this.handleTouchScrub(e, canvas);
                }
            });

            canvas.addEventListener('touchmove', (e) => {
                e.preventDefault();
                if (this.isDragging && this.currentTrack === track && this.currentAudio) {
                    this.handleTouchScrub(e, canvas);
                }
            });

            canvas.addEventListener('touchend', (e) => {
                e.preventDefault();
                this.isDragging = false;
            });

            canvas.addEventListener('touchcancel', (e) => {
                e.preventDefault();
                this.isDragging = false;
            });

            // Add cursor styling for interactive waveform
            canvas.style.cursor = 'pointer';
        });
    }

    handleScrub(e, canvas) {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const progress = Math.max(0, Math.min(1, x / rect.width));
        const newTime = progress * this.currentAudio.duration;
        this.currentAudio.currentTime = newTime;
    }

    handleTouchScrub(e, canvas) {
        const rect = canvas.getBoundingClientRect();
        const touch = e.touches[0] || e.changedTouches[0];
        const x = touch.clientX - rect.left;
        const progress = Math.max(0, Math.min(1, x / rect.width));
        const newTime = progress * this.currentAudio.duration;
        this.currentAudio.currentTime = newTime;
    }

    async preloadWaveforms() {
        const tracks = document.querySelectorAll('.track');

        for (const track of tracks) {
            const src = track.dataset.src;
            const canvas = track.querySelector('.waveform');

            try {
                const waveform = await this.generateWaveform(src);
                this.waveformData.set(src, waveform);
                this.drawStaticWaveform(canvas, waveform, src);
            } catch (error) {
                console.error(`Failed to generate waveform for ${src}:`, error);
                this.drawPlaceholderWaveform(canvas, src);
            }
        }
    }

    async generateWaveform(src) {
        try {
            const response = await fetch(src);
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

            const rawData = audioBuffer.getChannelData(0);
            const samples = 800; // Much higher resolution for smoother spiky waveform
            const blockSize = Math.floor(rawData.length / samples);
            const filteredData = [];

            for (let i = 0; i < samples; i++) {
                let blockStart = blockSize * i;
                let sum = 0;
                let max = 0;
                for (let j = 0; j < blockSize; j++) {
                    const abs = Math.abs(rawData[blockStart + j]);
                    sum += abs;
                    max = Math.max(max, abs);
                }
                // Use both average and peak for more dynamic spikes
                const average = sum / blockSize;
                const peak = max;
                filteredData.push({
                    average: average,
                    peak: peak,
                    combined: (average * 0.7) + (peak * 0.3)
                });
            }

            const maxCombined = Math.max(...filteredData.map(d => d.combined));
            const multiplier = maxCombined > 0 ? 1 / maxCombined : 1;

            return filteredData.map(d => ({
                average: d.average * multiplier,
                peak: d.peak * multiplier,
                combined: d.combined * multiplier
            }));
        } catch (error) {
            console.error('Error generating waveform:', error);
            return this.generatePlaceholderData();
        }
    }

    generatePlaceholderData() {
        return Array.from({length: 800}, () => ({
            average: Math.random() * 0.8 + 0.1,
            peak: Math.random() * 0.8 + 0.1,
            combined: Math.random() * 0.8 + 0.1
        }));
    }

    drawStaticWaveform(canvas, waveform, src) {
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        const color = this.trackColors.get(src) || '#2ECC71';

        ctx.clearRect(0, 0, width, height);

        const centerY = height / 2;
        const stepX = width / (waveform.length - 1);

        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Draw upper spiky waveform
        ctx.beginPath();
        ctx.moveTo(0, centerY);

        for (let i = 0; i < waveform.length; i++) {
            const x = i * stepX;
            const amplitude = typeof waveform[i] === 'object' ? waveform[i].combined : waveform[i];
            const y = centerY - (amplitude * height * 0.4);

            if (i === 0) {
                ctx.lineTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.lineTo(width, centerY);
        ctx.stroke();

        // Draw lower spiky waveform (mirrored)
        ctx.beginPath();
        ctx.moveTo(0, centerY);

        for (let i = 0; i < waveform.length; i++) {
            const x = i * stepX;
            const amplitude = typeof waveform[i] === 'object' ? waveform[i].combined : waveform[i];
            const y = centerY + (amplitude * height * 0.4);

            if (i === 0) {
                ctx.lineTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.lineTo(width, centerY);
        ctx.stroke();
    }

    drawAnimatedWaveform(canvas, waveform, progress = 0, src) {
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        const baseColor = this.trackColors.get(src) || '#2ECC71';
        const progressedColor = this.darkenColor(baseColor, 0.3);

        ctx.clearRect(0, 0, width, height);

        const centerY = height / 2;
        const stepX = width / (waveform.length - 1);
        const progressIndex = Math.floor(progress * waveform.length);

        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Draw progressed portion (darker)
        if (progressIndex > 0) {
            ctx.strokeStyle = progressedColor;

            // Upper waveform (progressed)
            ctx.beginPath();
            ctx.moveTo(0, centerY);
            for (let i = 0; i <= progressIndex && i < waveform.length; i++) {
                const x = i * stepX;
                const amplitude = typeof waveform[i] === 'object' ? waveform[i].combined : waveform[i];
                const y = centerY - (amplitude * height * 0.4);
                ctx.lineTo(x, y);
            }
            ctx.stroke();

            // Lower waveform (progressed)
            ctx.beginPath();
            ctx.moveTo(0, centerY);
            for (let i = 0; i <= progressIndex && i < waveform.length; i++) {
                const x = i * stepX;
                const amplitude = typeof waveform[i] === 'object' ? waveform[i].combined : waveform[i];
                const y = centerY + (amplitude * height * 0.4);
                ctx.lineTo(x, y);
            }
            ctx.stroke();
        }

        // Draw remaining portion (original color)
        if (progressIndex < waveform.length - 1) {
            ctx.strokeStyle = baseColor;

            // Upper waveform (remaining)
            ctx.beginPath();
            const startX = progressIndex * stepX;
            ctx.moveTo(startX, centerY);
            for (let i = progressIndex; i < waveform.length; i++) {
                const x = i * stepX;
                const amplitude = typeof waveform[i] === 'object' ? waveform[i].combined : waveform[i];
                const y = centerY - (amplitude * height * 0.4);
                ctx.lineTo(x, y);
            }
            ctx.stroke();

            // Lower waveform (remaining)
            ctx.beginPath();
            ctx.moveTo(startX, centerY);
            for (let i = progressIndex; i < waveform.length; i++) {
                const x = i * stepX;
                const amplitude = typeof waveform[i] === 'object' ? waveform[i].combined : waveform[i];
                const y = centerY + (amplitude * height * 0.4);
                ctx.lineTo(x, y);
            }
            ctx.stroke();
        }

        // Draw progress indicator
        const progressX = progress * width;
        ctx.strokeStyle = '#FF3B30';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(progressX, 0);
        ctx.lineTo(progressX, height);
        ctx.stroke();
    }

    darkenColor(color, amount) {
        const hex = color.replace('#', '');
        const r = Math.max(0, parseInt(hex.substr(0, 2), 16) - Math.round(255 * amount));
        const g = Math.max(0, parseInt(hex.substr(2, 2), 16) - Math.round(255 * amount));
        const b = Math.max(0, parseInt(hex.substr(4, 2), 16) - Math.round(255 * amount));
        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    }

    drawPlaceholderWaveform(canvas, src) {
        const placeholderData = this.generatePlaceholderData();
        this.drawStaticWaveform(canvas, placeholderData, src);
    }

    async toggleTrack(track) {
        const src = track.dataset.src;
        const playButton = track.querySelector('.play-button');
        const canvas = track.querySelector('.waveform');

        if (this.currentTrack === track && this.currentAudio && !this.currentAudio.paused) {
            this.pauseTrack();
            return;
        }

        if (this.currentTrack === track && this.currentAudio && this.currentAudio.paused) {
            this.resumeTrack();
            return;
        }

        if (this.currentAudio) {
            this.stopTrack();
        }

        try {
            this.currentAudio = new Audio(src);
            this.currentTrack = track;


            // Set up real-time audio analysis for reactive visualizer
            if (this.audioContext && this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }

            if (this.audioContext) {
                const source = this.audioContext.createMediaElementSource(this.currentAudio);
                const analyser = this.audioContext.createAnalyser();
                analyser.fftSize = 128;
                analyser.smoothingTimeConstant = 0.8;

                source.connect(analyser);
                analyser.connect(this.audioContext.destination);

                this.realtimeAnalysers.set(src, {
                    analyser: analyser,
                    dataArray: new Uint8Array(analyser.frequencyBinCount)
                });

                this.startReactiveVisualization(canvas, src);
            }

            await this.currentAudio.play();

            track.classList.add('playing');
            playButton.textContent = '⏸';
            playButton.classList.add('playing');

            this.currentAudio.addEventListener('timeupdate', () => {
                if (this.currentAudio) {
                    const progress = this.currentAudio.currentTime / this.currentAudio.duration;
                    const waveform = this.waveformData.get(src);
                    if (waveform) {
                        this.drawAnimatedWaveform(canvas, waveform, progress, src);

                        // Update rain and lightning effects based on current audio intensity
                        const currentIndex = Math.floor(progress * waveform.length);
                        if (currentIndex < waveform.length) {
                            const currentAmplitude = typeof waveform[currentIndex] === 'object'
                                ? waveform[currentIndex].combined
                                : waveform[currentIndex];

                            this.rainEffect.updateIntensity(currentAmplitude);

                            // Check for beat drops (sudden amplitude spikes)
                            if (currentIndex > 0) {
                                const prevAmplitude = typeof waveform[currentIndex - 1] === 'object'
                                    ? waveform[currentIndex - 1].combined
                                    : waveform[currentIndex - 1];

                                const amplitudeIncrease = currentAmplitude - prevAmplitude;
                                if (amplitudeIncrease > 0.3 && currentAmplitude > 0.7) {
                                    this.lightningEffect.trigger();
                                }
                            }
                        }
                    }
                }
            });

            this.currentAudio.addEventListener('ended', () => {
                this.resetTrack(track);
            });

            this.currentAudio.addEventListener('pause', () => {
                if (this.currentTrack === track) {
                    track.classList.remove('playing');
                    playButton.textContent = '▶';
                    playButton.classList.remove('playing');

                    // Stop reactive visualization and show static waveform
                    if (this.animationId) {
                        cancelAnimationFrame(this.animationId);
                        this.animationId = null;
                    }

                    const waveform = this.waveformData.get(src);
                    if (waveform) {
                        this.drawStaticWaveform(canvas, waveform, src);
                    }
                }
            });

        } catch (error) {
            console.error('Error playing audio:', error);
            this.resetTrack(track);
        }
    }

    pauseTrack() {
        if (this.currentAudio) {
            this.currentAudio.pause();
        }
    }

    resumeTrack() {
        if (this.currentAudio && this.currentTrack) {
            const canvas = this.currentTrack.querySelector('.waveform');
            const src = this.currentTrack.dataset.src;

            this.currentAudio.play();

            // Restart reactive visualization
            if (this.realtimeAnalysers.has(src)) {
                this.startReactiveVisualization(canvas, src);
            }
        }
    }

    stopTrack() {
        if (this.currentAudio) {
            this.currentAudio.pause();
            this.currentAudio.currentTime = 0;
        }

        if (this.currentTrack) {
            this.resetTrack(this.currentTrack);
        }

        // Stop effects
        this.rainEffect.stop();
        this.lightningEffect.stop();
    }

    resetTrack(track) {
        const playButton = track.querySelector('.play-button');
        const canvas = track.querySelector('.waveform');
        const src = track.dataset.src;

        track.classList.remove('playing');
        playButton.textContent = '▶';
        playButton.classList.remove('playing');

        const waveform = this.waveformData.get(src);
        if (waveform) {
            this.drawStaticWaveform(canvas, waveform, src);
        }

        if (this.currentTrack === track) {
            this.currentTrack = null;
            this.currentAudio = null;
            // Stop effects when resetting
            this.rainEffect.stop();
            this.lightningEffect.stop();
            // Stop reactive visualization
            if (this.animationId) {
                cancelAnimationFrame(this.animationId);
                this.animationId = null;
            }
        }
    }

    startReactiveVisualization(canvas, src) {
        const ctx = canvas.getContext('2d');
        const analyzer = this.realtimeAnalysers.get(src);

        if (!analyzer) return;

        const animate = () => {
            if (this.currentAudio && !this.currentAudio.paused && this.currentTrack) {
                analyzer.analyser.getByteFrequencyData(analyzer.dataArray);
                this.drawReactiveBarVisualizer(canvas, analyzer.dataArray, src);
                this.animationId = requestAnimationFrame(animate);
            }
        };

        animate();
    }

    drawReactiveBarVisualizer(canvas, frequencyData, src) {
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        const color = this.trackColors.get(src) || '#2ECC71';

        // Enable high-quality rendering
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // Scale for high DPI displays
        const dpr = window.devicePixelRatio || 1;
        if (dpr !== 1) {
            const rect = canvas.getBoundingClientRect();
            canvas.width = rect.width * dpr;
            canvas.height = rect.height * dpr;
            ctx.scale(dpr, dpr);
        }

        ctx.clearRect(0, 0, width / dpr, height / dpr);

        const centerY = (height / dpr) / 2;
        const barCount = 64; // More bars for smoother visualization
        const barWidth = (width / dpr) / barCount;
        const dataStep = Math.floor(frequencyData.length / barCount);

        // Clean, minimal bars without gradients
        ctx.fillStyle = color;

        // Draw frequency bars
        for (let i = 0; i < barCount; i++) {
            const dataIndex = i * dataStep;
            const amplitude = frequencyData[dataIndex] / 255; // Normalize to 0-1
            const barHeight = amplitude * (height / dpr) * 0.7;

            const x = i * barWidth;
            const y = centerY - (barHeight / 2);

            // Minimal spacing and clean edges
            const actualBarWidth = Math.max(1, barWidth * 0.9);
            const barX = x + (barWidth - actualBarWidth) / 2;

            // Draw clean bar with rounded edges (fallback for older browsers)
            if (ctx.roundRect) {
                ctx.beginPath();
                ctx.roundRect(barX, y, actualBarWidth, barHeight, 1);
                ctx.fill();
            } else {
                ctx.fillRect(barX, y, actualBarWidth, barHeight);
            }
        }

        // Update rain and lightning effects based on frequency data
        const avgAmplitude = frequencyData.reduce((a, b) => a + b, 0) / frequencyData.length / 255;
        this.rainEffect.updateIntensity(avgAmplitude);

        // Trigger lightning on bass hits
        const bassData = frequencyData.slice(0, 8);
        const bassLevel = bassData.reduce((a, b) => a + b, 0) / bassData.length;
        if (bassLevel > 160) {
            this.lightningEffect.trigger();
        }
    }

    lightenColor(color, amount) {
        const hex = color.replace('#', '');
        const r = Math.min(255, parseInt(hex.substr(0, 2), 16) + Math.round(255 * amount));
        const g = Math.min(255, parseInt(hex.substr(2, 2), 16) + Math.round(255 * amount));
        const b = Math.min(255, parseInt(hex.substr(4, 2), 16) + Math.round(255 * amount));
        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    }

}

class RainEffect {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.raindrops = [];
        this.animationId = null;
        this.intensity = 0;
        this.isActive = false;

        this.init();
    }

    init() {
        // Create background canvas for rain effect
        this.canvas = document.createElement('canvas');
        this.canvas.style.position = 'fixed';
        this.canvas.style.top = '0';
        this.canvas.style.left = '0';
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        this.canvas.style.pointerEvents = 'none';
        this.canvas.style.zIndex = '-1';
        this.canvas.style.opacity = '0.6';

        document.body.appendChild(this.canvas);

        this.ctx = this.canvas.getContext('2d');
        this.resize();

        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    updateIntensity(amplitude) {
        this.intensity = amplitude;

        if (!this.isActive && amplitude > 0.1) {
            this.start();
        } else if (this.isActive && amplitude < 0.05) {
            this.stop();
        }

        // Add new raindrops based on intensity
        const dropCount = Math.floor(amplitude * 25);
        for (let i = 0; i < dropCount; i++) {
            this.addRaindrop();
        }
    }

    addRaindrop() {
        this.raindrops.push({
            x: Math.random() * this.canvas.width,
            y: -20,
            speed: 4 + Math.random() * 6 + (this.intensity * 4),
            length: 15 + Math.random() * 30,
            opacity: 0.4 + Math.random() * 0.5,
            thickness: 1 + Math.random() * 2
        });
    }

    start() {
        if (this.isActive) return;
        this.isActive = true;
        this.animate();
    }

    stop() {
        this.isActive = false;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        this.raindrops = [];
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    animate() {
        if (!this.isActive) return;

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Update and draw raindrops
        this.raindrops = this.raindrops.filter(drop => {
            drop.y += drop.speed;

            if (drop.y > this.canvas.height + drop.length) {
                return false; // Remove raindrop
            }

            // Draw raindrop
            this.ctx.strokeStyle = `rgba(200, 200, 255, ${drop.opacity})`;
            this.ctx.lineWidth = drop.thickness;
            this.ctx.lineCap = 'round';
            this.ctx.beginPath();
            this.ctx.moveTo(drop.x, drop.y);
            this.ctx.lineTo(drop.x, drop.y + drop.length);
            this.ctx.stroke();

            return true;
        });

        this.animationId = requestAnimationFrame(() => this.animate());
    }
}

class LightningEffect {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.isActive = false;
        this.animationId = null;

        this.init();
    }

    init() {
        // Create lightning canvas
        this.canvas = document.createElement('canvas');
        this.canvas.style.position = 'fixed';
        this.canvas.style.top = '0';
        this.canvas.style.left = '0';
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        this.canvas.style.pointerEvents = 'none';
        this.canvas.style.zIndex = '10';

        document.body.appendChild(this.canvas);

        this.ctx = this.canvas.getContext('2d');
        this.resize();

        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    trigger() {
        if (this.isActive) return;

        this.isActive = true;
        this.drawLightning();

        // Flash the background
        document.body.style.transition = 'background-color 0.1s';
        const originalBg = document.body.style.backgroundColor;
        document.body.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';

        setTimeout(() => {
            document.body.style.backgroundColor = originalBg;
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.isActive = false;
        }, 150);
    }

    drawLightning() {
        const startX = Math.random() * this.canvas.width;
        const startY = 0;
        const endX = startX + (Math.random() - 0.5) * 200;
        const endY = this.canvas.height;

        this.ctx.strokeStyle = '#FFFFFF';
        this.ctx.lineWidth = 3;
        this.ctx.shadowBlur = 10;
        this.ctx.shadowColor = '#FFFFFF';

        this.drawLightningBolt(startX, startY, endX, endY, 0.8);

        // Add some branches
        const midX = (startX + endX) / 2;
        const midY = this.canvas.height / 2;

        this.ctx.lineWidth = 2;
        this.drawLightningBolt(midX, midY, midX + (Math.random() - 0.5) * 100, midY + 100, 0.5);
        this.drawLightningBolt(midX, midY, midX + (Math.random() - 0.5) * 100, midY + 100, 0.5);
    }

    drawLightningBolt(startX, startY, endX, endY, intensity) {
        const segments = 20;
        const roughness = 40 * intensity;

        this.ctx.beginPath();
        this.ctx.moveTo(startX, startY);

        for (let i = 1; i <= segments; i++) {
            const progress = i / segments;
            const x = startX + (endX - startX) * progress + (Math.random() - 0.5) * roughness;
            const y = startY + (endY - startY) * progress;
            this.ctx.lineTo(x, y);
        }

        this.ctx.stroke();
    }

    stop() {
        this.isActive = false;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new AudioPlayer();
});