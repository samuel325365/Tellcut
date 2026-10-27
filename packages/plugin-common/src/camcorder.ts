// common.camcorder — a home camcorder's viewfinder. From wedding-short's fx.finder (● REC blinking, the tape number, a running tape
// counter, the battery, corner marks that pop in, tracking lines when the tape changes, STOP) and uk-dv's fx.dvOsd (REC / STBY / FF /
// REW / PHOTO / STOP, battery, tape left, the time code, a date stamp, a place typed in, the W–T zoom bar, TAPE END) and fx.dvTape
// (snow, the blue ▶▶ screen with the date rolling on, the rewind's torn stills running backwards).
// mode osd is the overlay over the footage; ff, rew and snow fill the frame. The OSD sits in `box` (the theme's safe area when empty)
// and sizes by min(W, H); every word on it is a parameter (`words`), the dates are formatted by `dateFormat`. The tape look under it
// (scanlines, warm cast, tracking bands) is common.film look vhs; the beeps are common.beep kind rec / end, the spool common.rewind.
import { clamp, coverPlacement, cssCamel, eIO3, eOut3, h, lerp, rng, type Crop, type ItemType } from '@tellcut/engine';
import { trackingBand } from './film.ts';
import { keysAt } from './geo.ts';
import { canvasAt } from './inkline.ts';
import { parseSteps, stepAt, timeSpan } from './phone.ts';
import { imagesReady, stillRef, stillUrl, type Still } from './window.ts';
import { nl } from './text.ts';

export const CAM_STATES = ['rec', 'stby', 'stop', 'play', 'pause', 'ff', 'rew', 'photo'] as const;
export type CamState = (typeof CAM_STATES)[number];
export const CAM_WORDS = {
  rec: 'REC', stby: 'STBY', stop: 'STOP', play: 'PLAY', pause: 'PAUSE', ff: 'FF', rew: 'REW', photo: 'PHOTO',
  tape: 'TAPE', end: 'TAPE END', min: 'min', w: 'W', t: 'T', months: 'JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC',
};
export type CamWords = typeof CAM_WORDS;
/** the words with the item's own over the defaults */
export const camWords = (w: unknown): CamWords => ({ ...CAM_WORDS, ...(w && typeof w === 'object' ? (w as Partial<CamWords>) : {}) });

type Mode = 'osd' | 'ff' | 'rew' | 'snow';
interface P {
  mode: Mode; status: string; counter: string; counterAt: 'top' | 'bottom'; spin: number; tape: string; battery: string; remain: string;
  date: string; dateFormat: string; place: string; zoom: string; end: string; corners: boolean; cross: boolean; popAt: number;
  box: string; size: number; words: Partial<CamWords>; font: string; color: string; recColor: string; stbyColor: string;
  from: string; to: string; ffFormat: string; blue: string; snowIn: number; snowOut: number; stills: string;
}
interface S {
  cv: HTMLCanvasElement; osd: HTMLElement; tl: HTMLElement; tr: HTMLElement; bl: HTMLElement; br: HTMLElement;
  icon: HTMLElement; iconKey: string; label: HTMLElement; counter: HTMLElement; tape: HTMLElement; place: HTMLElement;
  batt: HTMLElement; nub: HTMLElement; bars: HTMLElement[]; remain: HTMLElement; cassette: HTMLElement; remainText: HTMLElement; remainBar: HTMLElement; remainFill: HTMLElement;
  date1: HTMLElement; date2: HTMLElement; zoom: HTMLElement; zoomW: HTMLElement; zoomT: HTMLElement; cells: HTMLElement[];
  end: HTMLElement; endText: HTMLElement; ff: HTMLElement; ffBig: HTMLElement; ffSmall: HTMLElement;
  imgs: HTMLImageElement[]; imgKey: string; sn?: HTMLCanvasElement; tmp?: HTMLCanvasElement;
}

const pad = (n: number) => String(Math.floor(n)).padStart(2, '0');
const isState = (s: string): s is CamState => (CAM_STATES as readonly string[]).includes(s);

/** "秒|狀態" lines (rec, stby, stop, play, pause, ff, rew, photo) */
export function parseStatus(text: string): Array<{ t: number; s: CamState }> {
  return parseSteps(text).map(({ t, v }) => ({ t, s: String(v[0] ?? '').toLowerCase() })).filter((x): x is { t: number; s: CamState } => isState(x.s));
}
/** the state at t (before the first key: the first one; no keys: rec) */
export function statusAt(list: Array<{ t: number; s: CamState }>, t: number): CamState {
  return stepAt(list, t).cur?.s ?? list[0]?.s ?? 'rec';
}

/** "1:02:03", "2:03" or seconds → seconds */
export function readClock(s: string): number {
  const parts = String(s ?? '').trim().split(':').map(Number);
  return parts.some((x) => !Number.isFinite(x)) ? 0 : parts.reduce((a, x) => a * 60 + x, 0);
}
/** seconds as the counter shows them: H:MM:SS */
export const fmtClock = (sec: number) => { const s = Math.max(0, Math.floor(sec + 1e-6)); return `${Math.floor(s / 3600)}:${pad((s / 60) % 60)}:${pad(s % 60)}`; };

