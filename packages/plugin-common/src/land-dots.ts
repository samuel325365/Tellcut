// Dots on land for the 3D globe (common.globe): 16000 points spread evenly over the sphere (a golden-angle spiral), kept where
// Natural Earth's 1:110m land is (world110.ts), nothing south of 60°S. Made once, the first time a globe asks (as the spike's
// land.mjs did offline); each ring's bounding box is tested first, so it stays quick.
import { WORLD_LAND } from './world110.ts';

const N = 16000;
let dots: Array<[number, number]> | undefined;

function inRing(lon: number, lat: number, r: readonly number[]): boolean {
  let c = false;
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
    const xi = r[i], yi = r[i + 1], xj = r[j], yj = r[j + 1];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/** [longitude, latitude] of every dot, in degrees */
export function landDots(): Array<[number, number]> {
  if (dots) return dots;
  const boxes = WORLD_LAND.map((r) => {
    let w = 180, e = -180, s = 90, n = -90;
    for (let i = 0; i < r.length; i += 2) { w = Math.min(w, r[i]); e = Math.max(e, r[i]); s = Math.min(s, r[i + 1]); n = Math.max(n, r[i + 1]); }
    return { r, w, e, s, n };
  });
  const out: Array<[number, number]> = [];
  for (let k = 0; k < N; k++) {
    const y = 1 - (2 * (k + 0.5)) / N, lat = (Math.asin(y) * 180) / Math.PI, lon = ((k * 137.50776) % 360) - 180;
    if (lat < -60) continue;
    if (boxes.some((b) => lon >= b.w && lon <= b.e && lat >= b.s && lat <= b.n && inRing(lon, lat, b.r))) out.push([+lon.toFixed(2), +lat.toFixed(2)]);
  }
  return (dots = out);
}
