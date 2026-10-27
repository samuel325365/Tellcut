// Colour helpers the blocks share. A block's colour param can be any CSS colour (#rgb, #rrggbb, #rrggbbaa, rgb()/rgba(), a name,
// hsl()…): hex and rgb() are read here, anything else through the browser (a canvas gives it back as #rrggbb or rgba()).
export type RGB = [number, number, number];
export type RGBA = [number, number, number, number];

const known = new Map<string, string | null>();
/** what the browser makes of a CSS colour; null outside a page or when the browser doesn't know it either */
export const browserColor = (c: string): string | null => {
  if (typeof document === 'undefined') return null;
  if (known.has(c)) return known.get(c)!;
  const g = document.createElement('canvas').getContext('2d');
  let out: string | null = null;
  if (g) { g.fillStyle = '#000'; g.fillStyle = c; out = g.fillStyle as string; }
  if (known.size > 200) known.clear();
  known.set(c, out);
  return out;
};

/** a CSS colour as [r, g, b, a] (0–255, alpha 0–1), or null when it can't be read */
export function parseColor(c: string, other: (c: string) => string | null = browserColor): RGBA | null {
  const s = String(c ?? '').trim(), m = /^#?([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(s);
  if (m) {
    const x = m[1].length <= 4 ? [...m[1]].map((d) => d + d).join('') : m[1], n = parseInt(x.slice(0, 6), 16);
    return [n >> 16, (n >> 8) & 255, n & 255, x.length === 8 ? parseInt(x.slice(6), 16) / 255 : 1];
  }
  const r = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+)(%?))?/i.exec(s);
  if (r) {
    const a = r[4] === undefined ? 1 : Math.min(1, Number(r[4]) / (r[5] ? 100 : 1));
    return [...[1, 2, 3].map((i) => Math.min(255, Math.round(Number(r[i])))), a] as RGBA;
  }
  if (s.toLowerCase() === 'transparent') return [0, 0, 0, 0];
  const b = s && other(s);
  return b && b.trim().toLowerCase() !== s.toLowerCase() ? parseColor(b, () => null) : null;
}
/** a CSS colour as RGB; black when it can't be read */
export const toRgb = (c: string, other: (c: string) => string | null = browserColor): RGB => (parseColor(c, other)?.slice(0, 3) as RGB | undefined) ?? [0, 0, 0];

/** the colour at `a` times its own alpha, as rgba() (one that can't be read is returned as is) */
export function withAlpha(color: string, a: number): string {
  const c = parseColor(color);
  if (!c) return color;
  return `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${c[3] === 1 ? a : a * c[3]})`;
}
/** a mix of two colours, as #rrggbb (when one can't be read: the nearer of the two) */
export function mixHex(a: string, b: string, p: number): string {
  const A = parseColor(a), B = parseColor(b), q = Math.min(1, Math.max(0, p));
  if (!A || !B) return p < 0.5 ? a : b;
  return `#${[0, 1, 2].map((i) => Math.round(A[i] + (B[i] - A[i]) * q).toString(16).padStart(2, '0')).join('')}`;
}
/** darkened (k < 1) or lightened toward white (k > 1), as rgb() (one that can't be read is returned as is) */
export function shade(color: string, k: number): string {
  const c = parseColor(color);
  if (!c) return color;
  const f = (v: number) => Math.round(k <= 1 ? v * k : v + (255 - v) * (k - 1));
  return `rgb(${f(c[0])}, ${f(c[1])}, ${f(c[2])})`;
}
/** each channel raised by its own amount (capped at 255), as rgb() (one that can't be read is returned as is) */
export function lift(color: string, dr: number, dg: number, db: number): string {
  const c = parseColor(color);
  if (!c) return color;
  return `rgb(${Math.min(255, c[0] + dr)}, ${Math.min(255, c[1] + dg)}, ${Math.min(255, c[2] + db)})`;
}
/** perceived brightness 0–1 (0.299 r + 0.587 g + 0.114 b), or null when it can't be read */
export const luma = (color: string): number | null => { const c = parseColor(color); return c ? (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255 : null; };
/** no colour at all: empty, `transparent`, or alpha 0 (#rrggbb00, rgba(…, 0)) */
export const isClear = (color: string | undefined) => { if (!color) return true; const c = parseColor(color); return !!c && c[3] === 0; };
