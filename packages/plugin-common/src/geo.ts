// Real places on a small map (from the uk-beat short): a list of cities with their longitude and latitude, a plain projection
// that fits them into a box, a graticule, and the gentle arcs a route jumps along. Shared by common.routeboard and common.mapjump;
// below them the pieces of the two real-map blocks, common.mapcam (Web Mercator over assets map photos) and common.worldmap (an
// orthographic globe): places by name, the blocks' line formats, keyframes, the projections and how their scales meet. Pure functions.
import { clamp, eIO3 } from '@tellcut/engine';
import { nl } from './text.ts';

export interface City { zh: string; en: string; lon: number; lat: number }
export type Pt = [number, number];
type G = CanvasRenderingContext2D;

export const EUROPE_TRIP = '巴黎|PARIS|2.35|48.86, 克拉科夫|KRAKÓW|19.94|50.06, 塔林|TALLINN|24.75|59.44';

/** "巴黎|PARIS|2.35|48.86, 克拉科夫|KRAKÓW|19.94|50.06" (or one a line) → cities; pieces without a number for both are dropped */
export function parseCities(s: string): City[] {
  return String(s ?? '').split(/[,，\n]/).map((x) => x.trim()).filter(Boolean).map((x) => {
    const [zh, en, lon, lat] = x.split('|').map((y) => y.trim());
    return { zh: zh ?? '', en: en ?? '', lon: Number(lon), lat: Number(lat) };
  }).filter((c) => Number.isFinite(c.lon) && Number.isFinite(c.lat));
}

export interface Bounds { lon0: number; lon1: number; lat0: number; lat1: number }
/** the cities' longitudes and latitudes, padded by 15 % (at least a degree) on every side */
export function boundsOf(cities: City[]): Bounds {
  if (!cities.length) return { lon0: -1, lon1: 27, lat0: 47, lat1: 61 };
  const lons = cities.map((c) => c.lon), lats = cities.map((c) => c.lat);
  const a = Math.min(...lons), b = Math.max(...lons), c = Math.min(...lats), d = Math.max(...lats);
  const px = Math.max(1, (b - a) * 0.15), py = Math.max(1, (d - c) * 0.15);
  return { lon0: a - px, lon1: b + px, lat0: c - py, lat1: d + py };
}

/** longitude/latitude → a point in the box [x, y, w, h] (north up; the box is filled, so the box's shape sets the map's) */
export const projector = (box: [number, number, number, number], b: Bounds) => (lon: number, lat: number): Pt =>
  [box[0] + ((lon - b.lon0) / (b.lon1 - b.lon0)) * box[2], box[1] + (1 - (lat - b.lat0) / (b.lat1 - b.lat0)) * box[3]];

/** the round degrees every `step` inside a..b */
export const degrees = (a: number, b: number, step: number) => { const out: number[] = []; for (let v = Math.ceil(a / step) * step; v <= b + 1e-9; v += step) out.push(+v.toFixed(6)); return out; };

/** a graticule step that gives 3–6 lines over `span` degrees */
export const gridStep = (span: number) => [1, 2, 5, 10, 15, 20, 30].find((s) => span / s <= 6) ?? 45;

export function graticule(g: G, P: (lon: number, lat: number) => Pt, b: Bounds, color: string, lw: number) {
  g.strokeStyle = color; g.lineWidth = lw;
  const s = gridStep(Math.max(b.lon1 - b.lon0, b.lat1 - b.lat0));
  for (const lon of degrees(b.lon0, b.lon1, s)) { const [x, a] = P(lon, b.lat1), [, c] = P(lon, b.lat0); g.beginPath(); g.moveTo(x, a); g.lineTo(x, c); g.stroke(); }
  for (const lat of degrees(b.lat0, b.lat1, s)) { const [a, y] = P(b.lon0, lat), [c] = P(b.lon1, lat); g.beginPath(); g.moveTo(a, y); g.lineTo(c, y); g.stroke(); }
}

/** a point a fraction f along a gentle arc from a to b, its middle lifted `lift` px off the chord */
export function arcPt(a: Pt, b: Pt, f: number, lift: number): Pt {
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
  const cx = mx + (dy / L) * lift, cy = my - (dx / L) * lift * (dx >= 0 ? 1 : -1), u = 1 - f;
  return [u * u * a[0] + 2 * u * f * cx + f * f * b[0], u * u * a[1] + 2 * u * f * cy + f * f * b[1]];
}
export function strokeArc(g: G, a: Pt, b: Pt, upto: number, lift: number, n = 48) {
  if (upto <= 0) return;
  g.beginPath();
  for (let i = 0; i <= n; i++) { const p = arcPt(a, b, (i / n) * upto, lift); if (i) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); }
  g.stroke();
}
export function ring(g: G, x: number, y: number, r: number, color: string, lw: number, alpha = 1) {
  g.globalAlpha = alpha; g.strokeStyle = color; g.lineWidth = lw; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1;
}
export function dot(g: G, x: number, y: number, r: number, color: string) { g.fillStyle = color; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }

