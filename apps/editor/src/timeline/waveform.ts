import type { PeakInfo } from '../store.ts';

/** The loudest peak of each of `cols` columns covering media time [from, from + dur]. */
export function peakSlice(info: PeakInfo, from: number, dur: number, cols: number): number[] {
  const out: number[] = [];
  for (let c = 0; c < cols; c++) {
    const a = Math.floor((from + (c / cols) * dur) * info.rate), b = Math.max(a + 1, Math.ceil((from + ((c + 1) / cols) * dur) * info.rate));
    let m = 0;
    for (let i = Math.max(0, a); i < Math.min(info.peaks.length, b); i++) m = Math.max(m, info.peaks[i]);
    out.push(m);
  }
  return out;
}
