export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
/** 0 → 1 as t goes a → b (clamped); over an empty span (b ≤ a) a step at b. */
export const prog = (t: number, a: number, b: number) => (b <= a ? (t >= b ? 1 : 0) : clamp((t - a) / (b - a)));
export const eOut3 = (p: number) => 1 - Math.pow(1 - p, 3);
export const eOut5 = (p: number) => 1 - Math.pow(1 - p, 5);
export const eIn3 = (p: number) => p * p * p;
export const eIO3 = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
export const eBack = (p: number, c = 1.5) => 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2);
/** smoothstep over 0…1 (clamped) */
export const eSmooth = (p: number) => { p = clamp(p); return p * p * (3 - 2 * p); };
/** Kyoto-style window: fade f in at a, fade f out before b. */
export const fadeWin = (t: number, a: number, b: number, f = 0.2) => Math.min(prog(t, a, a + f), 1 - prog(t, b - f, b));
/** Wedding-style window with separate fade-in / fade-out lengths. */
export const win = (t: number, a: number, b: number, fi = 0.3, fo = 0.3) => Math.min(prog(t, a, a + fi), 1 - prog(t, b - fo, b));

/** Park-Miller LCG used by both original projects (deterministic particles). */
export function rng(seed: number): () => number {
  let s = seed % 2147483647; if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}
/** Another fixed sequence in 0–1 from a seed (mulberry32). */
export function mulberry32(seed: number): () => number {
  return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** A fixed number in 0–1 for (i, k): sin-hash noise; `off` shifts it to another set. */
export const hash01 = (i: number, k = 0, off = 0) => { const x = Math.sin(i * 127.1 + k * 311.7 + off) * 43758.5453; return x - Math.floor(x); };

type El = HTMLElement & { _c?: Record<string, string>; _a?: Record<string, string> };

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string | null, html?: string | null, parent?: Element | null): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  if (parent) parent.appendChild(e);
  return e;
}
/** An absolutely placed element in `parent` (`css` after position: absolute). */
export function abs<K extends keyof HTMLElementTagNameMap = 'div'>(parent: Element, css: Record<string, string> = {}, tag: K = 'div' as K): HTMLElementTagNameMap[K] {
  const e = h(tag, null, null, parent);
  cssCamel(e, { position: 'absolute', ...css });
  return e;
}
/** Sets camelCase style keys (el.style[k] = v), skipping unchanged values. */
export function cssCamel(el: Element, props: Record<string, string>) {
  const e = el as El; const c = e._c || (e._c = {});
  for (const k in props) { const v = props[k]; if (c[k] !== v) { c[k] = v; (e.style as any)[k] = v; } }
}
/** Sets kebab-case properties / CSS variables via setProperty, skipping unchanged values. */
export function cssKebab(el: Element, props: Record<string, string>) {
  const e = el as El; const c = e._c || (e._c = {});
  for (const k in props) { const v = props[k]; if (c[k] !== v) { c[k] = v; e.style.setProperty(k, v); } }
}
export function attr(el: Element, props: Record<string, string | number>) {
  const e = el as unknown as El; const c = e._a || (e._a = {});
  for (const k in props) { const v = String(props[k]); if (c[k] !== v) { c[k] = v; el.setAttribute(k, v); } }
}
export const showCamel = (el: Element, on: boolean) => cssCamel(el, { display: on ? '' : 'none' });
/** Escapes text for interpolation into HTML/SVG markup. */
export const esc = (s: unknown) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
/** Prefixes every id defined in `svg` (and each url(#…) / href="#…" that points at one) with `${uid}-`,
 *  so two copies on one page never share an id (a reference to a copy inside a hidden layer renders nothing). */
export function scopeIds(svg: string, uid: string): string {
  // ids end up in url(#…) and href="#…": ASCII punctuation becomes _, other scripts _<hex> (片頭 and 片尾 must stay apart)
  uid = uid.replace(/[^A-Za-z0-9_-]/g, (c) => (c.charCodeAt(0) < 128 ? '_' : `_${c.charCodeAt(0).toString(16)}`));
  let out = svg;
  for (const [, id] of svg.matchAll(/\sid="([^"]+)"/g)) {
    const e = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`(\\sid=")${e}(")`, 'g'), `$1${uid}-${id}$2`)
      .replace(new RegExp(`(url\\(#)${e}(\\))`, 'g'), `$1${uid}-${id}$2`)
      .replace(new RegExp(`(href="#)${e}(")`, 'g'), `$1${uid}-${id}$2`);
  }
  return out;
}
/** A plain deep copy of JSON data (safe to reorder or push inside an immer draft). */
export const plainCopy = <T>(x: T): T => JSON.parse(JSON.stringify(x));
