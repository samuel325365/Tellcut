// The model layer of `npm run check` (toolkit phase 1, spec 2026-10-16-toolkit-phase1 Task 4): what the project file alone
// tells (parseProject already refuses items that end before they start) — offline material, black frames, items past the end, empty text, music stopping early, captions vs speech.
import { isAbsolute, relative, resolve } from 'node:path';
import { allItems, envelopeAt, resolveTimes, soundFiles, type Project, type Transcript } from '@tellcut/engine';
import { timecode1 } from '@tellcut/media-node';
import { PANEL_FRAME } from '@tellcut/plugin-common';
import { heardSpeech } from '../cut/mix.ts';

export type Level = 'error' | 'warn' | 'note';
export interface Finding { level: Level; t?: [number, number]; ids?: string[]; msg: string; /** 'offline': material the page layer needs is missing (report.ts isOffline) */ code?: 'offline' }
export interface ModelInput { exists(path: string): boolean; transcripts: Record<string, Transcript | null>; /** font families the registered plugins bring along (toolkit phase 2b: theme fonts outside them are not downloaded) */ knownFonts?: string[] }

const r3 = (t: number) => Math.round(t * 1000) / 1000;
/** overlay blocks that are a deliberate picture of their own (words on the background) */
const CARDS = new Set(['core.title', 'core.endCard']);
const overlap = (a: [number, number], b: [number, number]) => Math.max(0, Math.min(a[1], b[1]) - Math.max(a[0], b[0]));
/** How alike two lines read (0–1): shared characters, ignoring spaces, punctuation and case (Dice over character counts). */
export function similarity(a: string, b: string): number {
  const norm = (s: string) => [...s.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '')];
  const x = norm(a), y = norm(b);
  if (!x.length || !y.length) return 0;
  const count = new Map<string, number>();
  for (const ch of x) count.set(ch, (count.get(ch) ?? 0) + 1);
  let common = 0;
  for (const ch of y) { const n = count.get(ch) ?? 0; if (n > 0) { common++; count.set(ch, n - 1); } }
  return (2 * common) / (x.length + y.length);
}
/** untimed findings first, then by start time (stable) */
export const byTime = (f: Finding[]) => [...f].sort((a, b) => (a.t ? a.t[0] : -Infinity) - (b.t ? b.t[0] : -Infinity));