const rateOf = (s: CamState, spin: number) => (s === 'rec' || s === 'play' ? 1 : s === 'ff' ? spin : s === 'rew' ? -spin : 0);
/** The tape counter at t: the last "秒|讀數" key sets it, then it runs at the rate of the state in force (rec / play 1×, ff +spin×,
 *  rew −spin×, the rest held), never below zero. Without keys it starts at 0. */
export function counterAt(counter: string, status: string, t: number, spin = 30): number {
  const keys = parseSteps(counter).map(({ t: kt, v }) => ({ t: kt, v: readClock(v[0] ?? '0') })), st = parseStatus(status);
  const base = stepAt(keys, t).cur ?? { t: 0, v: keys[0]?.v ?? 0 };
  let x = base.v, a = Math.min(base.t, t);
  for (const k of st) if (k.t > a && k.t < t) { x = Math.max(0, x + rateOf(statusAt(st, a), spin) * (k.t - a)); a = k.t; }
  return Math.max(0, x + rateOf(statusAt(st, a), spin) * (t - a));
}

/** the tape in at t from "秒|編號" lines: its number, how long since it went in, which one it is (0 = the first) */
export function tapeAt(text: string, t: number): { no: string; since: number; index: number } | null {
  const steps = parseSteps(text);
  if (!steps.length) return null;
  let i = 0;
  steps.forEach((s, j) => { if (s.t <= t) i = j; });
  return { no: steps[i].v[0] ?? '', since: t - steps[i].t, index: i };
}
/** "TAPE 01": a one-digit number gets a leading zero */
export const tapeLabel = (word: string, no: string) => `${word} ${/^\d$/.test(no) ? `0${no}` : no}`.trim();

