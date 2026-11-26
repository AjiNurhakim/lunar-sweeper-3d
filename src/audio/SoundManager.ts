export class SoundManager {
    public enabled = true;
    private ctx: AudioContext | null = null;
    private engineOsc: OscillatorNode | null = null;
    private engineGain: GainNode | null = null;
    private brushNoiseBuffer: AudioBuffer | null = null;
    private lastBrushTime = 0;

    constructor(enabled = true) {
        this.enabled = enabled;
        this.setupWarmupListeners();
    }

    private setupWarmupListeners(): void {
        const unlock = () => {
            this.initContext();
            window.removeEventListener('pointerdown', unlock);
            window.removeEventListener('keydown', unlock);
            window.removeEventListener('touchstart', unlock);
        };
        window.addEventListener('pointerdown', unlock, { once: true, passive: true });
        window.addEventListener('keydown', unlock, { once: true, passive: true });
        window.addEventListener('touchstart', unlock, { once: true, passive: true });
    }

    public initContext(): void {
        if (!this.ctx) {
            const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
            this.ctx = new AudioCtx();
            this.prepareNoiseBuffer();
        }
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    private prepareNoiseBuffer(): void {
        if (!this.ctx || this.brushNoiseBuffer) return;
        // Pre-create 0.25 seconds of reusable white noise buffer (eliminates GC & math.random spikes!)
        const bufferSize = Math.floor(this.ctx.sampleRate * 0.25);
        this.brushNoiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = this.brushNoiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * 0.15;
        }
    }

    public toggle(): boolean {
        this.enabled = !this.enabled;
        if (!this.enabled && this.engineGain) {
            this.engineGain.gain.value = 0;
        }
        return this.enabled;
    }

    public playBrush(tier: number): void {
        if (!this.enabled) return;
        this.initContext();
        if (!this.ctx || !this.brushNoiseBuffer) return;

        // Rate limit to prevent audio node queue flooding (at most every 55ms)
        const now = performance.now();
        if (now - this.lastBrushTime < 55) return;
        this.lastBrushTime = now;

        const noise = this.ctx.createBufferSource();
        noise.buffer = this.brushNoiseBuffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        // Tier 3 = deeper lower rumble, Tier 1 = crisp higher rustle
        filter.frequency.value = tier === 3 ? 550 : (tier === 2 ? 850 : 1200);
        filter.Q.value = 2.5;

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.08);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);

        noise.start();
    }

    public playDepositWhoosh(): void {
        if (!this.enabled) return;
        this.initContext();
        if (!this.ctx) return;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(220, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(880, this.ctx.currentTime + 0.22);

        gain.gain.setValueAtTime(0.12, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.22);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.24);
    }

    public playCoin(): void {
        if (!this.enabled) return;
        this.initContext();
        if (!this.ctx) return;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(987.77, this.ctx.currentTime); // B5
        osc.frequency.setValueAtTime(1318.51, this.ctx.currentTime + 0.06); // E6

        gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.18);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.2);
    }

    public playHammerHit(shattered = false): void {
        if (!this.enabled) return;
        this.initContext();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(shattered ? 180 : 140, now);
        osc.frequency.exponentialRampToValueAtTime(48, now + (shattered ? 0.16 : 0.10));

        gain.gain.setValueAtTime(shattered ? 0.18 : 0.13, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + (shattered ? 0.17 : 0.11));

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.18);
    }

    public playUpgrade(): void {
        if (!this.enabled) return;
        this.initContext();
        if (!this.ctx) return;

        const notes = [523.25, 659.25, 783.99, 1046.50]; // C - E - G - C
        notes.forEach((freq, idx) => {
            const osc = this.ctx!.createOscillator();
            const gain = this.ctx!.createGain();

            osc.type = 'sine';
            osc.frequency.value = freq;

            const t = this.ctx!.currentTime + idx * 0.06;
            gain.gain.setValueAtTime(0.08, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);

            osc.connect(gain);
            gain.connect(this.ctx!.destination);

            osc.start(t);
            osc.stop(t + 0.2);
        });
    }

    public playLaunch(): void {
        if (!this.enabled) return;
        this.initContext();
        if (!this.ctx) return;

        const notes = [440, 554.37, 659.25, 880]; // A major
        notes.forEach((freq, idx) => {
            const osc = this.ctx!.createOscillator();
            const gain = this.ctx!.createGain();

            osc.type = 'triangle';
            osc.frequency.value = freq;

            const t = this.ctx!.currentTime + idx * 0.08;
            gain.gain.setValueAtTime(0.12, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

            osc.connect(gain);
            gain.connect(this.ctx!.destination);

            osc.start(t);
            osc.stop(t + 0.38);
        });
    }
}
