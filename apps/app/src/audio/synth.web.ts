import { CAPSULE_SECONDS, type CapsuleType } from "@/content/capsules";

/**
 * Live-synthesized ambiences for the web, ported from the Hayrat prototype.
 * They stand in for the CC0 recordings of task H9; once those exist, this
 * file is replaced by plain playback of the files.
 */
export interface SynthHandle {
  stop: () => void;
  /** Frequency data for the visualizer ring, 0–255 per bin. */
  readFrequencies: (into: Uint8Array<ArrayBuffer>) => void;
}

interface Engine {
  ctx: AudioContext;
  master: GainNode;
  analyser: AnalyserNode;
  noise: AudioBuffer;
}

let engine: Engine | null = null;

function getEngine(): Engine | null {
  if (!engine) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    const ctx = new Ctor();
    const master = ctx.createGain();
    master.gain.value = 0.9;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 128;
    master.connect(analyser);
    analyser.connect(ctx.destination);
    const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    engine = { ctx, master, analyser, noise };
  }
  if (engine.ctx.state === "suspended") void engine.ctx.resume();
  return engine;
}

type Node = AudioScheduledSourceNode;
type Generator = (e: Engine, out: AudioNode, t0: number, nodes: Node[]) => void;

function noiseSource(e: Engine): AudioBufferSourceNode {
  const s = e.ctx.createBufferSource();
  s.buffer = e.noise;
  s.loop = true;
  return s;
}

function filter(e: Engine, type: BiquadFilterType, frequency: number, q?: number): BiquadFilterNode {
  const f = e.ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = frequency;
  if (q) f.Q.value = q;
  return f;
}

const D = CAPSULE_SECONDS;

