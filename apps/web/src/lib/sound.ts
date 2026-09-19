/** Tiny synthesized sound effects (no audio assets to download). */
import { useSettings } from '../stores/settings.ts';

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  const { sound } = useSettings.getState();
  if (!sound) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, start: number, duration: number, type: OscillatorType = 'sine', gain = 0.25) {
  const ac = audio();
  if (!ac) return;
  const volume = useSettings.getState().volume;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const t0 = ac.currentTime + start;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain * volume, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(g).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

export const sfx = {
  pin: () => tone(660, 0, 0.08, 'triangle', 0.2),
  tick: () => tone(1200, 0, 0.05, 'square', 0.06),
  /** Rising arpeggio — more notes for better scores. */
  result(score: number) {
    const notes = [523, 659, 784, 1047, 1319];
    const count = Math.max(1, Math.ceil((score / 5000) * notes.length));
    notes.slice(0, count).forEach((f, i) => tone(f, i * 0.09, 0.25, 'triangle', 0.18));
  },
  timeout: () => {
    tone(330, 0, 0.2, 'sawtooth', 0.12);
    tone(247, 0.18, 0.3, 'sawtooth', 0.12);
  },
  correct: () => [784, 1047].forEach((f, i) => tone(f, i * 0.1, 0.2, 'triangle', 0.2)),
  wrong: () => tone(196, 0, 0.35, 'sawtooth', 0.15),
  finish: () => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, i * 0.11, 0.3, 'triangle', 0.16)),
};
