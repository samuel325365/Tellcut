// The rendered layer of `npm run check` (toolkit phase 1, spec 2026-10-16-toolkit-phase1 Task 5): where text lands on
// screen (measured by the player) and what the mix sounds like (rendered offline). Pure functions; tools/check.ts drives the page.
import { defaultSafe, type Project, type Times } from '@tellcut/engine';
import { byTime, type Finding } from './rules.ts';

export interface Rect { x: number; y: number; w: number; h: number }
export interface TextBox { id: string; rects: Rect[] }

const r3 = (t: number) => Math.round(t * 1000) / 1000;
const uniq = (ts: number[]) => [...new Set(ts.map(r3))].sort((a, b) => a - b);
/** visible items with words (their params have a `text`), with their times */
function textItems(p: Project, times: Times) {
  return p.tracks.filter((t) => (t.kind === 'overlay' || t.kind === 'scene') && !t.muted).flatMap((t) => t.items as any[])
    .filter((it) => typeof it.params?.text === 'string' && it.params.text.trim()).map((it) => ({ it, s: times.get(it.id)!.start, e: times.get(it.id)!.end }));
}

/** a text block's entrance when it does not say how long (common.header slides in over 0.35 s) and its exit */
const ENTER = 0.45, EXIT = 0.3;

/** When to measure text: once each item's entrance animation is over, and in its middle. */
export function sampleTimes(p: Project, times: Times): number[] {
  return uniq(textItems(p, times).flatMap(({ it, s, e }) => {
    const own = [it.params.animDur, it.params.popDur].find((x) => typeof x === 'number') as number | undefined;
    return [s + Math.min((own ?? ENTER) + 0.1, (e - s) / 2), (s + e) / 2];
  }));
}

/**
 * Per text item, when it stands still: after its entrance (its own animDur / popDur, else ENTER), before its exit. A text
 * judged while it slides in or pops would read as outside the safe area or on top of another (seen on the Seattle sample's
 * header): layoutChecks looks at a text only inside this window.
 */
export function settledWindows(p: Project, times: Times): Map<string, [number, number]> {
  const out = new Map<string, [number, number]>();
  for (const { it, s, e } of textItems(p, times)) {
    const own = [it.params.animDur, it.params.popDur].find((x) => typeof x === 'number') as number | undefined, len = e - s;
    out.set(it.id, [s + Math.min(own ?? ENTER, len / 2), e - Math.min(EXIT, len / 2)]);
  }
  return out;
}

/** The check sheet's frames: twelve across the film plus each text item's middle, sixteen at most. */
export function sheetTimes(p: Project, times: Times): number[] {
  const D = p.meta.duration, even = Array.from({ length: 12 }, (_, k) => ((k + 0.5) * D) / 12);
  const gap = Math.min(1, D / 36);   // a third of the spacing of the twelve, at most a second
  let mids = uniq(textItems(p, times).map(({ s, e }) => (s + e) / 2)).filter((m) => even.every((x) => Math.abs(x - m) >= gap));
  if (mids.length > 4 && even.length + mids.length > 16) mids = Array.from({ length: 4 }, (_, k) => mids[Math.round((k * (mids.length - 1)) / 3)]);
  return uniq([...even, ...mids]);
}

const MARGIN = 0.05;
const hits = (a: Rect, b: Rect) => Math.min(a.x + a.w, b.x + b.w) > Math.max(a.x, b.x) && Math.min(a.y + a.h, b.y + b.h) > Math.max(a.y, b.y);