// ---- the calendar, without Date (a pure function of the numbers) ----
function daysFromCivil(y: number, m: number, d: number) {
  y -= m <= 2 ? 1 : 0;
  const era = Math.floor(y / 400), yoe = y - era * 400, doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  return era * 146097 + yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy - 719468;
}
function civilFromDays(z: number): [number, number, number] {
  z += 719468;
  const era = Math.floor(z / 146097), doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100)), mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1, m = mp + (mp < 10 ? 3 : -9);
  return [yoe + era * 400 + (m <= 2 ? 1 : 0), m, d];
}
/** "2004-08-14 10:30[:00]" (or with a T, or a date alone) → seconds since 1970 on the wall clock; null when it is not a date */
export function parseWhen(s: string): number | null {
  const m = /^(\d{1,4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(String(s ?? '').trim());
  return m ? daysFromCivil(+m[1], +m[2], +m[3]) * 86400 + Number(m[4] ?? 0) * 3600 + Number(m[5] ?? 0) * 60 + Number(m[6] ?? 0) : null;
}
/** a wall-clock time in `fmt`: YYYY YY MMM (the month's word) MM M DD D HH H mm ss */
export function fmtWhen(sec: number, fmt: string, months: string[]): string {
  const s = Math.floor(sec), d = Math.floor(s / 86400), r = s - d * 86400, [y, mo, dd] = civilFromDays(d), hh = Math.floor(r / 3600);
  const map: Record<string, string> = { YYYY: String(y), YY: pad(y % 100), MMM: months[mo - 1] ?? pad(mo), MM: pad(mo), M: String(mo), DD: pad(dd), D: String(dd), HH: pad(hh), H: String(hh), mm: pad((r / 60) % 60), ss: pad(r % 60) };
  return String(fmt ?? '').replace(/YYYY|YY|MMM|MM|M|DD|D|HH|H|mm|ss/g, (x) => map[x]);
}

/** a date stamp line: from a to b (or to the next line), rolling eased to `to`, or running at `rate` (1 = a clock, 0 = held) */
export interface DateLine { a: number; b?: number; from: number; to?: number; rate: number }
/** "秒[-秒]|日期[|到日期 或 倍速]" lines */
export function parseDates(text: string): DateLine[] {
  return nl(text).split('\n').map((l) => l.split('|').map((x) => x.trim())).flatMap(([span, from, third]) => {
    const sp = timeSpan(span ?? ''), f = parseWhen(from ?? '');
    if (!sp || f === null) return [];
    const to = parseWhen(third ?? ''), rate = to === null && third && Number.isFinite(Number(third)) ? Number(third) : 1;
    return [{ a: sp[0], b: sp[1], from: f, to: to ?? undefined, rate }];
  }).sort((x, y) => x.a - y.a);
}
/** the stamp's time at t, or null when no line is showing */
export function dateAt(list: DateLine[], t: number): number | null {
  let i = -1;
  list.forEach((l, j) => { if (l.a <= t) i = j; });
  if (i < 0) return null;
  const l = list[i], end = l.b ?? list[i + 1]?.a ?? Infinity;
  if (t >= end) return null;
  if (l.to !== undefined) return Math.round(lerp(l.from, l.to, eIO3(clamp((t - l.a) / (Number.isFinite(end) ? Math.max(1e-6, end - l.a) : 1)))));
  return l.from + Math.floor((t - l.a) * l.rate);
}

/** "秒-秒|字" lines: the place label typed in at t (one glyph every 0.06 s), or '' */
export function placeAt(text: string, t: number): string {
  for (const l of nl(text).split('\n')) {
    const [span, ...rest] = l.split('|'), sp = timeSpan(span ?? ''), word = rest.join('|').trim();
    if (!sp || !word || t < sp[0] || t >= (sp[1] ?? Infinity)) continue;
    return [...word].slice(0, Math.floor((t - sp[0]) / 0.06) + 1).join('');
  }
  return '';
}
/** "秒-秒|從|到" lines: the zoom bar's level at t (it shows 0.5 s before and 0.3 s after the zoom), or null */
export function zoomAt(text: string, t: number): number | null {
  for (const l of nl(text).split('\n')) {
    const [span, z0, z1] = l.split('|'), sp = timeSpan(span ?? '');
    if (!sp || sp[1] === undefined || t < sp[0] - 0.5 || t >= sp[1] + 0.3) continue;
    return lerp(Number(z0) || 0, Number(z1 ?? z0) || 0, eIO3(clamp((t - sp[0]) / Math.max(1e-6, sp[1] - sp[0]))));
  }
  return null;
}
/** "秒-秒" spans, comma separated: is t inside one, and since when */
export function spanAt(text: string, t: number): number | null {
  for (const x of String(text ?? '').split(/[,，\n]/)) { const sp = timeSpan(x); if (sp && t >= sp[0] && t < (sp[1] ?? Infinity)) return t - sp[0]; }
  return null;
}

/** where the OSD sits: "x,y,w,h" as fractions of the frame, or the theme's safe area */
export function camBox(box: string, W: number, H: number, safe: { top: number; bottom: number; side: number }): [number, number, number, number] {
  const v = String(box ?? '').split(/[,\s]+/).filter(Boolean).map(Number);
  if (v.length === 4 && v.every(Number.isFinite)) return [v[0] * W, v[1] * H, v[2] * W, v[3] * H];
  return [safe.side * W, safe.top * H, W * (1 - 2 * safe.side), H * (1 - safe.top - safe.bottom)];
}

/** "source|秒|x,y,zoom" lines: the rewind's stills, the latest first */
export function parseStills(text: string): Still[] {
  return nl(text).split('\n').map((l) => l.split('|').map((x) => x.trim())).filter(([src]) => !!src).map(([source, t, c]) => {
    const [x, y, zoom] = String(c ?? '').split(',').map((v) => (v.trim() ? Number(v) : NaN));
    const crop: Crop = { x: Number.isFinite(x) ? x : 0.5, y: Number.isFinite(y) ? y : 0.5, zoom: Number.isFinite(zoom) && zoom > 0 ? zoom : 1 };
    return { source: source === '-' ? '' : source, t: Number(t) || 0, crop };
  });
}
/** which of n stills shows at q (0..1 of the rewind): each slot shorter than the one before, as the spool spins up */
export function rewIndex(n: number, q: number): number {
  const w = (i: number) => 1 / (1 + i * 0.22);
  let tot = 0;
  for (let i = 0; i < n; i++) tot += w(i);
  let acc = 0;
  for (let i = 0; i < n; i++) { acc += w(i); if (q < acc / tot) return i; }
  return n - 1;
}

const family = (f: string) => `'${f || 'VT323'}', 'VT323', 'Noto Sans TC', monospace`;
const SHADOW = (k: number) => `drop-shadow(0 0 ${1.6 * k}px rgba(0,0,0,0.9)) drop-shadow(${3 * k}px ${4 * k}px 0 rgba(0,0,0,0.3))`;
/** camcorder characters: a dark outline (painted under the fill) and a hard drop */
function osdText(el: HTMLElement, px: number, color: string, k: number, font: string) {
  cssCamel(el, { fontFamily: family(font), fontSize: `${px}px`, color, lineHeight: '1', whiteSpace: 'pre', webkitTextStroke: `${(px / 11).toFixed(2)}px rgba(0,0,0,0.78)`, paintOrder: 'stroke fill', textShadow: `${3 * k}px ${4 * k}px 0 rgba(0,0,0,0.35)` });
}
const div = (parent: HTMLElement, css: Record<string, string> = {}) => { const d = h('div', null, null, parent); cssCamel(d, css); return d; };

/** the state's glyph, k = px per 1080 unit */
function buildIcon(el: HTMLElement, st: CamState, k: number, color: string, rec: string) {
  el.replaceChildren();
  const part = (x: number, y: number, w: number, hh: number, css: Record<string, string>) => div(el, { position: 'absolute', left: `${x * k}px`, top: `${y * k}px`, width: `${w * k}px`, height: `${hh * k}px`, background: color, ...css });
  const right = 'polygon(0 0, 100% 50%, 0 100%)', left = 'polygon(100% 0, 0 50%, 100% 100%)';
  let w = 0;
  if (st === 'rec') { part(2, 6, 34, 34, { background: rec, borderRadius: '50%' }); w = 38; }
  else if (st === 'stop') { part(2, 2, 42, 42, {}); w = 46; }
  else if (st === 'pause') { part(4, 2, 14, 42, {}); part(26, 2, 14, 42, {}); w = 44; }
  else if (st === 'play') { part(0, 0, 40, 46, { clipPath: right }); w = 40; }
  else if (st === 'ff' || st === 'rew') { const c = st === 'ff' ? right : left; part(0, 0, 30, 46, { clipPath: c }); part(28, 0, 30, 46, { clipPath: c }); w = 58; }
  else if (st === 'photo') { part(14, 0, 22, 9, {}); part(0, 8, 52, 38, { borderRadius: `${4 * k}px` }); part(15, 16, 22, 22, { background: '#222', borderRadius: '50%' }); w = 52; }
  cssCamel(el, { display: w ? 'block' : 'none', width: `${w * k}px`, height: `${46 * k}px` });
}

/** TV snow over the whole frame, a fifth of its size, the grains from frame `fr` */
function snow(s: S, g: CanvasRenderingContext2D, W: number, H: number, fr: number) {
  const sw = Math.max(8, Math.round(W / 5)), sh = Math.max(8, Math.round(H / 5));
  if (!s.sn) s.sn = document.createElement('canvas');
  const sg = canvasAt(s.sn, sw, sh), img = sg.createImageData(sw, sh), d = img.data, r = rng(fr * 101 + 7);
  for (let y = 0; y < sh; y++) {
    const row = 0.55 + r() * 0.45;
    for (let x = 0; x < sw; x++) { const v = Math.floor(r() * 255 * row), i = (y * sw + x) * 4; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
  }
  sg.putImageData(img, 0, 0);
  g.imageSmoothingEnabled = true; g.drawImage(s.sn, 0, 0, W, H);
}
/** two triangles pointing `dir` (1 right, -1 left), w × hh each, side by side, centred at (cx, cy), outlined dark */
function arrows(g: CanvasRenderingContext2D, cx: number, cy: number, w: number, hh: number, dir: number, color: string, k: number) {
  g.save(); g.beginPath();
  for (const x0 of [cx - w, cx]) {
    if (dir > 0) { g.moveTo(x0, cy - hh / 2); g.lineTo(x0 + w, cy); g.lineTo(x0, cy + hh / 2); }
    else { g.moveTo(x0 + w, cy - hh / 2); g.lineTo(x0, cy); g.lineTo(x0 + w, cy + hh / 2); }
    g.closePath();
  }
  g.lineJoin = 'round'; g.lineWidth = 12 * k; g.strokeStyle = 'rgba(0,0,0,0.75)'; g.stroke(); g.fillStyle = color; g.fill(); g.restore();
}
/** a painted stand-in picture for a rewind slot without footage (sky, sea and a low sun, a different hour each) */
function standIn(g: CanvasRenderingContext2D, W: number, H: number, i: number) {
  const skies = [['#9cc3d8', '#e8d3b0', '#3f6478'], ['#f2b27a', '#f6dcb0', '#5a4a6a'], ['#7fa7c9', '#d8e4e8', '#2f5d50'], ['#c98a9a', '#f3cfa8', '#3b4f6b'], ['#a7c7a0', '#eee3c4', '#4b6b3a']];
  const [a, b, c] = skies[i % skies.length], grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, a); grd.addColorStop(0.62, b); grd.addColorStop(0.63, c); grd.addColorStop(1, '#1c2b36');
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(246,194,107,0.9)'; g.beginPath(); g.arc(W * (0.3 + 0.1 * (i % 5)), H * 0.55, Math.min(W, H) * 0.08, 0, Math.PI * 2); g.fill();
}

export const camcorder: ItemType<P, S> = {
  type: 'common.camcorder', label: '攝影機觀景窗', category: 'frame', kind: 'overlay',
  doc: '家用攝影機／DV 的觀景窗：mode osd 蓋在影片上——左上 ● REC（每秒閃）／STBY／STOP／PLAY／PAUSE／FF／REW／PHOTO（status「秒|狀態」一行一個），四角框線（popAt 彈出）、中心十字，帶子計數（counter「秒|讀數」設定後依狀態跑：錄影 1 倍、ff／rew spin 倍、其他停住；counterAt top 在右上、bottom 在左下），TAPE 編號（tape「秒|編號」，換帶時一條循軌雜訊帶），電量（battery「秒|格數」，0 格紅色閃），剩餘帶長（remain「秒|分鐘」，1 分鐘以下紅色閃），日期戳（date「秒[-秒]|2004-08-14 10:30[|到日期或倍速]」，dateFormat 排版），地名逐字打出（place「秒-秒|字」），W–T 變焦條（zoom「秒-秒|從|到」），TAPE END（end「秒-秒」）；mode ff 是快轉：雪花→藍底 ▶▶、日期大字從 from 翻到 to→雪花；mode rew 是倒帶：stills「素材|秒|x,y,zoom」的靜態圖倒序加速閃過、畫面撕裂、中央 ◀◀（沒素材用畫的示意圖）；mode snow 只有雪花；所有字（REC、TAPE、月份…）在 words 換；回憶、婚禮、家庭錄影帶、Y2K、旅行 DV；配 common.film look vhs、common.beep kind rec／end、common.rewind',
  params: [
    { key: 'mode', label: '模式（osd 觀景窗介面、ff 快轉藍畫面、rew 倒帶撕裂、snow 雪花）', type: 'enum', options: ['osd', 'ff', 'rew', 'snow'], default: 'osd' },
    { key: 'status', label: '狀態「秒|狀態」一行一個（rec 錄影、stby 待機、stop 停止、play 播放、pause 暫停、ff 快轉、rew 倒帶、photo 拍照）', type: 'text', default: '0|rec' },
    { key: 'counter', label: '帶子計數「秒|讀數（0:15:06 或秒）」一行一個；之後依狀態跑（空＝不顯示）', type: 'text', default: '0|0:15:06' },
    { key: 'counterAt', label: '計數的位置（top 右上、bottom 左下）', type: 'enum', options: ['top', 'bottom'], default: 'bottom' },
    { key: 'spin', label: '快轉／倒帶時計數跑幾倍', type: 'number', min: 0, max: 600, step: 1, default: 30 },
    { key: 'tape', label: '帶子編號「秒|編號」一行一個；換帶時有循軌雜訊帶（空＝不顯示）', type: 'text', default: '0|1' },
    { key: 'battery', label: '電量「秒|格數（0–3）」一行一個；0 格紅色閃（空＝不顯示）', type: 'text', default: '0|3' },
    { key: 'remain', label: '剩餘帶長「秒|分鐘」一行一個，中間線性變化；1 分鐘以下紅色閃（空＝不顯示）', type: 'text', default: '0|60' },
    { key: 'date', label: '日期戳「秒[-秒]|2004-08-14 10:30[:00][|到的日期 或 倍速]」一行一個：有到的日期就翻過去，否則照倍速走（預設 1＝時鐘、0＝停住）；空＝不顯示', type: 'text', default: '0|2004-08-14 10:30:00' },
    { key: 'dateFormat', label: '日期戳的格式（| 換行；YYYY YY MMM 月份字 MM M DD D HH H mm ss）', type: 'string', default: 'MMM.DD YYYY|HH:mm:ss' },
    { key: 'place', label: '地名「秒-秒|字」一行一個，逐字打出（快轉、倒帶時不顯示）', type: 'text', default: '' },
    { key: 'zoom', label: '變焦條「秒-秒|從|到」（0–1）一行一個', type: 'text', default: '' },
    { key: 'end', label: 'TAPE END 閃爍的時間「秒-秒」逗號分開', type: 'string', default: '' },
    { key: 'corners', label: '四角框線', type: 'bool', default: true },
    { key: 'cross', label: '中心十字（快轉、倒帶時不顯示）', type: 'bool', default: true },
    { key: 'popAt', label: '介面出現的時間（秒，四角框線彈出）', type: 'number', min: 0, max: 600, step: 0.05, default: 0 },
    { key: 'box', label: '介面的範圍「x,y,寬,高」（畫面比例；空＝安全區）', type: 'string', default: '' },
    { key: 'size', label: '大小（倍）', type: 'number', min: 0.4, max: 2.5, step: 0.05, default: 1 },
    { key: 'words', label: '介面上的字 { rec, stby, stop, play, pause, ff, rew, photo, tape, end, min, w, t, months（空格分開的 12 個月） }，只給要換的', type: 'json', default: {} },
    { key: 'font', label: '字型（中文字用 Noto Sans TC）', type: 'string', default: 'VT323' },
    { key: 'color', label: '字與圖示的顏色', type: 'color', default: '#f4f6f2' },
    { key: 'recColor', label: '錄影紅點、低電量、TAPE END 的顏色', type: 'color', default: '#ff2a2a' },
    { key: 'stbyColor', label: 'STBY 的顏色', type: 'color', default: '#9dfc9d' },
    { key: 'from', label: '快轉：開始的日期（2004-08-14 10:30）', type: 'string', default: '2004-08-14 10:30' },
    { key: 'to', label: '快轉：翻到的日期', type: 'string', default: '2004-08-21 09:00' },
    { key: 'ffFormat', label: '快轉：日期大字的格式（| 換行，第二行小字）', type: 'string', default: 'MMM.DD|YYYY' },
    { key: 'blue', label: '快轉：藍底的顏色', type: 'color', default: '#0b2fb0' },
    { key: 'snowIn', label: '快轉：開頭雪花（秒）', type: 'number', min: 0, max: 5, step: 0.05, default: 0.3 },
    { key: 'snowOut', label: '快轉：結尾雪花（秒）', type: 'number', min: 0, max: 5, step: 0.05, default: 0.12 },
    { key: 'stills', label: '倒帶：閃過的靜態圖「素材|秒|x,y,zoom」一行一個，最新的在前（空＝畫的示意圖）', type: 'text', default: '' },
  ],
  media(item) {
    const p = item.params as Partial<P>;
    return { videos: [], stills: p.mode === 'rew' ? parseStills(p.stills ?? '').filter((s) => s.source).map((s) => stillRef(s)) : [] };
  },
  build(ctx) {
    const root = ctx.root, abs = { position: 'absolute' };
    const cv = h('canvas', null, null, root);
    cssCamel(cv, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%' });
    const osd = div(root, abs), col = (css: Record<string, string>) => div(osd, { ...abs, display: 'flex', flexDirection: 'column', ...css });
    const tl = col({ flexDirection: 'row', alignItems: 'center' }), tr = col({ alignItems: 'flex-end' }), bl = col({ alignItems: 'flex-start', justifyContent: 'flex-end' }), br = col({ alignItems: 'flex-end', justifyContent: 'flex-end' });
    const icon = div(tl, { position: 'relative', flex: 'none' }), label = div(tl);
    const batt = div(tr, { position: 'relative', boxSizing: 'border-box', display: 'flex', justifyContent: 'flex-end' }), nub = div(batt, abs);
    const bars = [0, 1, 2].map(() => div(batt, { flex: 'none' }));
    const remain = div(tr, { display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }), rRow = div(remain, { display: 'flex', alignItems: 'center' });
    const cassette = div(rRow, { position: 'relative', boxSizing: 'border-box' });
    for (let i = 0; i < 2; i++) div(cassette, { ...abs, borderRadius: '50%', top: '50%', left: i ? '70%' : '30%', transform: 'translate(-50%, -50%)', width: '24%', height: '42%', background: 'currentColor' });
    const remainText = div(rRow), remainBar = div(remain, { position: 'relative', boxSizing: 'border-box' }), remainFill = div(remainBar, abs);
    const date1 = div(br), date2 = div(br), place = div(bl), tape = div(bl), counter = div(bl);
    const zoom = div(osd, { ...abs, display: 'flex', alignItems: 'center', left: '50%', transform: 'translateX(-50%)' });
    const zoomW = div(zoom), cellBox = div(zoom, { display: 'flex' }), zoomT = div(zoom), cells = Array.from({ length: 14 }, () => div(cellBox, { flex: 'none' }));
    const end = div(osd, { ...abs, left: '50%', top: '50%', transform: 'translate(-50%, -50%)', background: 'rgba(0,0,0,0.55)' }), endText = div(end);
    const ff = div(root, { ...abs, left: '0', right: '0', textAlign: 'center' }), ffBig = div(ff), ffSmall = div(ff);
    const s: S = { cv, osd, tl, tr, bl, br, icon, iconKey: '', label, counter, tape, place, batt, nub, bars, remain, cassette, remainText, remainBar, remainFill, date1, date2, zoom, zoomW, zoomT, cells, end, endText, ff, ffBig, ffSmall, imgs: [], imgKey: '' };
    camcorder.draw(ctx, s);   // starts loading the rewind's stills now, so ready() can wait for them
    return s;
  },
  async ready(s) {
    if (typeof document !== 'undefined' && document.fonts) await Promise.all(['VT323', 'Noto Sans TC'].map((f) => document.fonts.load(`40px '${f}'`, 'REC 0123456789').catch(() => [])));
    await imagesReady(s.imgs);
  },
  draw(ctx, s) {
    const p = ctx.params, { W, H, local: t, dur, theme } = ctx, k = (Math.min(W, H) / 1080) * (p.size || 1), words = camWords(p.words), mode = p.mode;
    const [bx, by, bw, bh] = camBox(p.box, W, H, theme.safe), fr = Math.floor(t * 30);
    const g = canvasAt(s.cv, W, H);
    cssCamel(s.osd, { display: mode === 'osd' ? 'block' : 'none', left: `${bx}px`, top: `${by}px`, width: `${bw}px`, height: `${bh}px` });
    cssCamel(s.ff, { display: 'none' });
    // the rewind's pictures: one <img> per still, loaded once per list (build calls draw, so ready() waits for them)
    const stills = mode === 'rew' ? parseStills(p.stills) : [], imgKey = stills.map((x) => `${x.source}@${x.t}`).join(',');
    if (s.imgKey !== imgKey) {
      s.imgKey = imgKey;
      s.imgs = stills.map((x) => { const img = new Image(); if (x.source) img.src = stillUrl(ctx.media, x); return img; });
    }
    if (mode === 'snow') { snow(s, g, W, H, fr); return; }
    if (mode === 'ff') {
      if (t < p.snowIn || t > dur - p.snowOut) { snow(s, g, W, H, fr); return; }
      g.fillStyle = p.blue; g.fillRect(0, 0, W, H);
      const r = rng(fr * 13 + 1);
      for (let i = 0; i < 4; i++) { const y = ((t * 0.9 + i * 0.27) % 1) * H; g.fillStyle = `rgba(255,255,255,${0.06 + r() * 0.06})`; g.fillRect(0, y, W, (6 + r() * 10) * k); }
      const cy = by + bh / 2, a = parseWhen(p.from) ?? 0, b = parseWhen(p.to) ?? a;
      arrows(g, W / 2, cy - 110 * k, 150 * k, 160 * k, 1, p.color, k);
      const [big, small] = fmtWhen(Math.round(lerp(a, b, eIO3(clamp(t / dur)))), p.ffFormat, words.months.split(/\s+/)).split('|');
      s.ffBig.textContent = big ?? ''; s.ffSmall.textContent = small ?? '';
      osdText(s.ffBig, 200 * k, p.color, k, p.font); osdText(s.ffSmall, 90 * k, p.color, k, p.font);
      cssCamel(s.ff, { display: 'block', top: `${cy + 10 * k}px` });
      cssCamel(s.ffSmall, { display: small ? 'block' : 'none', marginTop: `${4 * k}px` });
      return;
    }
    if (mode === 'rew') {
      g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
      const n = Math.max(1, stills.length || 5), q = clamp(t / dur), idx = rewIndex(n, q), last = idx === n - 1 && q > 0.9;
      if (!s.tmp) s.tmp = document.createElement('canvas');
      const tg = canvasAt(s.tmp, W, H), img = s.imgs[idx], st = stills[idx];
      if (img && img.complete && img.naturalWidth > 0) {
        const c = coverPlacement(img.naturalWidth, img.naturalHeight, W, H, st?.crop ?? { x: 0.5, y: 0.5, zoom: 1 });
        tg.drawImage(img, c.left, c.top, c.width, c.height);
      } else standIn(tg, W, H, idx);
      // copy it in horizontal strips, each pushed sideways: the tear, worst near a band that rolls up the frame
      const r = rng(fr * 31 + 3), strip = Math.max(4, Math.round(16 * k)), tearY = ((t * 1.7) % 1) * H;
      for (let y = 0; y < H; y += strip) {
        const near = Math.abs(y - tearY) < H * 0.12 ? 1 : 0, off = last ? 0 : (Math.sin(y * 0.013 / Math.max(k, 0.1) + t * 37) * 18 + near * (r() - 0.3) * 120) * k;
        g.drawImage(s.tmp, 0, y, W, strip, off, y, W, strip);
      }
      if (!last) {
        g.fillStyle = 'rgba(30,50,160,0.12)'; g.fillRect(0, 0, W, H);
        const rr = rng(fr * 17 + 9);
        for (let i = 0; i < 3; i++) { const y = rr() * H, hh = (20 + rr() * 60) * k; g.fillStyle = `rgba(255,255,255,${0.25 + rr() * 0.3})`; g.fillRect(0, y, W, 2 * k); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, y + 2 * k, W, hh); }
      }
      if (t < dur - 0.25) { g.globalAlpha = 0.85; arrows(g, W / 2, by + bh / 2, 150 * k, 160 * k, -1, p.color, k); g.globalAlpha = 1; }
      return;
    }
    // ---- osd ----
    const on = t >= p.popAt, pop = eOut3(clamp((t - p.popAt) / 0.25)), st = parseStatus(p.status), state = statusAt(st, t), moving = state === 'ff' || state === 'rew';
    cssCamel(s.osd, { opacity: on ? '1' : '0' });
    if (!on) return;
    // corner marks and the centre cross
    const endSince = spanAt(p.end, t), endOn = endSince !== null;
    const inset = (1 - pop) * 26 * k, L = 64 * k, x0 = bx + inset, y0 = by + inset, x1 = bx + bw - inset, y1 = by + bh - inset;
    g.save(); g.globalAlpha = moving ? 0.55 : 0.9; g.lineCap = 'square';
    for (const pass of [0, 1]) {
      g.strokeStyle = pass ? p.color : 'rgba(0,0,0,0.6)'; g.lineWidth = (pass ? 5 : 10) * k; g.beginPath();
      if (p.corners) for (const [x, dx] of [[x0, 1], [x1, -1]]) for (const [y, dy] of [[y0, 1], [y1, -1]]) { g.moveTo(x, y + dy * L); g.lineTo(x, y); g.lineTo(x + dx * L, y); }
      if (p.cross && !moving && !endOn) { const cx = bx + bw / 2, cy = by + bh / 2, c = 26 * k; g.moveTo(cx - c, cy); g.lineTo(cx + c, cy); g.moveTo(cx, cy - c); g.lineTo(cx, cy + c); }
      g.stroke();
    }
    g.restore();
    // a tracking band down the window for a moment after each tape change (not the first tape)
    const tp = tapeAt(p.tape, t);
    if (tp && tp.index > 0 && tp.since >= 0 && tp.since < 0.4) {
      const q = tp.since / 0.4, hh = bh * 0.12;
      g.save(); g.beginPath(); g.rect(bx, by, bw, bh); g.clip();
      trackingBand(g, W, lerp(by - hh / 2, by + bh + hh / 2, q), hh, 0.9 * (1 - q) + 0.1, tp.index * 7 + fr, k);
      g.restore();
    }
    // the four corners of text
    const m = 22 * k;
    cssCamel(s.tl, { left: `${m}px`, top: `${m}px`, gap: `${14 * k}px` });
    cssCamel(s.tr, { right: `${m}px`, top: `${m + 4 * k}px`, gap: `${14 * k}px` });
    cssCamel(s.bl, { left: `${m}px`, bottom: `${m}px`, gap: `${10 * k}px` });
    cssCamel(s.br, { right: `${m}px`, bottom: `${m}px`, gap: `${6 * k}px` });
    const iconKey = JSON.stringify([state, k, p.color, p.recColor]);
    if (s.iconKey !== iconKey) { s.iconKey = iconKey; buildIcon(s.icon, state, k, p.color, p.recColor); }
    cssCamel(s.icon, { filter: SHADOW(k), opacity: state === 'rec' && t % 1 >= 0.72 ? '0' : '1' });
    s.label.textContent = words[state] ?? '';
    osdText(s.label, 78 * k, state === 'stby' ? p.stbyColor : p.color, k, p.font);
    // the counter: right under the battery's row at the top, or the last line at the bottom left
    const top = p.counterAt === 'top', cParent = top ? s.tr : s.bl;
    if (s.counter.parentElement !== cParent) { if (top) s.tr.insertBefore(s.counter, s.tr.firstChild); else s.bl.appendChild(s.counter); }
    const bParent = top ? s.br : s.tr;
    if (s.batt.parentElement !== bParent) { if (top) s.br.appendChild(s.batt); else s.tr.insertBefore(s.batt, s.remain); }
    s.counter.textContent = fmtClock(counterAt(p.counter, p.status, t, p.spin));
    osdText(s.counter, 72 * k, p.color, k, p.font);
    cssCamel(s.counter, { display: String(p.counter ?? '').trim() ? 'block' : 'none' });
    s.tape.textContent = tp ? tapeLabel(words.tape, tp.no) : '';
    osdText(s.tape, 60 * k, p.color, k, p.font);
    cssCamel(s.tape, { display: tp ? 'block' : 'none' });
    // battery: three bars, red and blinking when empty
    const bsteps = parseSteps(p.battery), bars = clamp(Number(stepAt(bsteps, t).cur?.v[0] ?? bsteps[0]?.v[0] ?? 3), 0, 3), low = bars < 1;
    const bc = low ? p.recColor : p.color;
    cssCamel(s.batt, { display: bsteps.length ? 'flex' : 'none', visibility: low && t % 0.6 > 0.36 ? 'hidden' : 'visible', width: `${82 * k}px`, height: `${40 * k}px`, border: `${5 * k}px solid ${bc}`, padding: `${3 * k}px`, gap: `${3 * k}px`, filter: SHADOW(k), marginLeft: `${10 * k}px` });
    cssCamel(s.nub, { left: `${-12 * k}px`, top: `${8 * k}px`, width: `${7 * k}px`, height: `${14 * k}px`, background: bc });
    s.bars.forEach((e, i) => cssCamel(e, { width: `${((82 - 16 - 6) / 3) * k}px`, height: '100%', background: bc, visibility: 2 - i < bars ? 'visible' : 'hidden' }));
    // tape left: a cassette, "60min" and a bar
    const rkeys = parseSteps(p.remain).map(({ t: kt, v }) => [kt, Number(v[0]) || 0]), left = keysAt(rkeys, t, (x) => x)?.[0];
    const full = Math.max(1, ...rkeys.map((x) => x[1])), blink = left !== undefined && left <= 1.01 && state !== 'rew' && state !== 'stop', rc = blink ? p.recColor : p.color;
    cssCamel(s.remain, { display: left === undefined ? 'none' : 'flex', gap: `${8 * k}px` });
    if (left !== undefined) {
      cssCamel(s.cassette, { width: `${58 * k}px`, height: `${34 * k}px`, border: `${4 * k}px solid ${p.color}`, color: p.color, marginRight: `${14 * k}px`, filter: SHADOW(k), borderRadius: `${3 * k}px` });
      s.remainText.textContent = `${Math.ceil(left - 1e-6)}${words.min}`;
      osdText(s.remainText, 64 * k, rc, k, p.font);
      cssCamel(s.remainText, { visibility: blink && t % 0.6 >= 0.38 ? 'hidden' : 'visible' });
      cssCamel(s.remainBar, { width: `${240 * k}px`, height: `${14 * k}px`, border: `${3 * k}px solid ${p.color}`, filter: SHADOW(k), background: 'rgba(0,0,0,0.35)' });
      cssCamel(s.remainFill, { left: `${2 * k}px`, top: `${2 * k}px`, bottom: `${2 * k}px`, width: `${clamp(left / full) * (240 - 10) * k}px`, background: rc });
    }
    // the date stamp
    const sec = dateAt(parseDates(p.date), t), [d1, d2] = sec === null ? ['', ''] : fmtWhen(sec, p.dateFormat, words.months.split(/\s+/)).split('|');
    for (const [el, txt] of [[s.date1, d1], [s.date2, d2]] as const) { el.textContent = txt ?? ''; osdText(el, 76 * k, p.color, k, p.font); cssCamel(el, { display: txt ? 'block' : 'none' }); }
    // the place, typed in
    const place = moving ? '' : placeAt(p.place, t);
    s.place.textContent = place;
    osdText(s.place, 60 * k, p.color, k, p.font);
    cssCamel(s.place, { display: place ? 'block' : 'none', fontWeight: '700' });
    // W–T zoom bar
    const z = zoomAt(p.zoom, t);
    cssCamel(s.zoom, { display: z === null ? 'none' : 'flex', top: `${230 * k}px`, gap: `${14 * k}px` });
    if (z !== null) {
      s.zoomW.textContent = words.w; s.zoomT.textContent = words.t;
      for (const e of [s.zoomW, s.zoomT]) osdText(e, 60 * k, p.color, k, p.font);
      const cw = 360 / 14;
      s.cells.forEach((e, i) => cssCamel(e, { width: `${(cw - 4) * k}px`, height: `${28 * k}px`, marginRight: `${4 * k}px`, background: i / 14 < z ? p.color : 'rgba(255,255,255,0.28)', boxShadow: `0 0 0 ${2 * k}px rgba(0,0,0,0.6)` }));
    }
    // TAPE END, blinking
    const showEnd = endSince !== null && endSince % 0.5 < 0.32;
    s.endText.textContent = words.end;
    osdText(s.endText, 128 * k, p.recColor, k, p.font);
    cssCamel(s.end, { display: showEnd ? 'block' : 'none', padding: `${10 * k}px ${40 * k}px` });
  },
  hide(s) { s.cv.width = 1; s.cv.height = 1; if (s.tmp) { s.tmp.width = 1; s.tmp.height = 1; } },
};
