// The Tellcut dachshund (spec 2026-10-30-showcase-films §1): a black and cream dog whose long body is a strip of film. Its shapes
// live here once, in a 160×80 box, as SVG path data: tools/brand-assets.ts writes the logo files from them, and common.dachshund
// draws them with Path2D, turning each part about its pivot.

export type DogRole = 'body' | 'ear' | 'mark' | 'eye' | 'nose' | 'hole';
export type DogPart = 'tail' | 'backLeg' | 'frontLeg' | 'body' | 'head';
/** one filled shape; `detail` ones are left out of the 16 px icon */
export interface DogShape { d: string; role: DogRole; part: DogPart; detail?: boolean }

export const DOG_VIEWBOX = [160, 80] as const;

const n = (v: number) => +v.toFixed(2);
/** a rounded rectangle as path data */
const rect = (x: number, y: number, w: number, h: number, r: number) =>
  `M${n(x + r)} ${n(y)} H${n(x + w - r)} A${r} ${r} 0 0 1 ${n(x + w)} ${n(y + r)} V${n(y + h - r)} A${r} ${r} 0 0 1 ${n(x + w - r)} ${n(y + h)} H${n(x + r)} A${r} ${r} 0 0 1 ${n(x)} ${n(y + h - r)} V${n(y + r)} A${r} ${r} 0 0 1 ${n(x + r)} ${n(y)} Z`;
const ellipse = (cx: number, cy: number, rx: number, ry: number) =>
  `M${n(cx - rx)} ${n(cy)} A${rx} ${ry} 0 1 1 ${n(cx + rx)} ${n(cy)} A${rx} ${ry} 0 1 1 ${n(cx - rx)} ${n(cy)} Z`;
const circle = (cx: number, cy: number, r: number) => ellipse(cx, cy, r, r);

const HOLE_X = [38, 52, 66, 80, 94], HOLE_Y = [28, 47];

export const DOG_SHAPES: readonly DogShape[] = [
  // the tail: the draft's 7-wide stroke along M30 34 Q22 27 17 15, as a filled taper with a round tip
  { d: 'M32.3 31.37 Q24.2 25.3 19.03 14.15 A2.2 2.2 0 0 0 14.97 15.85 Q19.8 28.7 27.7 36.63 Z', role: 'body', part: 'tail' },
  { d: rect(40, 48, 9, 18, 4.5), role: 'body', part: 'backLeg' },
  { d: rect(40, 59, 9, 7, 3.5), role: 'mark', part: 'backLeg', detail: true },
  { d: rect(102, 48, 9, 18, 4.5), role: 'body', part: 'frontLeg' },
  { d: rect(102, 59, 9, 7, 3.5), role: 'mark', part: 'frontLeg', detail: true },
  { d: rect(26, 24, 102, 32, 9), role: 'body', part: 'body' },
  ...HOLE_Y.flatMap((y) => HOLE_X.map((x): DogShape => ({ d: rect(x, y, 7, 5, 1.5), role: 'hole', part: 'body', detail: true }))),
  { d: ellipse(119, 47, 8, 7), role: 'mark', part: 'body', detail: true },
  { d: circle(124, 26, 15), role: 'body', part: 'head' },
  { d: rect(120, 19, 32, 15, 7.5), role: 'body', part: 'head' },
  { d: rect(134, 26, 14, 8, 4), role: 'mark', part: 'head' },
  { d: 'M115 15 Q107 18 107 30 Q107 42 114 45 Q121 42 121 30 Q121 19 115 15 Z', role: 'ear', part: 'head', detail: true },
  { d: circle(128, 15.5, 1.9), role: 'mark', part: 'head', detail: true },
  { d: circle(130, 21, 2.3), role: 'eye', part: 'head', detail: true },
  { d: circle(151, 24.5, 4), role: 'nose', part: 'head', detail: true },
];

/** where each moving part turns: the tail's root, the hips, the neck */
export const DOG_PIVOTS = { tail: [30, 34], backLeg: [44.5, 50], frontLeg: [106.5, 50], head: [118, 32] } as const;

/** the band between the two rows of holes where frames of footage go */
export const DOG_BAND = { x: 34, y: 34, w: 70, h: 12, count: 5, gap: 2 };

export type DogLook = 'light' | 'dark';
export const DOG_COLORS: Readonly<Record<DogLook, Readonly<Record<DogRole, string>>>> = {
  light: { body: '#161412', ear: '#3b342d', mark: '#d8b88a', eye: '#f4ebdd', nose: '#161412', hole: '#f4ebdd' },
  dark: { body: '#f4ebdd', ear: '#e3d5bf', mark: '#bea279', eye: '#161412', nose: '#161412', hole: '#161412' },
};

/** The dog as an SVG file. holes: 'cut' makes the sprocket holes real holes in the body (fill-rule evenodd: what `tellcut logo`
 *  extrudes), 'paint' draws them in `holeColor` (default: the tile, else the look's own). icon: a 64×64 rounded tile in `tile`
 *  with the dog in it and nothing marked detail. size: the width in px (the height follows). */
export function dogSvg(o: { look: DogLook; icon?: boolean; holes: 'paint' | 'cut'; tile?: string; holeColor?: string; size?: number }): string {
  const c = DOG_COLORS[o.look], shapes = DOG_SHAPES.filter((s) => !(o.icon && s.detail));
  const holeFill = o.holeColor ?? o.tile ?? c.hole;
  const holes = shapes.filter((s) => s.role === 'hole').map((s) => s.d).join(' ');
  const paths = shapes.flatMap((s) => {
    if (s.role === 'hole') return o.holes === 'cut' ? [] : [`<path d="${s.d}" fill="${holeFill}"/>`];
    if (o.holes === 'cut' && s.part === 'body' && s.role === 'body' && holes) return [`<path d="${s.d} ${holes}" fill="${c.body}" fill-rule="evenodd"/>`];
    return [`<path d="${s.d}" fill="${c[s.role]}"/>`];
  }).join('');
  if (o.icon) {
    const tile = o.tile ?? (o.look === 'light' ? '#f4ebdd' : '#161412'), size = o.size ? ` width="${o.size}" height="${o.size}"` : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"${size}><rect width="64" height="64" rx="14" fill="${tile}"/><g transform="translate(2.25 18.5) scale(0.35)">${paths}</g></svg>`;
  }
  const size = o.size ? ` width="${o.size}" height="${n(o.size / 2)}"` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 80"${size}>${paths}</svg>`;
}
