// The brand film's logo (spec 2026-10-25-brand-preset §8.1): `tellcut logo <project> <file>` copies the user's logo into the
// project and says what it is: an SVG three can extrude, or a picture that becomes a cut-out plate; whether it has a see-through
// background; its own colours (for the theme). A project fx builds it in 3D from media/brand/logo.<ext> with ThreeKit's
// loadMark (plugin-common/src/three/marks.ts), which makes the same extrude-or-plate choice.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { ffmpeg, probeSize } from './ffmpeg.ts';

export interface LogoInfo {
  kind: 'svg' | 'png' | 'jpg' | 'webp';
  width: number; height: number;
  /** a raster with a see-through background (alpha < 250 on at least 2 % of pixels) */
  transparent?: boolean;
  /** an SVG three can extrude: filled shapes only (path, rect, circle, ellipse, polygon), no <image>, no <text> */
  extrudable?: boolean;
  /** why it cannot be extruded */
  why?: string;
  /** the logo's own colours, most used first, at most 3, as #rrggbb; a plain background left out (white; an SVG's white <rect>
   *  under the whole picture; a raster's corners' colour when it is white, grey or black) */
  colors: string[];
}

const KINDS: Record<string, LogoInfo['kind']> = { '.svg': 'svg', '.png': 'png', '.jpg': 'jpg', '.jpeg': 'jpg', '.webp': 'webp' };
const hex2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
const hexOf = (r: number, g: number, b: number) => `#${hex2(r)}${hex2(g)}${hex2(b)}`;

/** #abc, #aabbcc or rgb(…) as #rrggbb; anything else (none, a gradient url, a name) null */
function colourOf(v: string): string | null {
  const s = v.trim().toLowerCase();
  let m = /^#([0-9a-f]{3})$/.exec(s);
  if (m) return `#${[...m[1]].map((c) => c + c).join('')}`;
  m = /^#([0-9a-f]{6})$/.exec(s);
  if (m) return `#${m[1]}`;
  const r = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/.exec(s);
  return r ? hexOf(+r[1], +r[2], +r[3]) : null;
}

const nearWhite = (hex: string) => [1, 3, 5].every((i) => parseInt(hex.slice(i, i + 2), 16) > 240);

