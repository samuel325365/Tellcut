// The footage's own text in the picture (2026-10-20): ingredient labels, titles, watermarks, signs. The burned-caption check
// only knows a steady caption row at the bottom of a source; r3b-baking showed half an English label ("Raw sug") mid-panel
// that nothing reported. The film is drawn with its video tracks alone (our captions and blocks gone), sample frames are read
// with OCR, and what is read is the footage's. Text against the clip's frame edge is a warning (half a word is never meant);
// whole text is listed in one note — a shop sign or a menu is often what the shot is about.
import type { OcrLine } from '@tellcut/media-node';
import type { Project } from '@tellcut/engine';
import type { Finding } from './rules.ts';

type Times = Map<string, { start: number; end: number }>;
type Clip = { id: string; source: string; frame: number[]; defocus?: { px: number } };

/** a blurred full-screen copy under a panel (c.panel({ backdrop: 'blur' })): nobody reads it */
const isBackdrop = (c: Clip) => c.frame.every((n, i) => Math.abs(n - [0, 0, 1, 1][i]) < 1e-6) && (c.defocus?.px ?? 0) > 0;
const clips = (p: Project) => p.tracks.filter((t) => t.kind === 'video').flatMap((t) => t.items as unknown as Clip[]).filter((c) => !isBackdrop(c));

/** the project with its video tracks only, blurred backdrops left out: what is read in it is the footage's own text */
export function videoOnly(p: Project): Project {
  const q = structuredClone(p);
  q.tracks = q.tracks.filter((t) => t.kind === 'video').map((t) => ({ ...t, items: (t.items as unknown as Clip[]).filter((c) => !isBackdrop(c)) })) as unknown as Project['tracks'];
  return q;
}

/**
 * Every second, and one frame inside both ends of each clip (`edge`: a label or a subtitle a cut lets in for a moment — r3c-baking's
 * "Cre…" typed on in a clip's last 0.3 s, read one frame before the cut and not 0.12 s before it); at most `max`.
 */
export function strayTimes(p: Project, times: Times, max = 90): Array<{ t: number; edge?: true }> {
  const D = p.meta.duration, inset = 1.5 / p.meta.fps, r2 = (t: number) => Math.round(t * 100) / 100;
  const inside = (t: number) => t >= 0 && t <= D - 0.02;
  const edges = [...new Set(clips(p).filter((c) => p.sources[c.source]?.kind !== 'image').flatMap((c) => { const t = times.get(c.id)!; return t.end - t.start > 0.4 ? [r2(t.start + inset), r2(t.end - inset)] : []; }))].filter(inside);
  const seconds = Array.from({ length: Math.floor(D) }, (_, i) => i + 0.5).filter((t) => inside(t) && !edges.some((e) => Math.abs(e - t) < 0.3));
  const out = [...edges.map((t) => ({ t, edge: true as const })), ...seconds.map((t) => ({ t }))].sort((a, b) => a.t - b.t);
  return out.length > max ? out.filter((_, i) => i % Math.ceil(out.length / max) === 0) : out;
}

const CJK = /[㐀-鿿豈-﫿぀-ヿ가-힯]/g;
/** worth reporting: two CJK characters or three Latin letters (OCR reads a speck of texture as "l" or "。") */
const readable = (s: string) => (s.match(CJK)?.length ?? 0) >= 2 || (s.match(/[A-Za-z]/g)?.length ?? 0) >= 3;
const tc = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;

/**
 * What OCR read at each time (boxes x, y, w, h as fractions of the frame) as findings. A line whose box comes within 1% of the clip's
 * frame edge is cut by the crop; the same text read at several times is reported once, over its whole span.
 */
export function strayFindings(p: Project, times: Times, read: Map<number, OcrLine[]>): Finding[] {
  const list = clips(p);
  type Hit = { text: string; clip: string; cut: boolean; from: number; to: number };
  const hits: Hit[] = [];
  for (const [t, lines] of [...read].sort((a, b) => a[0] - b[0])) {
    for (const l of lines) {
      const text = l.text.trim();
      if (!readable(text)) continue;
      const [x0, y0, bw, bh] = l.box, x1 = x0 + bw, y1 = y0 + bh, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;   // x, y, w, h as fractions
      const c = list.find((c) => { const ct = times.get(c.id)!; const [fx, fy, fw, fh] = c.frame; return ct.start <= t && t < ct.end && cx >= fx && cx <= fx + fw && cy >= fy && cy <= fy + fh; });
      if (!c) continue;
      const [fx, fy, fw, fh] = c.frame, tol = 0.01;
      const cut = x0 <= Math.max(0, fx) + tol || x1 >= Math.min(1, fx + fw) - tol || y0 <= Math.max(0, fy) + tol || y1 >= Math.min(1, fy + fh) - tol;
      const same = hits.find((h) => h.clip === c.id && h.text === text && t - h.to < 1.6);
      if (same) { same.to = t; same.cut ||= cut; } else hits.push({ text, clip: c.id, cut, from: t, to: t });
    }
  }
  const out: Finding[] = [];
  for (const h of hits.filter((h) => h.cut)) out.push({ level: 'warn', t: [h.from, h.to], ids: [h.clip], msg: `原片自己的字壓在畫面框邊，可能被切掉一部分：${tc(h.from)}「${h.text}」（${h.clip}）。換時段或改 crop，讓它整個在框外，或整個留在框內` });
  const whole = hits.filter((h) => !h.cut);
  if (whole.length) out.push({ level: 'note', t: [whole[0].from, whole.at(-1)!.to], ids: [...new Set(whole.map((h) => h.clip))],
    msg: `畫面裡有原片自己的字（我們的字幕和積木不算）：${whole.slice(0, 8).map((h) => `${tc(h.from)}「${h.text}」`).join('、')}${whole.length > 8 ? ` 等 ${whole.length} 處` : ''}。招牌、菜單、商品名可以留；原片的字幕、標註、浮水印要避開或裁掉` });
  return out;
}