const generators: Record<CapsuleType, Generator> = {
  // Fountain and ney.
  sifahane(e, out, t0, nodes) {
    const c = e.ctx;
    const n = noiseSource(e);
    const bp = filter(e, "bandpass", 1100, 0.7);
    const g = c.createGain();
    g.gain.value = 0.22;
    const l1 = c.createOscillator();
    const lg1 = c.createGain();
    l1.frequency.value = 6.3;
    lg1.gain.value = 0.07;
    l1.connect(lg1);
    lg1.connect(g.gain);
    const l2 = c.createOscillator();
    const lg2 = c.createGain();
    l2.frequency.value = 0.37;
    lg2.gain.value = 300;
    l2.connect(lg2);
    lg2.connect(bp.frequency);
    n.connect(bp);
    bp.connect(g);
    g.connect(out);
    n.start(t0);
    l1.start(t0);
    l2.start(t0);
    nodes.push(n, l1, l2);

    const melody: Array<[number, number, number]> = [
      [3, 440, 1.6], [4.7, 392, 0.8], [5.6, 369.99, 0.8], [6.5, 311.13, 1.3], [7.9, 293.66, 2.6],
      [12, 293.66, 1], [13.1, 311.13, 0.8], [14, 369.99, 1.4], [15.5, 392, 0.8], [16.4, 440, 2.8],
    ];
    for (const [start, freq, dur] of melody) {
      const t = t0 + start;
      const o = c.createOscillator();
      const o2 = c.createOscillator();
      const g2 = c.createGain();
      const vib = c.createOscillator();
      const vibGain = c.createGain();
      const env = c.createGain();
      const breath = noiseSource(e);
      const breathFilter = filter(e, "bandpass", freq * 3, 2);
      const breathGain = c.createGain();
      o.frequency.value = freq;
      o2.type = "triangle";
      o2.frequency.value = freq * 2;
      g2.gain.value = 0.1;
      vib.frequency.value = 5.2;
      vibGain.gain.setValueAtTime(0, t);
      vibGain.gain.linearRampToValueAtTime(freq * 0.012, t + Math.min(0.7, dur));
      vib.connect(vibGain);
      vibGain.connect(o.frequency);
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(0.12, t + 0.25);
      env.gain.setValueAtTime(0.12, t + dur);
      env.gain.linearRampToValueAtTime(0, t + dur + 0.45);
      breathGain.gain.value = 0.3;
      o.connect(env);
      o2.connect(g2);
      g2.connect(env);
      breath.connect(breathFilter);
      breathFilter.connect(breathGain);
      breathGain.connect(env);
      env.connect(out);
      const end = t + dur + 0.5;
      for (const x of [o, o2, vib, breath]) {
        x.start(t);
        x.stop(end);
        nodes.push(x);
      }
    }
  },

  // Hooves, camel bells, the murmur of the courtyard.
  kervan(e, out, t0, nodes) {
    const c = e.ctx;
    const murmur = noiseSource(e);
    const lp = filter(e, "lowpass", 380);
    const mg = c.createGain();
    mg.gain.setValueAtTime(0, t0);
    mg.gain.linearRampToValueAtTime(0.2, t0 + 10);
    murmur.connect(lp);
    lp.connect(mg);
    mg.connect(out);
    murmur.start(t0);
    nodes.push(murmur);

    const hoof = (t: number, a: number) => {
      const s = noiseSource(e);
      const f = filter(e, "bandpass", 900 + Math.random() * 300, 3);
      const g = c.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(a, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
      s.connect(f);
      f.connect(g);
      g.connect(out);
      s.start(t, Math.random());
      s.stop(t + 0.12);
      const o = c.createOscillator();
      const og = c.createGain();
      o.frequency.setValueAtTime(140, t);
      o.frequency.exponentialRampToValueAtTime(60, t + 0.08);
      og.gain.setValueAtTime(a * 0.5, t);
      og.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      o.connect(og);
      og.connect(out);
      o.start(t);
      o.stop(t + 0.12);
      nodes.push(s, o);
    };
    for (let t = 0.3; t < D - 1; t += 0.5) {
      const a = t < 8 ? 0.15 + t * 0.05 : t < 16 ? 0.55 : Math.max(0.05, 0.55 - (t - 16) * 0.08);
      hoof(t0 + t, a);
      hoof(t0 + t + 0.14, a * 0.7);
    }

    const bell = (t: number, f: number, a: number) => {
      [1, 2.76, 5.4].forEach((k, i) => {
        const o = c.createOscillator();
        const g = c.createGain();
        o.frequency.value = f * k;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(a / (i + 1), t + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0005, t + (f < 1000 ? 1.2 : 0.5));
        o.connect(g);
        g.connect(out);
        o.start(t);
        o.stop(t + 1.3);
        nodes.push(o);
      });
    };
    for (let t = 4; t < D - 2; t += 0.6 + Math.random() * 0.9) {
      const low = Math.random() < 0.3;
      bell(t0 + t, low ? 620 : 1750 + Math.random() * 400, low ? 0.1 : 0.05);
    }
  },

  // Turning pages and whispered recitation.
  medrese(e, out, t0, nodes) {
    const c = e.ctx;
    const room = noiseSource(e);
    const rl = filter(e, "lowpass", 220);
    const rg = c.createGain();
    rg.gain.value = 0.08;
    room.connect(rl);
    rl.connect(rg);
    rg.connect(out);
    room.start(t0);
    nodes.push(room);

    for (const start of [0.5, 3.5, 8, 13.2, 19]) {
      const t = t0 + start;
      const s = noiseSource(e);
      const h = filter(e, "highpass", 1800);
      const b = filter(e, "bandpass", 3000, 0.8);
      const g = c.createGain();
      b.frequency.setValueAtTime(2000, t);
      b.frequency.linearRampToValueAtTime(4500, t + 0.35);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.35, t + 0.12);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
      s.connect(h);
      h.connect(b);
      b.connect(g);
      g.connect(out);
      s.start(t, Math.random());
      s.stop(t + 0.55);
      nodes.push(s);
    }

    ([[2600, 0.22], [1900, 0.16]] as const).forEach(([f, a], voice) => {
      const s = noiseSource(e);
      const b = filter(e, "bandpass", f, 4);
      const g = c.createGain();
      g.gain.value = 0;
      s.connect(b);
      b.connect(g);
      g.connect(out);
      s.start(t0);
      nodes.push(s);
      for (let t = 5 + voice * 0.3; t < D - 1.5; ) {
        const len = 0.08 + Math.random() * 0.16;
        g.gain.setValueAtTime(0, t0 + t);
        g.gain.linearRampToValueAtTime(a, t0 + t + 0.03);
        g.gain.linearRampToValueAtTime(0, t0 + t + len);
        t += len + (Math.random() < 0.12 ? 0.8 : 0.05 + Math.random() * 0.1);
      }
    });
  },

  // Drops echoing in the dome, water poured from the basin, steam.
  hamam(e, out, t0, nodes) {
    const c = e.ctx;
    const delay = c.createDelay(1);
    const feedback = c.createGain();
    const lp = filter(e, "lowpass", 2400);
    const wet = c.createGain();
    delay.delayTime.value = 0.19;
    feedback.gain.value = 0.5;
    wet.gain.value = 0.7;
    delay.connect(lp);
    lp.connect(feedback);
    feedback.connect(delay);
    lp.connect(wet);
    wet.connect(out);

    const drip = (t: number) => {
      const o = c.createOscillator();
      const g = c.createGain();
      o.frequency.setValueAtTime(1500 + Math.random() * 400, t);
      o.frequency.exponentialRampToValueAtTime(550, t + 0.05);
      g.gain.setValueAtTime(0.22, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
      o.connect(g);
      g.connect(out);
      g.connect(delay);
      o.start(t);
      o.stop(t + 0.1);
      nodes.push(o);
    };
    for (let t = 0.2; t < D - 1; t += 0.4 + Math.random()) drip(t0 + t);

    const steam = noiseSource(e);
    const h = filter(e, "highpass", 5000);
    const sg = c.createGain();
    sg.gain.setValueAtTime(0, t0);
    sg.gain.setValueAtTime(0, t0 + 10);
    sg.gain.linearRampToValueAtTime(0.06, t0 + 11.5);
    sg.gain.linearRampToValueAtTime(0.01, t0 + 15);
    steam.connect(h);
    h.connect(sg);
    sg.connect(out);
    steam.start(t0);
    nodes.push(steam);

    for (const [a, b] of [[6, 8.5], [15, 17.5]] as const) {
      const s = noiseSource(e);
      const f = filter(e, "bandpass", 700, 0.6);
      const g = c.createGain();
      g.gain.setValueAtTime(0, t0 + a);
      g.gain.linearRampToValueAtTime(0.32, t0 + a + 0.25);
      g.gain.setValueAtTime(0.32, t0 + b - 0.6);
      g.gain.linearRampToValueAtTime(0, t0 + b);
      s.connect(f);
      f.connect(g);
      g.connect(out);
      g.connect(delay);
      s.start(t0 + a);
      s.stop(t0 + b + 0.1);
      nodes.push(s);
    }
  },
};

export function startSynth(type: CapsuleType): SynthHandle | null {
  const e = getEngine();
  if (!e) return null;
  const nodes: Node[] = [];
  const t0 = e.ctx.currentTime + 0.05;
  const out = e.ctx.createGain();
  out.gain.setValueAtTime(0, t0);
  out.gain.linearRampToValueAtTime(1, t0 + 1);
  out.gain.setValueAtTime(1, t0 + D - 3);
  out.gain.linearRampToValueAtTime(0, t0 + D);
  out.connect(e.master);
  generators[type](e, out, t0, nodes);

  return {
    stop() {
      const now = e.ctx.currentTime;
      out.gain.cancelScheduledValues(now);
      out.gain.setTargetAtTime(0, now, 0.08);
      setTimeout(() => {
        for (const n of nodes) {
          try {
            n.stop();
          } catch {
            // Already stopped on its own schedule.
          }
        }
        out.disconnect();
      }, 400);
    },
    readFrequencies(into) {
      e.analyser.getByteFrequencyData(into);
    },
  };
}
