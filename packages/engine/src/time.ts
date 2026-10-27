import type { Project } from './schema.ts';

export type Times = Map<string, { start: number; end: number }>;

// Stored times are 6 decimals (r6) and film times are n/fps, which are not: 38/30 is stored as 1.266667, a hair after
// frame 38, and 42/30 - 0.4 is 0.9999999999999999. Compared as they are, a clip showed its previous frame twice, a split
// left a sound on the wrong half and an item stayed one frame too long. Compare them through these.
/** how far apart two times may be and still be the same moment: the stored precision */
export const TIME_EPS = 1e-6;
/** the frame `t` seconds land on (a thousandth of a frame of slack: a boundary a hair under is still that frame) */
export const frameOf = (t: number, fps: number) => Math.floor(t * fps + 1e-3);
/** whether `t` is inside [start, end) at the stored precision: on from its first frame, off on the first frame after it */
export const activeAt = (span: { start: number; end: number }, t: number) => t >= span.start - TIME_EPS && t < span.end - TIME_EPS;

export function resolveTimes(p: Pick<Project, 'tracks'>): Times {
  const byId = new Map<string, { start: number; end: number; parent?: string }>();
  for (const tr of p.tracks) for (const it of tr.items as any[]) byId.set(it.id, it);
  const out: Times = new Map();
  const resolve = (id: string, chain: string[]): { start: number; end: number } => {
    const done = out.get(id);
    if (done) return done;
    if (chain.includes(id)) throw new Error(`Parent cycle: ${[...chain, id].join(' -> ')}`);
    const it = byId.get(id)!;
    let off = 0;
    if (it.parent !== undefined) {
      if (!byId.has(it.parent)) throw new Error(`Unknown parent "${it.parent}" for item "${id}"`);
      off = resolve(it.parent, [...chain, id]).start;
    }
    const r = { start: it.start + off, end: it.end + off };
    out.set(id, r);
    return r;
  };
  for (const id of byId.keys()) resolve(id, []);
  return out;
}