export function layoutChecks(samples: Array<{ t: number; boxes: TextBox[] }>, o: { W: number; H: number; spans: Times; /** settledWindows: a text outside its window is moving and not judged */ settled?: Map<string, [number, number]> }): Finding[] {
  // the platform's own buttons and caption (9:16 only: a 4:5 or 1:1 film sits in a feed with nothing over it), in the numbers the
  // theme keeps its blocks clear of (defaultSafe): one source for guides/genres/README.md, the theme and check (review3 R3-H7)
  const { W, H } = o, portrait = H / W >= 1.5, safe = defaultSafe(W, H);
  const span = (id: string): [number, number] => { const t = o.spans.get(id); return t ? [r3(t.start), r3(t.end)] : [0, 0]; };
  const outside = new Map<string, Set<string>>(), platform = new Map<string, Set<string>>(), pairs = new Map<string, [string, string]>();
  const add = (m: Map<string, Set<string>>, id: string, side: string) => { if (!m.has(id)) m.set(id, new Set()); m.get(id)!.add(side); };
  for (const s0 of samples) {
    const still = (id: string) => { const w = o.settled?.get(id); return !w || (s0.t >= w[0] - 1e-3 && s0.t <= w[1] + 1e-3); };
    const s = { t: s0.t, boxes: s0.boxes.filter((b) => still(b.id)) };
    for (const b of s.boxes) for (const r of b.rects) {
      if (r.w <= 0 || r.h <= 0) continue;
      if (r.x < MARGIN * W) add(outside, b.id, '左邊');
      if (r.x + r.w > (1 - MARGIN) * W) add(outside, b.id, '右邊');
      if (r.y < MARGIN * H) add(outside, b.id, '上方');
      if (r.y + r.h > (1 - MARGIN) * H) add(outside, b.id, '下方');
      if (portrait && r.x + r.w > (1 - safe.side) * W) add(platform, b.id, '右側');
      if (portrait && r.y + r.h > (1 - safe.bottom) * H) add(platform, b.id, '下方');
    }
    for (let i = 0; i < s.boxes.length; i++) for (let j = i + 1; j < s.boxes.length; j++) {
      const [a, b] = [s.boxes[i], s.boxes[j]];
      if (a.id === b.id || !a.rects.some((x) => b.rects.some((y) => hits(x, y)))) continue;
      const pair = [a.id, b.id].sort() as [string, string];
      pairs.set(pair.join('|'), pair);
    }
  }
  const out: Finding[] = [];
  for (const [id, sides] of outside) out.push({ level: 'error', t: span(id), ids: [id], msg: `文字超出安全區（${[...sides].join('、')}）（${id}）` });
  // the platform area: one line per side (a film's captions usually all sit at the same height)
  const groups = new Map<string, string[]>();
  for (const [id, sides] of platform) if (!outside.has(id)) { const k = [...sides].join('、'); groups.set(k, [...(groups.get(k) ?? []), id]); }
  for (const [sides, ids] of groups) {
    const ts = ids.map(span), names = ids.length > 5 ? `${ids.slice(0, 5).join('、')}…` : ids.join('、');
    out.push({ level: 'note', t: [Math.min(...ts.map((x) => x[0])), Math.max(...ts.map((x) => x[1]))], ids,
      msg: `${ids.length > 1 ? `${ids.length} 個文字` : '文字'}在短影音平台的介面區（${sides}），可能被按鈕或說明蓋住（${names}）` });
  }
  for (const [a, b] of pairs.values()) {
    const [sa, sb] = [span(a), span(b)];
    out.push({ level: 'warn', t: [Math.max(sa[0], sb[0]), Math.min(sa[1], sb[1])], ids: [a, b], msg: `文字互相重疊（${a}、${b}）` });
  }
  return byTime(out);
}

