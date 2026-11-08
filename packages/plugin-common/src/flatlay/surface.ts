// The desk's surfaces (spec 2026-11-07-desk3d): drawn on a canvas from a fixed seed, never downloaded. Each one is a recipe first
// (plain data, normalized to a 1×1 tile, tested) and then painted; the same canvas is the colour map and the bump map. The looks
// come from the 3D spike the user picked them in: linen threads both ways with slubs, marble with grey veins, concrete with pits,
// velvet with a brushed pile.
import { rng } from '@tellcut/engine';

export type Surface = 'linen' | 'marble' | 'concrete' | 'velvet' | 'none';

/** how each surface sits in the scene: its base colour, how often the tile repeats on the desk, its roughness and bump, the light
 *  multiplier (the spike's tone-mapping exposure) and whether it is a dark surface */
export const SURFACE_LOOK: Record<Surface, { base: string; repeat: number; roughness: number; bump: number; exposure: number; dark: boolean }> = {
  linen: { base: '#e6ddcd', repeat: 5, roughness: 0.95, bump: 1.4, exposure: 1.12, dark: false },
  marble: { base: '#f1f0ed', repeat: 1, roughness: 0.45, bump: 0.2, exposure: 1.05, dark: false },
  concrete: { base: '#b7b4ae', repeat: 2, roughness: 0.95, bump: 1.4, exposure: 1.1, dark: false },
  velvet: { base: '#1c2023', repeat: 2, roughness: 1, bump: 0.3, exposure: 1.05, dark: true },
  none: { base: '#000000', repeat: 1, roughness: 1, bump: 0, exposure: 1.1, dark: false },
};

type Rgb = [number, number, number];
export interface SurfaceRecipe {
  base: string;
  /** one thread a row (weft) and a column (warp), evenly spaced, each with its darkness */
  rows: number[]; cols: number[];
  /** thicker threads across the whole tile */
  slubs: Array<{ dir: 'h' | 'v'; at: number; w: number; a: number }>;
  /** soft blots of light or dark */
  clouds: Array<{ x: number; y: number; r: number; a: number; rgb: Rgb }>;
  /** fine dots: how many, and their seed (painted from it) */
  specks: Array<{ n: number; a: number; light: boolean }>;
  /** marble's veins: a wandering line drawn as a soft wide stroke and a fine dark core */
  veins: Array<{ pts: Array<[number, number]>; w: number; rgb: Rgb }>;
  /** concrete's pits: a dark hole with a light rim on the side away from the light */
  pits: Array<{ x: number; y: number; r: number; a: number }>;
  /** velvet's pile: the direction the fibres lie, and the strands brushed that way */
  pile: [number, number] | null;
  strands: Array<{ x: number; y: number; len: number; a: number }>;
}

const empty = (base: string): SurfaceRecipe => ({ base, rows: [], cols: [], slubs: [], clouds: [], specks: [], veins: [], pits: [], pile: null, strands: [] });

function cloudsOf(r: () => number, n: number, rgb: Rgb, a: number, r0: number, r1: number) {
  return Array.from({ length: n }, () => ({ x: r(), y: r(), r: r0 + r() * (r1 - r0), a: a * r(), rgb }));
}