/** a <rect> filled (near) white over the whole viewBox: the page the logo was drawn on, not one of its colours */
function isPage(tag: string, box: { x: number; y: number; w: number; h: number }): boolean {
  const a = (k: string) => new RegExp(`\\s${k}\\s*=\\s*["']\\s*([-\\d.]+%?)`, 'i').exec(tag)?.[1];
  const len = (v: string | undefined, full: number) => (v === undefined ? 0 : v.endsWith('%') ? (parseFloat(v) / 100) * full : Number(v));
  const fill = /\sfill\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1] ?? /fill\s*:\s*([^;"']+)/i.exec(tag)?.[1] ?? '';
  const c = /^\s*white\s*$/i.test(fill) ? '#ffffff' : colourOf(fill);
  if (!c || !nearWhite(c) || !box.w || !box.h) return false;
  const x = a('x') === undefined ? 0 : len(a('x'), box.w), y = a('y') === undefined ? 0 : len(a('y'), box.h);
  const w = len(a('width'), box.w), h = len(a('height'), box.h);
  return x <= box.x + 0.5 && y <= box.y + 0.5 && x + w >= box.x + box.w - 0.5 && y + h >= box.y + box.h - 0.5;
}

function inspectSvg(text: string): LogoInfo {
  const vb = /viewBox\s*=\s*["']\s*([-\d.]+)[\s,]+([-\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(text);
  const attr = (k: string) => { const m = new RegExp(`<svg[^>]*\\s${k}\\s*=\\s*["']([\\d.]+)`, 'i').exec(text); return m ? Number(m[1]) : 0; };
  const width = vb ? Number(vb[3]) : attr('width'), height = vb ? Number(vb[4]) : attr('height');
  const box = { x: vb ? Number(vb[1]) : 0, y: vb ? Number(vb[2]) : 0, w: width, h: height };
  const counts = new Map<string, number>();
  // a white background rect would count as often as the logo's own shapes (and come first in the file)
  const painted = text.replace(/<rect\b[^>]*>/gi, (tag) => (isPage(tag, box) ? '' : tag));
  for (const [, v] of painted.matchAll(/(?:fill|stroke)\s*[:=]\s*["']?\s*(#[0-9a-fA-F]{3,6}\b|rgb\([^)]*\))/g)) {
    const c = colourOf(v);
    if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  const colors = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c).slice(0, 3);
  const { filled, strokeOnly, gradient } = paints(text);
  const why = /<image\b/i.test(text) ? '裡面有內嵌的點陣圖' : /<text\b/i.test(text) ? '文字沒有轉成外框'
    : /<(clipPath|mask)\b/i.test(text) ? '用了 clip-path 或 mask' : gradient ? '用了漸層填色'
    : strokeOnly && !filled ? '只有描邊，沒有填色的形狀' : strokeOnly ? '有只描邊的部分（擠出時會不見）' : !filled ? '沒有填色的形狀' : undefined;
  return { kind: 'svg', width, height, extrudable: !why, ...(why ? { why } : {}), colors };
}

/** how each shape is painted, with fill and stroke inherited from <svg> and <g> and set by simple <style> class rules */
function paints(text: string): { filled: number; strokeOnly: number; gradient: number } {
  const rules = new Map<string, Record<string, string>>();
  for (const [, body] of text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) for (const [, sel, decl] of body.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const props = Object.fromEntries(decl.split(';').map((x) => x.split(':').map((y) => y.trim())).filter((x) => x.length === 2 && x[0]));
    for (const c of sel.split(',').map((x) => x.trim()).filter((x) => x.startsWith('.'))) rules.set(c.slice(1), { ...rules.get(c.slice(1)), ...props });
  }
  const own = (attrs: string): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const [, cls] of attrs.matchAll(/\sclass\s*=\s*["']([^"']*)["']/gi)) for (const c of cls.split(/\s+/)) Object.assign(out, rules.get(c));
    for (const k of ['fill', 'stroke']) { const m = new RegExp(`\\s${k}\\s*=\\s*["']([^"']*)["']`, 'i').exec(attrs); if (m) out[k] = m[1].trim(); }
    const st = /\sstyle\s*=\s*["']([^"']*)["']/i.exec(attrs);
    if (st) for (const d of st[1].split(';')) { const [k, v] = d.split(':').map((x) => x.trim()); if ((k === 'fill' || k === 'stroke') && v) out[k] = v; }
    return out;
  };
  const stack: Array<Record<string, string>> = [{ fill: '#000', stroke: 'none' }];
  let filled = 0, strokeOnly = 0, gradient = 0;
  for (const [, close, tag, attrs, self] of text.matchAll(/<(\/?)([a-zA-Z][\w:-]*)([^>]*?)(\/?)>/g)) {
    const name = tag.toLowerCase();
    if (close) { if (name === 'svg' || name === 'g') stack.pop(); continue; }
    const style = { ...stack[stack.length - 1], ...own(attrs) };
    if ((name === 'svg' || name === 'g') && !self) { stack.push(style); continue; }
    if (!/^(path|rect|circle|ellipse|polygon|polyline|line)$/.test(name)) continue;
    const fill = (style.fill ?? '#000').toLowerCase(), stroke = (style.stroke ?? 'none').toLowerCase();
    if (fill.startsWith('url(')) gradient++;
    else if (fill === 'none' || name === 'line' || name === 'polyline') { if (stroke !== 'none') strokeOnly++; }
    else filled++;
  }
  return { filled, strokeOnly, gradient };
}

async function inspectRaster(file: string, kind: LogoInfo['kind']): Promise<LogoInfo> {
  const { width, height } = await probeSize(file);
  const { stdout } = await ffmpeg(['-i', file, '-frames:v', '1', '-vf', 'scale=64:64:force_original_aspect_ratio=decrease,format=rgba', '-f', 'rawvideo', '-'], { stdout: true });
  const n = Math.floor(stdout.length / 4), px = (i: number) => [stdout[i * 4], stdout[i * 4 + 1], stdout[i * 4 + 2], stdout[i * 4 + 3]];
  let clear = 0;
  for (let i = 0; i < n; i++) if (stdout[i * 4 + 3] < 250) clear++;
  const transparent = clear / Math.max(1, n) >= 0.02;
  // the background: the corners' colour when the four agree (an opaque logo on a plain ground). The scale fits the long side to
  // 64 px, up as well as down, so the frame is 64 wide (or 64 tall) whatever the picture's size.
  const w = width >= height ? 64 : Math.max(1, Math.round(n / 64)), h = Math.max(1, Math.round(n / w));
  const corners = [0, w - 1, (h - 1) * w, h * w - 1].map((i) => px(Math.min(n - 1, Math.max(0, i))));
  const bgAgree = !transparent && corners.every((c) => c.slice(0, 3).every((v, k) => Math.abs(v - corners[0][k]) <= 12));
  // only a white, grey or black ground is left out: a coloured one filling the picture is a badge, and its colour is the brand's
  // (white letters on red)
  const ground = corners[0].slice(0, 3), neutral = Math.max(...ground) - Math.min(...ground) <= 40;
  const dropGround = bgAgree && neutral, counts = new Map<string, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i < n; i++) {
    const [r, g, b, a] = px(i);
    if (a < 250) continue;
    if (r > 240 && g > 240 && b > 240) continue;
    if (dropGround && [r, g, b].every((v, k) => Math.abs(v - ground[k]) <= 24)) continue;
    const key = `${r >> 4},${g >> 4},${b >> 4}`, c = counts.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    c.n++; c.r += r; c.g += g; c.b += b; counts.set(key, c);
  }
  const colors = [...counts.values()].sort((a, b) => b.n - a.n).slice(0, 3).map((c) => hexOf(c.r / c.n, c.g / c.n, c.b / c.n));
  return { kind, width, height, transparent, colors };
}

export async function inspectLogo(file: string): Promise<LogoInfo> {
  const kind = KINDS[extname(file).toLowerCase()];
  if (!kind) throw new Error(`商標要是 SVG、PNG、JPG、WebP：${file}`);
  return kind === 'svg' ? inspectSvg(readFileSync(file, 'utf8')) : inspectRaster(file, kind);
}

/** copy into <project>/media/brand/logo.<ext> (an older logo of any format removed first) and inspect it */
export async function importLogo(projectDir: string, file: string): Promise<{ path: string; info: LogoInfo }> {
  const kind = KINDS[extname(file).toLowerCase()];
  if (!kind) throw new Error(`商標要是 SVG、PNG、JPG、WebP：${file}`);
  // not a project (a mistyped id): nothing is created there
  if (!existsSync(join(projectDir, 'project.json'))) throw new Error(`找不到專案：${projectDir} 沒有 project.json`);
  const info = await inspectLogo(file);
  const dir = join(projectDir, 'media', 'brand'), path = `media/brand/logo.${kind}`, target = join(projectDir, path);
  // the logo already there, asked for again (new previews): kept as it is
  if (resolve(file).toLowerCase() === resolve(target).toLowerCase()) return { path, info };
  mkdirSync(dir, { recursive: true });
  // copied in first, the older logo removed after: a failed copy never leaves the project without one
  const tmp = join(dir, `.logo-new.${kind}`);
  copyFileSync(file, tmp);
  for (const f of readdirSync(dir)) if (/^logo\./i.test(f)) rmSync(join(dir, f), { force: true });
  renameSync(tmp, target);
  return { path, info };
}

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
/** the WCAG contrast ratio of two #rrggbb colours, 1 (same) to 21 (black on white) */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** A warning when the logo's main colour hardly shows on the background `bg` (the project theme's ink, the usual ground of an end
 *  card: a black logo on a dark one); null when it shows. An SVG that names no colour is black, the SVG default. */
export function logoContrastWarning(info: LogoInfo, bg: string): string | null {
  const main = info.colors[0] ?? (info.kind === 'svg' ? '#000000' : undefined), ground = colourOf(bg);
  if (!main || !ground) return null;
  const r = contrastRatio(main, ground);
  if (r >= 2) return null;
  const dark = luminance(ground) < 0.18;
  return `提醒：商標主色 ${main} 和背景 ${ground} 對比只有 ${r.toFixed(1)}:1，放上去幾乎看不見。片尾可以改用${dark ? '淺色背景（例如 #f4f1ea）' : '深色背景（例如 #0d0f14）'}，或改用${dark ? '反白' : '深色'}版的商標。`;
}
