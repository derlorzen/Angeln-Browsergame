// Eigene, synthetisch erzeugte Klänge (WebAudio). Keine Audiodateien nötig.
type SoundName =
  | 'click' | 'chop' | 'build' | 'built' | 'hit' | 'shot' | 'die' | 'alarm' | 'trained' | 'error' | 'coin' | 'win' | 'lose'
  | 'select' | 'order' | 'discover';

export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private last = new Map<SoundName, number>();
  muted = false;
  volume = 0.5;

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 0.5;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch {
      this.ctx = null;
    }
    return this.ctx;
  }

  unlock(): void {
    const c = this.ensure();
    if (c && c.state === 'suspended') void c.resume();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : this.volume;
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, when = 0, slide = 0): void {
    const c = this.ctx!;
    const t = c.currentTime + when;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master!);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private burst(dur: number, freq: number, q: number, vol: number, when = 0): void {
    const c = this.ctx!;
    const t = c.currentTime + when;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.master!);
    s.start(t);
    s.stop(t + dur + 0.02);
  }

  play(name: SoundName, minGapMs = 60): void {
    if (this.muted) return;
    const c = this.ensure();
    if (!c || c.state !== 'running') return;
    const now = performance.now();
    if (now - (this.last.get(name) ?? 0) < minGapMs) return;
    this.last.set(name, now);
    switch (name) {
      case 'click': this.tone(660, 0.05, 'square', 0.05); break;
      case 'select': this.tone(520, 0.06, 'triangle', 0.08); this.tone(780, 0.06, 'triangle', 0.06, 0.05); break;
      case 'order': this.tone(440, 0.07, 'triangle', 0.08); break;
      case 'chop': this.burst(0.08, 1800, 3, 0.25); this.tone(180, 0.06, 'square', 0.05); break;
      case 'build': this.burst(0.05, 2500, 6, 0.2); this.tone(300, 0.05, 'square', 0.04); break;
      case 'built': [523, 659, 784].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.1, i * 0.09)); break;
      case 'hit': this.burst(0.09, 3200, 8, 0.25); this.tone(900, 0.05, 'sawtooth', 0.03, 0, -400); break;
      case 'shot': this.burst(0.14, 900, 1.5, 0.18); break;
      case 'die': this.tone(220, 0.35, 'sawtooth', 0.06, 0, -150); break;
      case 'alarm': [0, 0.25, 0.5].forEach((d) => this.tone(330, 0.2, 'sawtooth', 0.07, d, 60)); break;
      case 'trained': this.tone(392, 0.1, 'triangle', 0.08); this.tone(587, 0.15, 'triangle', 0.08, 0.1); break;
      case 'error': this.tone(180, 0.15, 'square', 0.06); this.tone(140, 0.18, 'square', 0.05, 0.12); break;
      case 'coin': this.tone(1320, 0.08, 'square', 0.04); this.tone(1760, 0.12, 'square', 0.04, 0.07); break;
      case 'discover': [440, 554, 659, 880].forEach((f, i) => this.tone(f, 0.25, 'triangle', 0.08, i * 0.12)); break;
      case 'win': [392, 523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.4, 'triangle', 0.1, i * 0.18)); break;
      case 'lose': [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.45, 'sawtooth', 0.06, i * 0.25)); break;
    }
  }
}

export const sound = new Sound();