/** The mix: samples at full scale (clipping), and two seconds or more of near silence (−50 dBFS RMS over 1 s windows). */
export function audioChecks(channels: Float32Array[], rate: number): Finding[] {
  const out: Finding[] = [], n = Math.min(...channels.map((c) => c.length));
  // clipped samples less than half a second apart make one stretch; its longest unbroken run decides: under 50 ms the
  // spikes are barely heard, longer is distortion
  let from = -1, to = -1, run = 0, longest = 0;
  const flush = () => {
    if (from >= 0) out.push(longest / rate < 0.05 ? { level: 'warn', t: [r3(from / rate), r3((to + 1) / rate)], msg: '瞬間爆音（音量到頂）' }
      : { level: 'error', t: [r3(from / rate), r3((to + 1) / rate)], msg: '爆音（音量到頂）' });
    from = -1; longest = 0;
  };
  for (let i = 0; i < n; i++) {
    if (!channels.some((c) => Math.abs(c[i]) >= 0.999)) continue;
    if (from >= 0 && i - to > rate / 2) flush();
    run = from >= 0 && i === to + 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    if (from < 0) from = i;
    to = i;
  }
  flush();
  const quiet = 10 ** (-50 / 20);
  let quietFrom = -1;
  const end = (w: number) => { if (quietFrom >= 0 && w - quietFrom >= 2) out.push({ level: 'warn', t: [quietFrom, w], msg: '沒有聲音' }); quietFrom = -1; };
  const windows = Math.floor(n / rate + 0.5);
  for (let w = 0; w < windows; w++) {
    const a = w * rate, b = Math.min(n, a + rate);
    const rms = Math.max(...channels.map((c) => { let s = 0; for (let i = a; i < b; i++) s += c[i] * c[i]; return Math.sqrt(s / Math.max(1, b - a)); }));
    if (rms < quiet) { if (quietFrom < 0) quietFrom = w; } else end(w);
  }
  end(windows);
  return byTime(out);
}

/** Items that move through the whole frame on purpose (an emoji rain) or are the platform's own frame (common.reels: its account,
 *  buttons and nav bar sit where the app's would; common.album: its status bar, tab bar and date bubble; common.chat: its header, input bar and sticker panel; common.search: its status bar, box, tabs and cards): the safe-area and overlap checks leave them out. */
export function fallingIds(p: { tracks: Array<{ items: unknown[] }> }): Set<string> {
  const out = new Set<string>();
  for (const t of p.tracks) for (const it of t.items as Array<{ id: string; type?: string; params?: { mode?: string } }>) if ((it.type === 'common.emoji' && it.params?.mode === 'rain') || it.type === 'common.reels' || it.type === 'common.album' || it.type === 'common.chat' || it.type === 'common.search') out.add(it.id);
  return out;
}

/** a Noto Sans TC line box is 1.45 times the type size (measured in the player: 66 px for 45.4 px type, 72 for 49.7) */
const LINE_BOX = 1.45;
/**
 * guides/quality.md: words on screen at least 48 px tall, on a 1080 short side (review3 R3-H3: a rule nothing enforced, and the
 * caption default was 45 px on 16:9). A caption's largest line is its words; a name tag or a gloss under it is smaller on purpose.
 */
export function captionSizeChecks(samples: Array<{ t: number; boxes: TextBox[] }>, o: { W: number; H: number; captions: Set<string> }): Finding[] {
  const k = Math.min(o.W, o.H) / 1080, tall = new Map<string, number>();
  for (const s of samples) for (const b of s.boxes) if (o.captions.has(b.id)) tall.set(b.id, Math.max(tall.get(b.id) ?? 0, ...b.rects.map((r) => r.h)));
  const small = [...tall].filter(([, h]) => h / LINE_BOX < 48 * k - 0.5);
  if (!small.length) return [];
  const px = Math.round(Math.min(...small.map(([, h]) => h)) / LINE_BOX / k), need = Math.ceil(((48 * k) / o.H) * 1000) / 10;
  return [{ level: 'warn', ids: small.map(([id]) => id), msg: `字幕的字太小：字高約 ${px} px（以 1080 計），至少要 48 px（${small.slice(0, 4).map(([id]) => id).join('、')}${small.length > 4 ? ` 等 ${small.length} 個` : ''}）。把字調大（size 至少 ${need.toFixed(1)}）` }];
}
