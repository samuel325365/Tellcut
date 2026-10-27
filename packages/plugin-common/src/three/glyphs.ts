// Letters of a TTF as three shapes (spec 2026-10-25-brand-preset §6.2-1). Static fonts made from a variable font (Google's Inter)
// keep the variable font's overlaps: contours that overlap each other, and contours that cross themselves (Inter Bold's M, under
// its notch). A browser fills them by the nonzero rule; three triangulates each contour as a simple polygon, so a crossing one
// fills more than the letter (the M's notch came out solid). Each glyph is flattened and unioned with Clipper by nonzero first:
// what comes out is simple outlines (counter-clockwise) and holes (clockwise), which three triangulates correctly.
import type * as T from 'three';
import type ClipperLibType from 'clipper-lib';
import type { Font as OtFont } from 'opentype.js';

export interface Glyphs {
  /** the font has a drawing for this character */
  has(ch: string): boolean;
  /** how far the next letter starts, for an em of `em` units */
  advance(ch: string, em: number): number;
  /** the letter standing on y = 0 (y up), `em` units to the em */
  shapes(ch: string, em: number): T.Shape[];
}

/** Clipper works in integers: this many to the em */
const SCALE = 1e6;
/** segments a curve is flattened into */
const STEPS = 10;

type Cmd = { type: string; x?: number; y?: number; x1?: number; y1?: number; x2?: number; y2?: number };
type Pt = { X: number; Y: number };

/** the glyph's contours as polylines, y up, in em units × SCALE */
function contours(cmds: Cmd[]): Pt[][] {
  const out: Pt[][] = [];
  let cur: Pt[] = [], x = 0, y = 0;
  const put = (px: number, py: number) => { cur.push({ X: Math.round(px * SCALE), Y: Math.round(-py * SCALE) }); x = px; y = py; };
  for (const c of cmds) {
    if (c.type === 'M') { if (cur.length > 2) out.push(cur); cur = []; put(c.x!, c.y!); }
    else if (c.type === 'L') put(c.x!, c.y!);
    else if (c.type === 'Q') {
      const x0 = x, y0 = y;
      for (let i = 1; i <= STEPS; i++) { const t = i / STEPS, u = 1 - t; put(u * u * x0 + 2 * u * t * c.x1! + t * t * c.x!, u * u * y0 + 2 * u * t * c.y1! + t * t * c.y!); }
    } else if (c.type === 'C') {
      const x0 = x, y0 = y;
      for (let i = 1; i <= STEPS; i++) {
        const t = i / STEPS, u = 1 - t;
        put(u * u * u * x0 + 3 * u * u * t * c.x1! + 3 * u * t * t * c.x2! + t * t * t * c.x!, u * u * u * y0 + 3 * u * u * t * c.y1! + 3 * u * t * t * c.y2! + t * t * t * c.y!);
      }
    } else if (c.type === 'Z') { if (cur.length > 2) out.push(cur); cur = []; }
  }
  if (cur.length > 2) out.push(cur);
  return out;
}

function inside(poly: Pt[], p: Pt): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.Y > p.Y) !== (b.Y > p.Y) && p.X < ((b.X - a.X) * (p.Y - a.Y)) / (b.Y - a.Y) + a.X) c = !c;
  }
  return c;
}

export function glyphsFrom(font: OtFont, THREE: typeof import('three'), Clipper: typeof ClipperLibType): Glyphs {
  const upm = font.unitsPerEm || 1000;
  const glyph = (ch: string) => { const g = font.charToGlyph(ch); return g && g.index > 0 ? g : null; };
  return {
    has: (ch) => !!glyph(ch),
    advance: (ch, em) => ((glyph(ch)?.advanceWidth ?? 0) / upm) * em,
    shapes(ch, em) {
      const g = glyph(ch);
      if (!g) return [];
      const c = new Clipper.Clipper(), solution: Pt[][] = [];
      c.AddPaths(contours(g.getPath(0, 0, em).commands as Cmd[]), Clipper.PolyType.ptSubject, true);
      c.Execute(Clipper.ClipType.ctUnion, solution, Clipper.PolyFillType.pftNonZero, Clipper.PolyFillType.pftNonZero);
      // Clipper's outlines turn one way and its holes the other: each hole goes in the smallest outline around it (in ®, the R's
      // counter lies inside the ring's outer circle too, but belongs to the R)
      const outers = solution.filter((p) => Clipper.Clipper.Orientation(p)), holes = solution.filter((p) => !Clipper.Clipper.Orientation(p));
      const v = (p: Pt[]) => p.map((q) => new THREE.Vector2(q.X / SCALE, q.Y / SCALE));
      const shapes = outers.map((o) => ({ o, area: Math.abs(Clipper.Clipper.Area(o)), s: new THREE.Shape(v(o)) }));
      for (const h of holes) {
        let host: (typeof shapes)[number] | undefined;
        for (const x of shapes) if (inside(x.o, h[0]) && (!host || x.area < host.area)) host = x;
        if (host) host.s.holes.push(new THREE.Path(v(h)));
      }
      return shapes.map((x) => x.s);
    },
  };
}