/** where a city's name goes: to the left of a dot high up in the box (it would leave the top), else centred under it */
export const labelSide = (y: number, box: [number, number, number, number]) => (y - box[1] < box[3] * 0.3 ? 'left' : 'below');

export const pad2 = (n: number) => String(n).padStart(2, '0');

/** the points of a check mark drawn into a map pin's head (centre cx, cy, head radius r), and how far along it `p` (0–1) reaches */
export function pinCheckPts(cx: number, cy: number, r: number, p: number): Pt[] {
  const pts: Pt[] = [[cx - r * 0.28, cy + r * 0.02], [cx - r * 0.06, cy + r * 0.24], [cx + r * 0.32, cy - r * 0.22]];
  const L1 = Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]), L2 = Math.hypot(pts[2][0] - pts[1][0], pts[2][1] - pts[1][1]);
  const L = (L1 + L2) * Math.min(1, Math.max(0, p));
  if (L <= L1) { const q = L / L1; return [pts[0], [pts[0][0] + (pts[1][0] - pts[0][0]) * q, pts[0][1] + (pts[1][1] - pts[0][1]) * q]]; }
  const q = (L - L1) / L2;
  return [pts[0], pts[1], [pts[1][0] + (pts[2][0] - pts[1][0]) * q, pts[1][1] + (pts[2][1] - pts[1][1]) * q]];
}

export interface PinOpts { ring?: boolean; check?: number; edge?: string; ringColor?: string }
/** a teardrop map pin with its tip at (x, y), s px tall (from t2-map's lib.js): a soft shadow under the tip, an `edge` outline
 *  (white), a white ring in the head, and with `check` (0–1) a check mark drawn into the head in the pin's colour */
export function mapPin(g: G, x: number, y: number, s: number, color: string, o: PinOpts = {}) {
  const r = s * 0.36, cy = y - s + r, edge = o.edge ?? '#ffffff';
  g.save();
  g.fillStyle = 'rgba(0,0,0,0.22)'; g.beginPath(); g.ellipse(x, y, r * 0.7, r * 0.22, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.moveTo(x, y);
  g.bezierCurveTo(x - r * 0.35, y - s * 0.3, x - r, cy + r * 0.55, x - r, cy);
  g.arc(x, cy, r, Math.PI, 0);
  g.bezierCurveTo(x + r, cy + r * 0.55, x + r * 0.35, y - s * 0.3, x, y); g.closePath();
  g.fillStyle = color; g.fill(); g.lineWidth = Math.max(2, s * 0.05); g.strokeStyle = edge; g.stroke();
  if (o.ring ?? true) { g.fillStyle = o.ringColor ?? edge; g.beginPath(); g.arc(x, cy, r * 0.42, 0, Math.PI * 2); g.fill(); }
  if ((o.check ?? 0) > 0) {
    const pts = pinCheckPts(x, cy, r, o.check!);
    g.strokeStyle = color; g.lineWidth = r * 0.22; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); pts.forEach(([a, b], i) => (i ? g.lineTo(a, b) : g.moveTo(a, b))); g.stroke();
  }
  g.restore();
}

// ── shared by common.mapcam and common.worldmap ──────────────────────────────────────────────────────────────────────────────

/** a place in a block's text: a name from `places` (its Chinese or its English name, any case) or "lon,lat" */
export function placeOf(token: string, places: City[]): Pt | null {
  const s = String(token ?? '').trim();
  if (!s) return null;
  const m = s.match(/^(-?\d+(?:\.\d+)?)\s*[,，]\s*(-?\d+(?:\.\d+)?)$/);
  if (m) return [Number(m[1]), Number(m[2])];
  const low = s.toLowerCase(), c = places.find((x) => x.zh === s || x.en.toLowerCase() === low);
  return c ? [c.lon, c.lat] : null;
}
/** "巴黎>克拉科夫>19.9,50.1" → the points (names not in `places` dropped) */
export const placesOf = (s: string, places: City[]): Pt[] => String(s ?? '').split(/[>＞]/).map((x) => placeOf(x, places)).filter((p): p is Pt => !!p);
/** the city a token names, for its label (null: a bare coordinate) */
export const cityOf = (token: string, places: City[]) => { const s = String(token ?? '').trim(), low = s.toLowerCase(); return places.find((x) => x.zh === s || x.en.toLowerCase() === low) ?? null; };

/** "1.2-3.4" → [1.2, 3.4]; "2" → [2, ∞]; "" or "-" → [-∞, ∞] (there from the start) */
export function spanOf(s: string): [number, number] {
  const t = String(s ?? '').trim();
  if (!t || t === '-') return [-Infinity, Infinity];
  const m = t.match(/^(-?\d+(?:\.\d+)?)\s*(?:[-–~]\s*(-?\d+(?:\.\d+)?))?$/);
  if (!m) return [-Infinity, Infinity];
  return [Number(m[1]), m[2] === undefined ? Infinity : Number(m[2])];
}
/** a block's lines: one a line (a typed "\n" too), each split on "|", blank lines dropped */
export const rowsOf = (s: string): string[][] => nl(s).split('\n').map((x) => x.trim()).filter(Boolean).map((x) => x.split('|').map((y) => y.trim()));

