export class SoundManager {
    public enabled = true;
    private ctx: AudioContext | null = null;
    private engineOsc: OscillatorNode | null = null;
    private engineGain: GainNode | null = null;

    constructor(enabled = true) {
        this.enabled = enabled;
    }

    private initContext(): void {
        if (!this.ctx) {
            const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
            this.ctx = new AudioCtx();
        }
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
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
        if (!this.ctx) return;

        // Procedural soft ASMR brush noise
        const bufferSize = this.ctx.sampleRate * 0.08;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * 0.15;
        }

        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

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
