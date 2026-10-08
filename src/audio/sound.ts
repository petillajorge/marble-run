// Procedural audio synthesizer using Web Audio API

class SoundEngine {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;
  private rollingNodes: Map<string, { osc: OscillatorNode; gain: GainNode; filter: BiquadFilterNode }> = new Map();

  private initContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public toggleMute(muted?: boolean): boolean {
    if (muted !== undefined) {
      this.isMuted = muted;
    } else {
      this.isMuted = !this.isMuted;
    }
    return this.isMuted;
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  // Play marble collision / clack sound with intensity proportional to impact velocity
  public playImpactSound(velocitySq: number) {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    const intensity = Math.min(Math.sqrt(velocitySq) / 10, 1.0);
    if (intensity < 0.05) return; // ignore soft micro-collisions

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'triangle';
    // Higher velocity = higher pitch clack
    osc.frequency.setValueAtTime(300 + intensity * 600, now);
    osc.frequency.exponentialRampToValueAtTime(100, now + 0.08);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1200 + intensity * 2000, now);

    gain.gain.setValueAtTime(intensity * 0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.09);
  }

  // Play continuous marble rolling rumble modulated by speed
  public updateRollingSound(id: string, speed: number) {
    if (this.isMuted) {
      this.stopRollingSound(id);
      return;
    }
    this.initContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    let sound = this.rollingNodes.get(id);

    if (speed < 0.2) {
      if (sound) {
        sound.gain.gain.setTargetAtTime(0, now, 0.05);
      }
      return;
    }

    if (!sound) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();

      osc.type = 'sawtooth';
      filter.type = 'lowpass';
      filter.frequency.value = 400;

      gain.gain.setValueAtTime(0.001, now);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);

      sound = { osc, gain, filter };
      this.rollingNodes.set(id, sound);
    }

    const normSpeed = Math.min(speed / 15, 1.0);
    const targetFreq = 80 + normSpeed * 180;
    const targetVolume = normSpeed * 0.15;

    sound.osc.frequency.setTargetAtTime(targetFreq, now, 0.05);
    sound.filter.frequency.setTargetAtTime(300 + normSpeed * 600, now, 0.05);
    sound.gain.gain.setTargetAtTime(targetVolume, now, 0.05);
  }

  public stopRollingSound(id: string) {
    const sound = this.rollingNodes.get(id);
    if (sound && this.ctx) {
      sound.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
      setTimeout(() => {
        try {
          sound.osc.stop();
          sound.osc.disconnect();
        } catch {}
        this.rollingNodes.delete(id);
      }, 100);
    }
  }

  // Countdown beep sound
  public playCountdownBeep(isFinal: boolean = false) {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(isFinal ? 880 : 440, now);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (isFinal ? 0.4 : 0.2));

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + (isFinal ? 0.45 : 0.25));
  }

  // Victory fanfare chime on race completion
  public playVictoryFanfare() {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    const now = this.ctx.currentTime;

    notes.forEach((freq, idx) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.12);

      gain.gain.setValueAtTime(0, now + idx * 0.12);
      gain.gain.linearRampToValueAtTime(0.25, now + idx * 0.12 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 0.5);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now + idx * 0.12);
      osc.stop(now + idx * 0.12 + 0.55);
    });
  }

  // Gate click / release trigger sound
  public playGateRelease() {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.1);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.12);
  }
}

export const soundEngine = new SoundEngine();