/** Keyframes [t, …values] → the values at t, eased in and out between keys (held before the first and after the last). */
export function keysAt(keys: number[][], t: number, ease: (p: number) => number = eIO3): number[] | null {
  if (!keys.length) return null;
  if (t <= keys[0][0]) return keys[0].slice(1);
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) {
      const a = keys[i - 1], b = keys[i], q = ease(clamp((t - a[0]) / Math.max(1e-6, b[0] - a[0])));
      return a.slice(1).map((v, k) => v + (b[k + 1] - v) * q);
    }
  }
  return keys[keys.length - 1].slice(1);
}

/** Web Mercator at zoom 0: the world 256 units wide (`assets map`'s pixels at zoom z are these × 2^z) */
export function merc(lon: number, lat: number): Pt {
  const s = Math.sin((Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI) / 180);
  return [((lon + 180) / 360) * 256, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 256];
}
export function unmerc(x: number, y: number): Pt {
  const n = Math.PI - (2 * Math.PI * y) / 256;
  return [(x / 256) * 360 - 180, (180 / Math.PI) * Math.atan(Math.sinh(n))];
}

/** The two map blocks meet here: an orthographic globe of radius R px seen over latitude `lat` shows the ground at the scale of a
 *  Web Mercator view at zoom z (both in px of a 1080-short-side frame) — common.worldmap's log10 R ↔ common.mapcam's zoom. */
export const zoomOfRadius = (R: number, lat: number) => Math.log2((2 * Math.PI * Math.cos((lat * Math.PI) / 180) * R) / 256);
export const radiusOfZoom = (z: number, lat: number) => (256 * 2 ** z) / (2 * Math.PI * Math.cos((lat * Math.PI) / 180));

/** An orthographic projection centred on lon0/lat0, radius R px, turned `rot` degrees, centre at (cx, cy): lon/lat → [x, y, front]
 *  (front 1 on the near side; points behind the globe are pinned to its rim so a ring across the horizon stays closed). */
export function orthographic(lon0: number, lat0: number, R: number, rot: number, cx: number, cy: number, pin = true) {
  const RAD = Math.PI / 180, sp0 = Math.sin(lat0 * RAD), cp0 = Math.cos(lat0 * RAD), cr = Math.cos(rot * RAD), sr = Math.sin(rot * RAD);
  return (lon: number, lat: number): [number, number, number] => {
    const l = (lon - lon0) * RAD, p = lat * RAD, cp = Math.cos(p), sp = Math.sin(p), cl = Math.cos(l);
    let x = cp * Math.sin(l), y = cp0 * sp - sp0 * cp * cl;
    const front = sp0 * sp + cp0 * cp * cl >= 0 ? 1 : 0;
    if (pin && !front) { const m = Math.hypot(x, y) || 1; x /= m; y /= m; }
    x *= R; y *= R;
    return [cx + x * cr - y * sr, cy - (x * sr + y * cr), front];
  };
}

/** flat [lon, lat, …] rings as one path through P (rings whose samples all lie far off one side of the w×h frame skipped) */
export function ringsPath(g: G, P: (lon: number, lat: number) => ArrayLike<number>, rings: readonly (readonly number[])[], w: number, h: number) {
  g.beginPath();
  const pad = Math.max(w, h) * 1.5;
  for (const r of rings) {
    const n = r.length / 2, st = Math.max(1, Math.floor(n / 12));
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < n; i += st) { const q = P(r[2 * i], r[2 * i + 1]); x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); }
    if (n > 24 && (x1 < -pad || x0 > w + pad || y1 < -pad || y0 > h + pad)) continue;
    for (let i = 0; i < n; i++) { const q = P(r[2 * i], r[2 * i + 1]); if (i) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); }
    g.closePath();
  }
}

/** a polyline drawn to fraction f of its length: the points up to there, the head and its heading (radians) */
export function cutLine(pts: Pt[], f: number): { pts: Pt[]; head: Pt; ang: number } {
  if (!pts.length) return { pts: [], head: [0, 0], ang: 0 };
  const L = [0];
  for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const want = L[L.length - 1] * clamp(f), out: Pt[] = [pts[0]];
  let ang = pts.length > 1 ? Math.atan2(pts[1][1] - pts[0][1], pts[1][0] - pts[0][0]) : 0;
  for (let i = 1; i < pts.length; i++) {
    ang = Math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0]);
    if (L[i] <= want) { out.push(pts[i]); continue; }
    const q = (want - L[i - 1]) / Math.max(1e-9, L[i] - L[i - 1]);
    out.push([pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * q, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * q]);
    break;
  }
  return { pts: out, head: out[out.length - 1], ang };
}

/** a pin dropping in from above with a small bounce: its height offset in units of `s` at p (0 → 1 over the drop) */
export const pinDrop = (p: number) => (p <= 0 ? -1 : p < 0.7 ? -(1 - (1 - Math.pow(1 - p / 0.7, 3))) : p < 1 ? -Math.sin(((p - 0.7) / 0.3) * Math.PI) * 0.11 : 0);
