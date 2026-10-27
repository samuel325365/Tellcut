// A value that steps through levels over an item's time (common.meter, common.ambient; promoted from a deep-sea explainer short's
// effect): "秒:值[:s]" stops, comma separated. At each stop the value eases from the last one to the new one over `ease` seconds
// (`:s` jumps instead, and a number there is that stop's own ease time: "12:1257:0.8"). Both blocks read the same string, so one
// list drives the number and the background together.
import { clamp, eOut3 } from '@tellcut/engine';

export interface Level { t: number; v: number; snap: boolean; ease?: number }

/** "0:0, 4:70, 9.5:332:s, 12:400:1.5" (full-width ： and ， too) → sorted levels (a number after the value: that stop's ease time); anything that is not a number pair is left out */
export function parseLevels(s: string): Level[] {
  return String(s).split(/[,，]/).map((p) => p.trim()).filter(Boolean).map((p) => {
    const [t, v, f] = p.split(/[:：]/);
    const e = f === undefined || f.trim() === '' || f.trim() === 's' ? NaN : Number(f);
    return Number.isFinite(e) && e >= 0 ? { t: Number(t), v: Number(v), snap: false, ease: e } : { t: Number(t), v: Number(v), snap: f?.trim() === 's' };
  }).filter((x) => Number.isFinite(x.t) && Number.isFinite(x.v)).sort((a, b) => a.t - b.t);
}

/** the value at item time t */
export function levelAt(levels: Level[], t: number, ease: number): number {
  if (!levels.length) return 0;
  let i = -1;
  for (let k = 0; k < levels.length; k++) if (levels[k].t <= t + 1e-9) i = k;
  if (i <= 0) return levels[0].v;
  const cur = levels[i];
  const e = cur.ease ?? ease;
  if (cur.snap || e <= 0) return cur.v;
  const prev = levels[i - 1].v;
  return prev + (cur.v - prev) * eOut3(clamp((t - cur.t) / e));
}

/** where a value sits between 0 and `max` (0 = the largest stop): straight, or on a log scale (deep, high, big numbers); a `min`
 *  other than 0 makes the ruler run from min to max instead (years 1200–2030, heights 170–200) */
export function levelFrac(v: number, levels: Level[], max: number, scale: 'linear' | 'log', min = 0): number {
  if (min) {
    const top = max > 0 ? max : Math.max(...levels.map((l) => l.v), min + 1e-9), span = Math.max(1e-9, top - min);
    return clamp(scale === 'log' ? Math.log1p(Math.max(0, v - min)) / Math.log1p(span) : (v - min) / span);
  }
  // stops on both sides of 0 (−10 °C to 30 °C) are one ruler from the lowest to the highest (or max), straight: folding them
  // over 0 put −10 and 10 in one place. All on one side keeps the size (a depth may be written −332).
  const lo = Math.min(0, ...levels.map((l) => l.v)), hi = Math.max(0, ...levels.map((l) => l.v));
  if (lo < 0 && hi > 0) return clamp((v - lo) / Math.max(1e-9, (max > 0 ? max : hi) - lo));
  const top = max > 0 ? max : Math.max(1e-9, ...levels.map((l) => Math.abs(l.v)));
  const a = Math.abs(v);
  return clamp(scale === 'log' ? Math.log1p(a) / Math.log1p(top) : a / top);
}

/** "0:透光帶, 200:暮光帶" → the name of the last stage the value has reached */
export function parseStages(s: string): Array<{ from: number; name: string }> {
  return String(s).split(/[,，]/).map((p) => p.trim()).filter(Boolean).map((p) => {
    const i = p.search(/[:：]/);
    return { from: Number(p.slice(0, i)), name: p.slice(i + 1).trim() };
  }).filter((x) => Number.isFinite(x.from) && x.name).sort((a, b) => a.from - b.from);
}
export const stageAt = (stages: Array<{ from: number; name: string }>, v: number) => {
  let name = '';
  for (const s of stages) if (Math.abs(v) >= s.from) name = s.name;
  return name;
};