/** what to paint for a surface, from a seed (the same seed, the same surface) */
export function surfaceRecipe(kind: Surface, seed: number): SurfaceRecipe {
  const r = rng(seed * 7919 + 13);
  const out = empty(SURFACE_LOOK[kind].base);
  if (kind === 'linen') {
    out.rows = Array.from({ length: 512 }, () => 0.05 + r() * 0.07);
    out.cols = Array.from({ length: 512 }, () => 0.04 + r() * 0.06);
    out.slubs = Array.from({ length: 70 }, (_, i) => ({ dir: i % 2 ? 'h' as const : 'v' as const, at: r(), w: (1 + r()) / 1024, a: 0.03 + r() * 0.05 }));
    out.clouds = cloudsOf(r, 40, [255, 250, 240], 0.12, 0.08, 0.25);
    out.specks = [{ n: 9000, a: 0.12, light: false }];
  } else if (kind === 'marble') {
    out.clouds = cloudsOf(r, 70, [170, 170, 178], 0.1, 0.06, 0.3);
    for (let v = 0; v < 9; v++) {
      let x = r(), y = -0.05, ang = 0.9 + r() * 0.8;
      const pts: Array<[number, number]> = [];
      while (y < 1.05 && x > -0.1 && x < 1.1) { ang += (r() - 0.5) * 0.5; x += Math.cos(ang) * 0.014; y += Math.abs(Math.sin(ang)) * 0.014 + 0.004; pts.push([x, y]); }
      const g = 100 + Math.round(r() * 15);
      if (pts.length >= 8) out.veins.push({ pts, w: 0.6 + r(), rgb: [g, g, g] });
    }
    out.specks = [{ n: 3000, a: 0.05, light: false }];
  } else if (kind === 'concrete') {
    out.clouds = [...cloudsOf(r, 160, [90, 88, 84], 0.1, 0.03, 0.18), ...cloudsOf(r, 80, [230, 228, 222], 0.1, 0.03, 0.16)];
    out.pits = Array.from({ length: 1400 }, () => ({ x: r(), y: r(), r: (0.6 + r() * 2.4) / 1024, a: 0.25 + r() * 0.4 }));
    out.specks = [{ n: 14000, a: 0.14, light: false }, { n: 6000, a: 0.1, light: true }];
  } else if (kind === 'velvet') {
    const a = (r() - 0.5) * 0.2;
    out.pile = [Math.cos(a), Math.sin(a)];
    out.strands = Array.from({ length: 4000 }, () => ({ x: r(), y: r(), len: (18 + r() * 30) / 1024, a: r() * 0.05 }));
    out.clouds = cloudsOf(r, 30, [120, 110, 95], 0.06, 0.1, 0.31);
  }
  return out;
}

const blank = (px: number) => { const c = document.createElement('canvas'); c.width = px; c.height = px; return c; };

/** the surface painted on a px×px canvas (the colour map; the same canvas serves as the bump map); null for 'none' or without a 2D
 *  canvas */
export function paintSurface(kind: Surface, seed: number, px = 1024, make: (px: number) => HTMLCanvasElement = blank): { map: HTMLCanvasElement; bump: HTMLCanvasElement } | null {
  if (kind === 'none') return null;
  const rec = surfaceRecipe(kind, seed), c = make(px), g = c.getContext('2d');
  if (!g) return null;
  const S = px, r = rng(seed * 104729 + 7);
  g.fillStyle = rec.base; g.fillRect(0, 0, S, S);
  const step = S / Math.max(1, rec.rows.length);
  rec.rows.forEach((a, i) => { g.fillStyle = `rgba(110,90,60,${a})`; g.fillRect(0, i * step, S, Math.max(1, step / 2)); });
  rec.cols.forEach((a, i) => { g.fillStyle = `rgba(110,90,60,${a})`; g.fillRect(i * (S / rec.cols.length), 0, Math.max(1, step / 2), S); });
  for (const s of rec.slubs) { g.fillStyle = `rgba(90,70,45,${s.a})`; if (s.dir === 'h') g.fillRect(0, s.at * S, S, s.w * S); else g.fillRect(s.at * S, 0, s.w * S, S); }
  for (const k of rec.clouds) {
    const x = k.x * S, y = k.y * S, rad = k.r * S, gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, `rgba(${k.rgb.join(',')},${k.a})`); gr.addColorStop(1, `rgba(${k.rgb.join(',')},0)`);
    g.fillStyle = gr; g.fillRect(x - rad, y - rad, 2 * rad, 2 * rad);
  }
  g.lineCap = 'round';
  for (const v of rec.veins) {
    for (const [wd, a, blur] of [[7, 0.06, 4], [2.2, 0.22, 1], [0.8, 0.35, 0]] as const) {
      g.filter = blur ? `blur(${(blur * S) / 1024}px)` : 'none';
      g.strokeStyle = `rgba(${v.rgb.join(',')},${a})`; g.lineWidth = (wd * v.w * S) / 1024;
      g.beginPath(); v.pts.forEach(([x, y], i) => (i ? g.lineTo(x * S, y * S) : g.moveTo(x * S, y * S))); g.stroke();
    }
    g.filter = 'none';
  }
  for (const p of rec.pits) {
    const x = p.x * S, y = p.y * S, rad = p.r * S;
    g.fillStyle = `rgba(60,58,55,${p.a})`; g.beginPath(); g.arc(x, y, rad, 0, 7); g.fill();
    g.fillStyle = 'rgba(255,255,255,.25)'; g.beginPath(); g.arc(x + rad * 0.4, y + rad * 0.4, rad * 0.7, 0, 7); g.fill();
  }
  if (rec.pile) {
    const [dx, dy] = rec.pile;
    g.lineWidth = Math.max(1, S / 1024);
    for (const s of rec.strands) {
      const x = s.x * S, y = s.y * S, l = s.len * S, j = (r() - 0.5) * 4 * (S / 1024);
      g.strokeStyle = `rgba(150,140,125,${s.a})`; g.beginPath(); g.moveTo(x, y); g.lineTo(x + dx * l - dy * j, y + dy * l + dx * j); g.stroke();
    }
  }
  for (const sp of rec.specks) {
    const k = S / 1024;
    for (let i = 0; i < sp.n; i++) { g.fillStyle = `rgba(${sp.light ? '255,255,255' : '40,30,20'},${sp.a * r()})`; g.fillRect(r() * S, r() * S, (1 + r() * 1.5) * k, (1 + r() * 1.5) * k); }
  }
  return { map: c, bump: c };
}