export function modelChecks(p: Project, o: ModelInput): Finding[] {
  const out: Finding[] = [], times = resolveTimes(p), frame = 1 / p.meta.fps, D = p.meta.duration;
  const span = (id: string): [number, number] => { const t = times.get(id)!; return [r3(t.start), r3(t.end)]; };

  // offline material the film uses
  const used = { sources: new Set<string>(), media: new Set<string>() };
  for (const tr of p.tracks) for (const it of tr.items as any[]) {
    if ((tr.kind === 'video' || tr.kind === 'audio') && it.source) used.sources.add(it.source);
    if (tr.kind === 'music') used.media.add(it.media);
  }
  for (const id of used.sources) { const s = p.sources[id]; if (s && !o.exists(s.path)) out.push({ level: 'error', code: 'offline', msg: `素材離線：${id}（${s.path}）` }); }
  for (const id of used.media) { const m = p.media[id]; if (m && !o.exists(m.path)) out.push({ level: 'error', code: 'offline', msg: `音樂離線：${id}（${m.path}）` }); }
  for (const path of soundFiles(p)) if (!o.exists(path)) out.push({ level: 'error', code: 'offline', msg: `音效檔離線：${path}` });

  // black frames: what no picture covers. A title or end card over the background is a choice (it counts as picture);
  // other layers over a gap (grain, a flash, a caption) are not a picture: such a gap is asked about instead of passed.
  const visible = p.tracks.filter((t) => !t.muted);
  const overlays = visible.filter((t) => t.kind === 'overlay').flatMap((t) => t.items as any[]);
  const pics = [...visible.filter((t) => t.kind === 'video' || t.kind === 'scene').flatMap((t) => t.items as any[]), ...overlays.filter((it) => CARDS.has(it.type))]
    .map((it) => ({ id: it.id, s: span(it.id) })).filter((x) => x.s[1] > x.s[0]).sort((a, b) => a.s[0] - b.s[0]);
  let reach = 0, last: string | null = null;
  const gap = (a: number, b: number, next: string | null) => {
    if (b - a < frame * 0.999) return;
    const t: [number, number] = [r3(a), r3(b)];
    const over = overlays.filter((it) => !CARDS.has(it.type) && overlap(span(it.id), t) > 0).sort((x, y) => span(x.id)[0] - span(y.id)[0]).map((it) => it.id);
    if (over.length) { out.push({ level: 'warn', t, ids: over, msg: `黑底上只有疊加層（${over.join('、')}）：確認這段沒有畫面是刻意的` }); return; }
    const where = a <= 0 ? '片頭' : !next ? '片尾' : `${last} 與 ${next} 之間`;
    out.push({ level: 'error', t, msg: `黑畫面（${where}）` });
  };
  for (const x of pics) {
    // an item starting at or past the film's end leaves the gap before it at the end of the film, not between two clips
    if (x.s[0] > reach) gap(reach, Math.min(x.s[0], D), x.s[0] >= D - 1e-6 ? null : x.id);
    if (x.s[1] >= reach) { reach = x.s[1]; last = x.id; }
    if (reach >= D) break;
  }
  if (reach < D) gap(reach, D, null);

  // item times and empty text
  for (const tr of p.tracks) for (const it of tr.items as any[]) {
    const s = span(it.id);
    if (tr.kind !== 'music' && s[1] > D + frame) out.push({ level: 'error', t: s, ids: [it.id], msg: `超出片長 ${r3(D)} 秒（${it.id}）` });
    if (it.params && typeof it.params.text === 'string' && !it.params.text.trim()) out.push({ level: 'warn', t: s, ids: [it.id], msg: `文字是空的（${it.id}）` });
  }

  // music that stops before the film does (narration sits on a music track too, but is not a bed that should last)
  const isNarration = (t: (typeof p.tracks)[number]) => t.kind === 'music' && (t.id === 'voice' || t.name === 'Narration' || t.name === '旁白');
  const music = p.tracks.filter((t) => t.kind === 'music' && !t.muted && !isNarration(t)).flatMap((t) => t.items as any[]);
  if (music.length && !music.some((m) => m.toEnd)) {
    const end = Math.max(...music.map((m) => span(m.id)[1]));
    if (end < D - 1) out.push({ level: 'warn', t: [end, r3(D)], msg: `配樂在 ${timecode1(end)} 就停了，片長 ${timecode1(D)}` });
  }

  // captions vs speech: sentences actually heard, in timeline time — from the sound items that play (a clip's own sound, as the
  // mix plays it: muted tracks, solo and muted items count), not from the video clips: a clip with sound:false or its sound
  // track muted says nothing
  const heard = heardSpeech(p, (src) => o.transcripts[src], span).map((h) => ({ clip: h.item.parent ?? h.item.id, t: [r3(h.t[0]), r3(h.t[1])] as [number, number], text: h.text }));
  // only a caption that says what is heard nearby is a speech caption; narration (words nobody says) is not timed
  const captions = p.tracks.filter((t) => (t.kind === 'overlay' || t.kind === 'scene') && !t.muted).flatMap((t) => t.items as any[])   // a hidden track shows nothing
    // the plain caption and the toolkit's (recipes and the page chat use common.caption); its 【】{} marks are not words
    .filter((it) => /^(core|common)\.caption$/.test(it.type) && typeof it.params?.text === 'string')
    .map((it) => ({ id: it.id, t: span(it.id), text: String(it.params.text).replace(/[【】{}]/g, '') }));
  const matched = new Set<(typeof heard)[number]>();
  for (const c of captions) {
    const near = heard.filter((h) => h.t[1] > c.t[0] - 10 && h.t[0] < c.t[1] + 10).map((h) => ({ h, sim: similarity(c.text, h.text) }));
    const top = Math.max(0, ...near.map((x) => x.sim));
    if (top < 0.6) continue;
    // a phrase said more than once is the time it is nearest to (kao1's 這個深度 was matched to its first time, 10 s earlier)
    const mid = (t: [number, number]) => (t[0] + t[1]) / 2;
    const best = near.filter((x) => x.sim >= top - 0.1).sort((a, b) => Math.abs(mid(a.h.t) - mid(c.t)) - Math.abs(mid(b.h.t) - mid(c.t)))[0];
    matched.add(best.h);
    // against the shorter of the two: a caption joining two lines, or showing part of a long one, is on time while it is said
    const len = Math.min(c.t[1] - c.t[0], best.h.t[1] - best.h.t[0]);
    if (overlap(best.h.t, c.t) / len < 0.5)
      out.push({ level: 'warn', t: c.t, ids: [c.id], msg: `字幕時間沒對上講話：「${c.text.trim()}」在 ${timecode1(best.h.t[0])}–${timecode1(best.h.t[1])}（${c.id}）` });
  }
  // in a clip whose speech is captioned, a long sentence no caption covers was probably missed
  const captioned = new Set([...matched].map((h) => h.clip));
  for (const h of heard) {
    if (!captioned.has(h.clip) || matched.has(h) || h.t[1] - h.t[0] < 1.5) continue;
    const covered = captions.reduce((n, c) => n + overlap(h.t, c.t), 0);
    if (covered / (h.t[1] - h.t[0]) < 0.3) out.push({ level: 'note', t: h.t, msg: `可能漏字幕：「${h.text}」` });
  }
  // toolkit phase 2c: a panel border drawn around a rectangle the video does not fill leaves a gap or covers the picture
  const PANEL = { x: PANEL_FRAME[0], y: PANEL_FRAME[1], w: PANEL_FRAME[2], h: PANEL_FRAME[3] };   // the defaults of common.panel
  for (const tr of p.tracks) if (tr.kind === 'overlay') for (const it of tr.items as Array<{ id: string; type: string; params: Record<string, number | undefined> }>) {
    if (it.type !== 'common.panel') continue;
    const want = [it.params.x ?? PANEL.x, it.params.y ?? PANEL.y, it.params.w ?? PANEL.w, it.params.h ?? PANEL.h], pt = times.get(it.id)!;
    // a blurred full-screen copy is the backdrop under the panel (c.panel({ backdrop: 'blur' })), not a clip the border misses
    const backdrop = (v: { frame: number[]; defocus?: { px: number } }) => v.frame.every((n, i) => Math.abs(n - [0, 0, 1, 1][i]) < 1e-6) && (v.defocus?.px ?? 0) > 0;
    const bad = p.tracks.filter((t) => t.kind === 'video').flatMap((t) => t.items as Array<{ id: string; frame: number[]; defocus?: { px: number } }>)
      .filter((v) => { const vt = times.get(v.id)!; return !backdrop(v) && vt.end > pt.start + 1e-6 && vt.start < pt.end - 1e-6 && v.frame.some((n, i) => Math.abs(n - want[i]) > 0.002); });
    if (bad.length) out.push({ level: 'warn', t: span(it.id), ids: [it.id], msg: `面板外框（${it.id}）的位置和影片的 frame 對不上（${bad.slice(0, 3).map((v) => v.id).join('、')}${bad.length > 3 ? ` 等 ${bad.length} 段` : ''}）：框會露縫或壓到畫面；x,y,w,h 要等於影片的 frame` });
  }
  // a clip whose frame is off screen (r3b-baking: a panel frame given in pixels pushed every clip out of the picture, and
  // nothing said so): all of it is an error, more than half a warning
  for (const tr of p.tracks) if (tr.kind === 'video') for (const v of tr.items as Array<{ id: string; frame: number[] }>) {
    const [x, y, w, h] = v.frame, seen = (Math.max(0, Math.min(1, x + w) - Math.max(0, x)) * Math.max(0, Math.min(1, y + h) - Math.max(0, y))) / (w * h);
    const px = v.frame.some((n) => Math.abs(n) > 1.5) ? '；frame 是畫面的比例（0–1），這組數字看起來是像素' : '';
    if (seen <= 0) out.push({ level: 'error', t: span(v.id), ids: [v.id], msg: `影片 ${v.id} 的 frame [${v.frame.join(', ')}] 整個在畫面外，看不到${px}` });
    else if (seen < 0.5) out.push({ level: 'warn', t: span(v.id), ids: [v.id], msg: `影片 ${v.id} 的 frame [${v.frame.join(', ')}] 只有 ${Math.round(seen * 100)}% 在畫面裡${px}` });
  }
  // toolkit phase 3: narration the music is not quiet enough under (levels from the clip and track gains and any dip envelope;
  // generated music and edge-tts speech come out at similar loudness, so 6 dB below the voice is the floor)
  const trackGain = (t: unknown) => (t as { gain?: number }).gain ?? 0;
  const narration = p.tracks.filter(isNarration);
  const beds = p.tracks.filter((t) => t.kind === 'music' && !narration.includes(t));
  for (const vt of narration) for (const v of vt.items as Array<{ id: string; gain: number }>) {
    const tv = times.get(v.id)!, mid = (tv.start + tv.end) / 2, voiceDb = v.gain + trackGain(vt);
    for (const bt of beds) for (const m of bt.items as Array<{ id: string; gain: number; envelope?: Array<[number, number]> }>) {
      const tm = times.get(m.id)!;
      if (mid < tm.start || mid >= tm.end) continue;
      const musicDb = m.gain + trackGain(bt) + (m.envelope?.length ? envelopeAt(m.envelope, mid - tm.start) : 0);
      if (musicDb > voiceDb - 6) out.push({ level: 'warn', t: span(v.id), ids: [v.id, m.id], msg: `旁白可能被配樂蓋過（${v.id}：配樂只比旁白小 ${(voiceDb - musicDb).toFixed(0)} dB）；配樂調小，或用 c.duck() 壓低` });
    }
  }
  // pacing (2026-10-18, rules after OpenMontage's short-form craft): what makes a short feel slow or slideshow-like, from the file alone
  // common.chat's items are lines "seconds|who|words|kind|key=value": only the words (and a link card's sub=) are read
  const chatWords = (s: string) => String(s).replace(/\\n/g, '\n').split('\n').map((l) => { const f = l.split('|'); return [f[2] ?? '', ...f.slice(3).filter((x) => /^\s*sub=/.test(x)).map((x) => x.replace(/^\s*sub=/, ''))].join(' '); }).join(' ');
  const textOf = (it: any) => it.type === 'common.chat' ? chatWords(it.params?.items ?? '').replace(/\//g, ' ').trim() : ['text', 'label', 'plate', 'tags', 'title', 'items'].map((k) => it.params?.[k]).filter((v) => typeof v === 'string').join(' ').replace(/[【】{}\n]/g, ' ').trim();
  const shown = p.tracks.filter((t) => (t.kind === 'overlay' || t.kind === 'scene') && !t.muted).flatMap((t) => (t.items as any[]).map((it) => ({ it, s: span(it.id) })));
  // a short (portrait, up to 3 minutes) that says nothing in its first second: the viewer has already swiped
  if (p.meta.height > p.meta.width && D <= 180) {
    const said = heard.some((h) => h.t[0] < 1) || narration.some((t) => (t.items as any[]).some((v) => span(v.id)[0] < 1));
    if (!said && !shown.some(({ it, s }) => s[0] < 1 && textOf(it))) out.push({ level: 'warn', t: [0, 1], msg: '開頭第一秒沒有字也沒有人說話：短影音的觀眾在第一秒決定要不要滑走；第一秒就放一句字卡／爆字，或從講話的地方開始' });
  }
  // a word card (not a caption: those follow the speech) shorter than it takes to read: Chinese ≈ 9 characters a second, Latin ≈ 17
  for (const { it, s } of shown) {
    if (/^(core|common)\.caption$/.test(it.type)) continue;
    const words = textOf(it).replace(/[\s\p{P}\p{S}]/gu, ''), cjk = [...words].filter((ch) => /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(ch)).length;
    if (!words) continue;
    const need = 0.4 + cjk / 9 + ([...words].length - cjk) / 17, dur = s[1] - s[0];
    if (dur < need - 0.05) out.push({ level: 'warn', t: s, ids: [it.id], msg: `字卡「${textOf(it).replace(/\s+/g, ' ').slice(0, 24)}」只出現 ${dur.toFixed(1)} 秒，讀完約要 ${need.toFixed(1)} 秒（${it.id}）：拉長、或減少字數` });
  }
  const main = (p.tracks.find((t) => t.kind === 'video' && (t as any).magnetic) ?? p.tracks.find((t) => t.kind === 'video' && !t.muted));
  const shots = ((main?.items ?? []) as any[]).filter((c) => c.parent === undefined).map((c) => ({ c, s: span(c.id) })).sort((a, b) => a.s[0] - b.s[0]);
  // a photo that holds still: no zoom, no pan
  for (const { c, s } of shots) {
    const same = (k: 'x' | 'y' | 'zoom') => Math.abs(c.crop.from[k] - c.crop.to[k]) < 1e-3;
    if (p.sources[c.source]?.kind === 'image' && s[1] - s[0] > 4 && same('x') && same('y') && same('zoom') && !c.crop.keys?.length)
      out.push({ level: 'warn', t: s, ids: [c.id], msg: `照片 ${c.id} 停了 ${(s[1] - s[0]).toFixed(1)} 秒完全沒動：加推近或平移（crop 的 from／to），或縮短` });
  }
  // five or more shots in a row of the same length: a slideshow rhythm
  for (let i = 0; i < shots.length; ) {
    let j = i + 1, lo = shots[i].s[1] - shots[i].s[0], hi = lo;
    while (j < shots.length) { const d = shots[j].s[1] - shots[j].s[0]; if (Math.max(hi, d) > Math.min(lo, d) * 1.08) break; lo = Math.min(lo, d); hi = Math.max(hi, d); j++; }
    if (j - i >= 5) out.push({ level: 'note', t: [shots[i].s[0], shots[j - 1].s[1]], ids: shots.slice(i, j).map((x) => x.c.id), msg: `連續 ${j - i} 個鏡頭都差不多 ${lo.toFixed(1)} 秒長，節奏像幻燈片：重要的鏡頭停久一點、過場的短一點` });
    i = j;
  }
  // toolkit phase 2b: the common blocks take their look from the project theme
  const usesCommon = allItems(p).some(({ item }) => (item as { type?: string }).type?.startsWith('common.'));
  if (usesCommon && !p.meta.theme) out.push({ level: 'note', msg: '用了共用積木（common.*）但專案沒設 theme，全部用預設風格；要統一風格請在 cut.ts 用 c.theme({...})' });
  if (o.knownFonts) for (const [slot, f] of Object.entries(p.meta.theme?.fonts ?? {}))
    if (f && !o.knownFonts.includes(f)) out.push({ level: 'warn', msg: `theme 的字型 ${slot}「${f}」不在已下載的字型裡（${o.knownFonts.join('、')}），預覽和匯出可能退回別的字型` });
  return byTime(out);
}

/** Calls that make a drawing depend on anything but the time it is drawn at (toolkit phase 2a): a render would no longer repeat. */
const BANNED: Array<[RegExp, string]> = [
  [/\bMath\.random\b/, 'Math.random'], [/\bDate\b/, 'Date'], [/\bperformance\b/, 'performance'], [/\bsetTimeout\b/, 'setTimeout'], [/\bsetInterval\b/, 'setInterval'],
  [/\brequestAnimationFrame\b/, 'requestAnimationFrame'], [/\bfetch\b/, 'fetch'], [/\bXMLHttpRequest\b/, 'XMLHttpRequest'], [/\bimport\s*\(/, 'import()'], [/\beval\b/, 'eval'], [/\bFunction\b/, 'Function'],
];

/** what may come right before a regex literal (anything else before a slash makes it a division) */
const BEFORE_REGEX = new Set([...'(,=:[!&|?{};+-*%<>~^']);
const REGEX_AFTER_WORD = /(?:^|[^\w$.])(?:return|typeof|case|do|else|in|of|void|yield|await|delete|new|instanceof|throw)$/;
/** the end of the regex literal starting at `i` (past its flags), or -1 when it is not one (the line ends first) */
function regexEnd(src: string, i: number): number {
  let cls = false;
  for (let j = i + 1; j < src.length && src[j] !== '\n'; j++) {
    const c = src[j];
    if (c === '\\') j++;
    else if (cls) cls = c !== ']';
    else if (c === '[') cls = true;
    else if (c === '/') { j++; while (j < src.length && /[a-z]/i.test(src[j])) j++; return j; }
  }
  return -1;
}

/** `src` with comments (and optionally the inside of strings and regex literals) blanked to spaces, so line numbers stay.
 *  A regex literal is told from a division by what comes before it: a quote or a slash inside one (/'/g) used to open a
 *  "string" or a comment that blanked the rest of the file, and the banned calls after it went unreported. */
function blank(src: string, strings: boolean): string {
  let out = '', i = 0;
  const keep = (s: string) => s.replace(/[^\n]/g, ' ');
  const regexHere = () => {
    let k = out.length - 1;
    while (k >= 0 && /\s/.test(out[k])) k--;
    return k < 0 || BEFORE_REGEX.has(out[k]) || REGEX_AFTER_WORD.test(out.slice(Math.max(0, k - 11), k + 1));
  };
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    let e = -1;
    if (c === '/' && n !== '/' && n !== '*' && regexHere() && (e = regexEnd(src, i)) > 0) {
      const body = src.slice(i, e), close = body.lastIndexOf('/');
      out += strings ? '/' + keep(body.slice(1, close)) + body.slice(close) : body;
      i = e;
    } else if (c === '/' && n === '/') { const e = src.indexOf('\n', i); const j = e < 0 ? src.length : e; out += keep(src.slice(i, j)); i = j; }
    else if (c === '/' && n === '*') { const e = src.indexOf('*/', i + 2); const j = e < 0 ? src.length : e + 2; out += keep(src.slice(i, j)); i = j; }
    else if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < src.length && src[j] !== c) j += src[j] === '\\' ? 2 : 1;
      j = Math.min(j + 1, src.length);
      out += strings ? c + keep(src.slice(i + 1, j - 1)) + c : src.slice(i, j);
      i = j;
    } else { out += c; i++; }
  }
  return out;
}

