// VOIDGARDEN sound: every effect is synthesized with the Web Audio API,
// no audio files. A soft ambient pad hums under the game once the player
// has interacted; M toggles mute.

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.pad = null;
    this.muted = false;
    this.lastShoot = 0;
  }

  // Call from a user gesture (click / key press). Safe to call repeatedly.
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
      this.startPad();
    } catch (err) {
      this.ctx = null;
    }
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.5;
  }

  startPad() {
    const ctx = this.ctx;
    const padGain = ctx.createGain();
    padGain.gain.value = 0.05;
    padGain.connect(this.master);
    const notes = [110, 164.81, 220];
    for (const freq of notes) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.detune.value = (Math.random() - 0.5) * 8;
      const g = ctx.createGain();
      g.gain.value = 0.33;
      osc.connect(g);
      g.connect(padGain);
      osc.start();
    }
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.08;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.02;
    lfo.connect(lfoGain);
    lfoGain.connect(padGain.gain);
    lfo.start();
    this.pad = padGain;
  }

  tone({ freq, freqEnd, dur, type, gain, when = 0 }) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  noise({ dur, gain, freq, when = 0 }) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + when;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start(t0);
  }

  shoot() {
    const now = performance.now();
    if (now - this.lastShoot < 40) return;
    this.lastShoot = now;
    this.tone({ freq: 720, freqEnd: 320, dur: 0.07, type: 'square', gain: 0.06 });
  }

  bloom() {
    this.tone({ freq: 523, dur: 0.12, type: 'sine', gain: 0.12 });
    this.tone({ freq: 784, dur: 0.16, type: 'sine', gain: 0.09, when: 0.05 });
  }

  pickup() {
    this.tone({ freq: 880, freqEnd: 1320, dur: 0.1, type: 'triangle', gain: 0.1 });
  }

  heart() {
    this.tone({ freq: 392, dur: 0.14, type: 'sine', gain: 0.12 });
    this.tone({ freq: 523, dur: 0.18, type: 'sine', gain: 0.12, when: 0.09 });
    this.tone({ freq: 659, dur: 0.22, type: 'sine', gain: 0.1, when: 0.18 });
  }

  dash() {
    this.noise({ dur: 0.16, gain: 0.16, freq: 2400 });
  }

  hit() {
    this.tone({ freq: 160, freqEnd: 50, dur: 0.25, type: 'sawtooth', gain: 0.2 });
    this.noise({ dur: 0.18, gain: 0.18, freq: 900 });
  }

  wave() {
    const notes = [392, 523, 659, 784];
    notes.forEach((freq, i) => {
      this.tone({ freq, dur: 0.16, type: 'triangle', gain: 0.1, when: i * 0.07 });
    });
  }

  gameover() {
    const notes = [392, 330, 262, 196];
    notes.forEach((freq, i) => {
      this.tone({ freq, dur: 0.3, type: 'sine', gain: 0.13, when: i * 0.16 });
    });
  }

  start() {
    const notes = [262, 392, 523];
    notes.forEach((freq, i) => {
      this.tone({ freq, dur: 0.14, type: 'triangle', gain: 0.1, when: i * 0.06 });
    });
  }
}