export interface GoboLayers { frame: HTMLCanvasElement; leaves: HTMLCanvasElement }

/** the window the light comes through, as the two layers of a projected picture, each a soft black on transparent: the window's
 *  cross and frame, which hold still, and the leaves outside it, which sway (paintGobo moves them) */
export function goboLayers(make: (px: number) => HTMLCanvasElement = blank, px = 1024): GoboLayers {
  const frame = make(px), leaves = make(px), f = frame.getContext('2d'), l = leaves.getContext('2d'), S = px, r = rng(3);
  if (f) {
    f.filter = `blur(${(10 * S) / 1024}px)`; f.fillStyle = '#000';
    f.fillRect(S * 0.47, 0, S * 0.05, S); f.fillRect(0, S * 0.46, S, S * 0.045);
    f.fillRect(0, 0, S * 0.12, S); f.fillRect(S * 0.88, 0, S * 0.12, S); f.fillRect(0, 0, S, S * 0.1); f.fillRect(0, S * 0.9, S, S * 0.1);
    f.filter = 'none';
  }
  if (l) {
    l.filter = `blur(${(14 * S) / 1024}px)`; l.fillStyle = 'rgba(0,0,0,.55)';
    for (let i = 0; i < 26; i++) {
      const x = S * (0.6 + r() * 0.35), y = S * (0.05 + r() * 0.5);
      l.save(); l.translate(x, y); l.rotate(r() * 3); l.beginPath(); l.ellipse(0, 0, ((40 + r() * 40) * S) / 1024, ((16 + r() * 14) * S) / 1024, 0, 0, 7); l.fill(); l.restore();
    }
    l.filter = 'none';
  }
  return { frame, leaves };
}

/** the gobo (the SpotLight's map) on `c`: white light, the leaves moved by (dx, dy) (fractions of the picture), the window's frame
 *  over them. The sway is painted because three.js samples a spot light's map without the texture's offset or repeat */
export function paintGobo(c: HTMLCanvasElement, layers: GoboLayers, dx = 0, dy = 0): HTMLCanvasElement {
  const g = c.getContext('2d'), S = c.width;
  if (!g) return c;
  g.fillStyle = '#fff'; g.fillRect(0, 0, S, S);
  g.drawImage(layers.leaves, dx * S, dy * S, S, S);
  g.drawImage(layers.frame, 0, 0, S, S);
  return c;
}