/** `import 'x'`, `import('x'`, `import a, { b,⏎ c } from 'x'`, `export * from 'x'`, `export { a } from 'x'` at the start of a line */
const IMPORT = /^[ \t]*(?:import\s*(?:\(\s*|[\w$\s{},*]*?\bfrom\s*)?|export\s*(?:\*(?:\s*as\s+[\w$]+)?|\{[\w$\s,]*\})\s*from\s*)['"]([^'"]+)['"]/gm;

/** fx sources (path → text) against the determinism rules. */
export function fxChecks(sources: Record<string, string>): Finding[] {
  const out: Finding[] = [];
  for (const [path, src] of Object.entries(sources)) {
    const noComments = blank(src, false), noStrings = blank(src, true).split('\n');
    // an import (or a re-export) may run over several lines: read in the whole text, reported at the line it starts on
    for (const m of noComments.matchAll(IMPORT)) {
      const line = noComments.slice(0, m.index + m[0].search(/\S/)).split('\n').length;
      if (!m[1].startsWith('.')) out.push({ level: 'error', msg: `${path}:${line} 不可 import "${m[1]}"（瀏覽器載不到套件；fx 要自成一體，只能相對路徑）` });
    }
    noStrings.forEach((line, i) => {
      for (const [re, name] of BANNED) if (re.test(line)) out.push({ level: 'error', msg: `${path}:${i + 1} 不可用 ${name}（畫面必須只由時間決定；要隨機請用自帶的種子 LCG）` });
    });
    // the layout check measures DOM text boxes: letters drawn on a canvas are pixels to it, and it used to say nothing about them
    const canvasText = noStrings.findIndex((l) => /\.(fillText|strokeText)\s*\(/.test(l));
    if (canvasText >= 0) out.push({ level: 'note', msg: `${path}:${canvasText + 1} 在 canvas 上畫字：check 量不到這些字（超出安全區、蓋到字幕、字太小都不會報），請用 frames 自己看` });
  }
  return out;
}

/** the preset a project was made from, as far as check needs it (`name` in the report's language) */
export interface PresetSpec { id: string; name: string; length?: [number, number]; ratios?: string[] }

/** the length (±10%) and ratio the user picked in the preset's form (spec 2026-10-24-custom-preset §7) instead of the preset's own */
export function chosenSpec(spec: PresetSpec, fields?: Record<string, string>): PresetSpec {
  const n = fields?.length, r = fields?.ratio;
  return { ...spec, ...(n && /^\d+$/.test(n) ? { length: [+n * 0.9, +n * 1.1] as [number, number] } : {}),
    ...(r && /^[1-9]\d*:[1-9]\d*$/.test(r) ? { ratios: [r] } : {}) };
}
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
/** `9:16（1080×1920）`, or just the size when it reduces to no ratio anyone names */
function ratioOf(w: number, h: number): string {
  const g = gcd(w, h), a = w / g, b = h / g;
  return a <= 32 && b <= 32 ? `${a}:${b}（${w}×${h}）` : `${w}×${h}`;
}

/**
 * The film against the length and ratio of the preset it was made from (spec 2026-10-23-presets-and-languages §10.6). Warnings only:
 * a preset is a default, and when the user asks for another length or ratio Claude follows the user. `preset` null: it is gone.
 */
export function presetChecks(p: Project, preset: PresetSpec | null): Finding[] {
  const made = p.meta.preset;
  if (!made) return [];
  if (!preset) return [{ level: 'note', msg: `專案的片型 ${made.id} 找不到了（可能刪掉了）：長度和比例沒有照片型檢查` }];
  const out: Finding[] = [], { width: w, height: h, duration: D, fps } = p.meta;
  const who = `片型「${preset.name}」（${preset.id}）`, ok = '是使用者要的就沒關係，不然照片型改';
  if (preset.length) {
    const [a, b] = preset.length;
    if (D < a - 1 / fps || D > b + 1 / fps) out.push({ level: 'warn', msg: `片長 ${Math.round(D * 10) / 10} 秒，${who}是 ${a}–${b} 秒：${ok}` });
  }
  const fits = (r: string) => { const [x, y] = r.split(':').map(Number); return Math.abs(w / h - x / y) <= 0.01 * (x / y); };
  if (preset.ratios && !preset.ratios.some(fits)) out.push({ level: 'warn', msg: `畫面比例 ${ratioOf(w, h)}，${who}是 ${preset.ratios.join(' 或 ')}：${ok}` });
  return out;
}

/**
 * Footage and music outside tellcut/ (review3 R3-H8): sources added from D:\Trips stay where they are, so handing tellcut/ over or
 * backing up projects/ leaves them behind and the project comes back "offline". One note naming them.
 */
export function outsideFiles(p: Project, dir: string, root: string): Finding[] {
  const inside = (f: string) => { const r = relative(resolve(root), resolve(dir, f)); return !!r && !r.startsWith('..') && !isAbsolute(r); };
  const out = [...Object.entries(p.sources), ...Object.entries(p.media)].filter(([, s]) => !inside(s.path)).map(([id]) => id);
  return out.length ? [{ level: 'note', msg: `${out.length} 個檔案在 tellcut 資料夾外面（${out.slice(0, 6).join('、')}${out.length > 6 ? ' 等' : ''}）：把 tellcut 交給別人或備份專案時不會一起帶走，要另外帶（npm run export-project -- <專案> --media 會把它們一起打包）` }] : [];
}
