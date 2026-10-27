// WebAudio graph for a planned mix. Segment scheduling is a line-by-line port of seg() in
// the audio.js of the hand-made films Tellcut grew out of; at from = 0 it is identical to their clipSound().
import type { Mix } from '../schema.ts';
import type { SfxType } from '../plugin.ts';
import { withDefaults } from '../registry.ts';
import type { AudioPlan, PlanSeg } from './plan.ts';

export function noiseBuf(ctx: BaseAudioContext): AudioBuffer {
  const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = b.getChannelData(0);
  let s = 1234567; for (let i = 0; i < d.length; i++) { s = (s * 16807) % 2147483647; d[i] = (s / 2147483647) * 2 - 1; }
  return b;
}
export function impulse(ctx: BaseAudioContext, sec: number): AudioBuffer {
  const n = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c); let s = 99 + c * 7;
    for (let i = 0; i < n; i++) { s = (s * 16807) % 2147483647; d[i] = ((s / 2147483647) * 2 - 1) * Math.pow(1 - i / n, 3); }
  }
  return b;
}

/** Value of a linear envelope just after t (flat before the first point and after the last). At a step — two points at
 *  one time — that is the value after the step, which is what an export playing through t hears from t on. */
export function envelopeAt(pts: Array<[number, number]>, t: number): number {
  if (t < pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (t < pts[i][0]) {
    const [t0, v0] = pts[i - 1], [t1, v1] = pts[i];
    return t1 > t0 ? v0 + ((v1 - v0) * (t - t0)) / (t1 - t0) : v1;
  }
  return pts[pts.length - 1][1];
}

/** A restart inside the envelope begins at its value there, not at the first point (a censor must stay silent). */
export function envelope(param: AudioParam, pts: Array<[number, number]>, at: (t: number) => number, from: number) {
  param.setValueAtTime(envelopeAt(pts, from), Math.max(0, at(from)));
  for (const [t, v] of pts) if (t > from) param.linearRampToValueAtTime(v, Math.max(0, at(t)));
}

/** Port of the original seg(): play `buf` on [a, b] starting `off` seconds into it. */
function seg(ctx: BaseAudioContext, buf: AudioBuffer, out: AudioNode, s: PlanSeg, from: number, base: number, nodes: AudioScheduledSourceNode[]) {
  if (s.b <= from) return;
  const at = (t: number) => base + (t - from);
  const src = ctx.createBufferSource(); src.buffer = buf; src.playbackRate.value = s.rate;
  const g = ctx.createGain();
  src.connect(g);
  if (s.envelope?.length) { const e = ctx.createGain(); envelope(e.gain, s.envelope, at, from); g.connect(e); e.connect(out); } else g.connect(out);
  const start = Math.max(s.a, from);
  g.gain.setValueAtTime(0, 0);
  if (start > s.a + s.fadeIn) g.gain.setValueAtTime(s.gain, at(start));
  else {
    // a restart inside the fade-in begins at the level the fade has reached: the fade's own start can be before 0 on a context
    // that was suspended until now, and Chrome throws on a negative time (the preview did not play)
    g.gain.setValueAtTime(s.fadeIn > 0 ? (s.gain * (start - s.a)) / s.fadeIn : 0, at(start));
    g.gain.linearRampToValueAtTime(s.gain, at(s.a + s.fadeIn));
  }
  // likewise inside the fade-out: from full level it jumped up before going down
  const fadeFrom = s.b - s.fadeOut;
  g.gain.setValueAtTime(start > fadeFrom && s.fadeOut > 0 ? (s.gain * (s.b - start)) / s.fadeOut : s.gain, at(Math.max(start, fadeFrom)));
  g.gain.linearRampToValueAtTime(0, at(s.b));
  src.start(at(start), Math.max(0, s.off + (start - s.a) * s.rate));
  src.stop(at(s.b) + 0.05);
  nodes.push(src);
}

export function buildMix(ctx: BaseAudioContext, plan: AudioPlan, bufs: Map<string, AudioBuffer>, sfx: (type: string) => SfxType | undefined, mix: Mix, from: number, base: number, dest: AudioNode = ctx.destination): AudioScheduledSourceNode[] {
  const nodes: AudioScheduledSourceNode[] = [];
  const at = (t: number) => base + (t - from);
  const master = ctx.createGain(); master.gain.value = mix.master;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = mix.compressor.threshold; comp.ratio.value = mix.compressor.ratio;
  comp.attack.value = mix.compressor.attack; comp.release.value = mix.compressor.release;
  master.connect(comp).connect(dest);
  const verb = ctx.createConvolver(); verb.buffer = impulse(ctx, mix.reverb.seconds);
  const verbIn = ctx.createGain(); verbIn.gain.value = mix.reverb.send; verbIn.connect(verb).connect(master);
  const noise = noiseBuf(ctx);

  const buses = new Map<string, AudioNode>();
  for (const tr of plan.tracks) {
    const g = ctx.createGain(); g.gain.value = tr.gain;
    if (tr.envelope?.length) { const e = ctx.createGain(); envelope(e.gain, tr.envelope, at, from); g.connect(e); e.connect(master); } else g.connect(master);
    buses.set(tr.id, g);
  }
  for (const s of plan.segs) {
    const buf = bufs.get(s.buffer);
    if (buf) seg(ctx, buf, buses.get(s.track)!, s, from, base, nodes);
  }
  for (const e of plan.sfx) {
    const type = sfx(e.type);
    if (!type) { console.warn(`Unknown sfx type "${e.type}"`); continue; }
    if (e.t < from - (type.lookback ?? 0)) continue;
    let out = buses.get(e.track)!;
    if (e.gain !== 1) { const g = ctx.createGain(); g.gain.value = e.gain; g.connect(out); out = g; }
    // a sound begun before the restart is scheduled in the past (it plays on from there), but never before 0, which throws
    type.synth(ctx, { out, verb: verbIn, noise }, Math.max(0, at(e.t)), withDefaults(type.params ?? [], e.params));
  }
  return nodes;
}
