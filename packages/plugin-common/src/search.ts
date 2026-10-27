// common.search — a search engine's pages as a screen recording, from t2-search's fx.sHome / sPage / sFull / sAsk / sEnd. A generic
// dark search page, not any real engine: no logo, no coloured letters, every word on it (the tabs, 相關搜尋, 搜尋中…, the "did you
// mean" lead, the snippet's words, the badge) is a parameter, the colours are the block's own. One block, four modes:
//   home     the start page over the main-track clip (blurred and darkened): a headline, the query typed into the box, the
//            autocomplete list dropping down, a row picked (the box then holds it) and the page sliding away (`out`)
//   results  the results page: the box (typing, deleting the old query first), the tabs with the sliding underline, a title and a
//            snippet, the video window (a rounded hole: the main-track clip plays through it at searchWindow(…)), a loading card,
//            fact cards popping from the window's corner one at a time, a "did you mean" line with one letter marked, a big word over
//            the window, related searches under it; view full: the clip fills the screen, the box, the tabs and a row of filter chips
//            float on a shade at the top, the chips lighting up one by one
//   ask      questions that open one at a time into the video window and close again, the list scrolling up a row each time; a
//            hint pill or a redacted answer ("答案：▇▇ 完整版揭曉") at the window's foot
//   end      the box typed again with suggestions, a row picked, then a featured snippet whose answer is redacted and a result card
//            whose thumbnail is the video window, with a badge, a title, a play button pressed at `press` and the length
// On 9:16 the screen is the frame; on a wide or square frame it is a phone in the middle (phone.ts), the clip then takes searchWindow.
// Fingers are common.touch (searchPoint gives where the picked row, the box and the play button are); white flashes core.flash.
import { clamp, cssCamel, defaultSafe, eBack, eIO3, eOut3, h, lerp, textEm, withDefaults, type ItemType, type Theme } from '@tellcut/engine';
import { asFrame, punch } from './window.ts';
import { caretOn, DEVICES, drawStatusBar, drawType, glyphSvg, parseSteps, phoneEls, phoneScreen, phoneView, placePhone, statusBarEl, timeSpan, typed, typeEl,
  type Device, type PhoneEls, type StatusBar, type TypeEl } from './phone.ts';
import { fitPx, lineAbs, nl } from './text.ts';
import { withAlpha } from './color.ts';

export const SEARCH_MODES = ['home', 'results', 'ask', 'end'] as const;
type Mode = (typeof SEARCH_MODES)[number];
export const SEARCH_VIEWS = ['window', 'full'] as const;
type View = (typeof SEARCH_VIEWS)[number];

// ---------------------------------------------------------------- the words
const rows = (s: string) => nl(s).split('\n').map((l) => l.trim()).filter(Boolean);
export const listOf = (s: string) => String(s ?? '').split(/[,，、]/).map((x) => x.trim()).filter(Boolean);
export interface Sugg { text: string; lead: string; rest: string }
/** the autocomplete rows, one a line: "前綴|補完" or the whole row (the part that is the query is light, the rest bold) */
export function parseSugg(text: string, query: string): Sugg[] {
  return rows(text).map((l) => {
    const i = l.indexOf('|');
    if (i >= 0) { const lead = l.slice(0, i), rest = l.slice(i + 1); return { text: lead + rest, lead, rest }; }
    const q = String(query ?? ''), lead = q && l.startsWith(q) ? q : '';
    return { text: l, lead, rest: l.slice(lead.length) };
  });
}
export interface Fact { at: number; label: string; big: string; unit: string }
/** the fact cards, one a line "秒|小標|大字|單位" (or "秒|字": one bold line) */
export const parseFacts = (text: string): Fact[] => parseSteps(text).map((s) => ({ at: s.t, label: s.v[0] ?? '', big: s.v[1] ?? '', unit: s.v[2] ?? '' }));
export interface Ask { t0: number; t1: number; q: string; hint: string; redact: boolean }
/** the questions, one a line "秒-秒|問題|提示" (redact in place of the hint: the answer is hidden); without an end a question stays
 *  open until the next one starts (the last one to the item's end) */
export function parseAsk(text: string): Ask[] {
  const out: Ask[] = [];
  for (const l of rows(text)) {
    const [w = '', q = '', ...rest] = l.split('|').map((x) => x.trim()), s = timeSpan(w);
    if (!s) continue;
    const red = (x: string) => /^redact$/i.test(x);
    out.push({ t0: s[0], t1: s[1] ?? NaN, q, hint: rest.find((x) => x && !red(x)) ?? '', redact: rest.some(red) });
  }
  out.sort((a, b) => a.t0 - b.t0);
  out.forEach((a, i) => { if (!Number.isFinite(a.t1)) a.t1 = out[i + 1]?.t0 ?? Infinity; });
  return out;
}
/** related searches: rows split by ";", the pills in a row by "," */
export const parseRelated = (s: string) => String(s ?? '').split(/[;；]/).map(listOf).filter((r) => r.length);

// ---------------------------------------------------------------- sizes (design px: the screen is 1080 wide, Hd tall)
const BAR_X = 40, BAR_W = 1000, BAR_H = 112, BAR_Y = 230, TAB_Y = 372, TAB_FS = 46, TAB_GAP = 52, TAB_X = 64;
const ROW_H = 118, WIN_Y = 620, WIN_R = 30, ASK_Y = 470, ASK_H = 130, SNIP_Y = 470, SNIP_H = 500, CARD_Y = 1000;
/** the home page's box: a third of the way down */
const homeY = (Hd: number) => Math.round(Hd / 3);
export type Rect = [number, number, number, number];
/** the video window of a mode, in design px: results and ask under the title, end the result card's thumbnail, home / full the screen */
export function windowRect(mode: Mode, view: View, Hd: number): Rect {
  if (mode === 'end') return [24, CARD_Y, 1032, Math.max(300, Math.min(700, Hd - 220 - CARD_Y))];
  if (mode === 'ask' || (mode === 'results' && view === 'window')) return [24, WIN_Y, 1032, Math.max(400, Hd - 420 - WIN_Y)];
  return [0, 0, 1080, Hd];
}
/** the tabs' x and width (design px) from their words: CJK 1 em, other characters 0.55 em */
export function tabXs(tabs: string[]): Array<[number, number]> {
  let x = TAB_X;
  return tabs.map((s) => { const w = textEm(s) * TAB_FS, r: [number, number] = [x, w]; x += w + TAB_GAP; return r; });
}

/** the ask list at t: which question is open, how far it has opened / closed (0→1), the scroll (px) and the cover over the window */
export function askAt(qs: Ask[], t: number) {
  let cur = 0;
  qs.forEach((q, i) => { if (t >= q.t0) cur = i; });
  const Q = qs[cur], last = cur >= qs.length - 1;
  if (!Q) return { cur: -1, open: 0, close: 0, last: true, scroll: 0, cover: 1 };
  const open = clamp((t - Q.t0) / 0.38), close = Number.isFinite(Q.t1) ? clamp((t - (Q.t1 - 0.42)) / 0.42) : 0;
  return { cur, open, close, last, scroll: (cur + (last ? 0 : eIO3(close))) * ASK_H, cover: Math.max(1 - eOut3(open), last ? 0 : eIO3(close)) };
}
/** question i's row top (design px) at t, given askAt's state and the window's height */
export function askRowY(i: number, st: ReturnType<typeof askAt>, winH: number) {
  let y = ASK_Y + i * ASK_H - st.scroll;
  if (i > st.cur) y += winH + 20;
  if (i === st.cur + 1 && !st.last) y -= (winH + 20) * eIO3(st.close);
  return y;
}

// ---------------------------------------------------------------- the screen, for Cut API and common.touch
const geo = (params: Record<string, unknown>, W: number, H: number, safe?: Partial<Theme['safe']>) => {
  const p = withDefaults(search.params, params) as P, sc = phoneScreen(W, H, { ...defaultSafe(W, H), ...safe }, p.device, p.px);
  return { p, sc, k: sc.k, Hd: sc.h / sc.k };
};
/** The video window of the item on a W×H frame as a clip `frame` (fractions): the main-track clip that plays through it. home and the
 *  results' full view: the whole screen (the phone's screen on a wide frame). */
export function searchWindow(params: Record<string, unknown>, W = 1080, H = 1920, o: { safe?: Partial<Theme['safe']> } = {}) {
  const { p, sc, k, Hd } = geo(params, W, H, o.safe), r = windowRect(p.mode, p.view, Hd);
  return asFrame([sc.x + r[0] * k, sc.y + r[1] * k, r[2] * k, r[3] * k], W, H);
}
/** Where to tap (fractions of the frame, for common.touch): pick the picked autocomplete row, bar the box's right end (search), play
 *  the result card's play button (end). */
export function searchPoint(params: Record<string, unknown>, target: 'pick' | 'bar' | 'play', W = 1080, H = 1920, safe?: Partial<Theme['safe']>) {
  const { p, sc, k, Hd } = geo(params, W, H, safe), y0 = p.mode === 'home' ? homeY(Hd) : BAR_Y;
  let x = 540, y = y0 + BAR_H / 2;
  if (target === 'pick') { x = 620; y = y0 + BAR_H + 14 + Math.max(0, p.pick) * ROW_H + ROW_H / 2; }
  else if (target === 'bar') x = BAR_X + BAR_W - 64;
  else { const r = windowRect('end', p.view, Hd); y = r[1] + r[3] / 2 + 70; }
  const f = (v: number) => Math.round(v * 1e4) / 1e4;
  return { x: f((sc.x + x * k) / W), y: f((sc.y + y * k) / H) };
}

// ---------------------------------------------------------------- the block
interface P {
  mode: Mode; view: View; query: string; erase: string; typeAt: number; cps: number; hint: string;
  sugg: string; suggAt: number; pick: number; pickAt: number; press: number; out: number; enter: number;
  tabs: string; tab: number; tabFrom: number; tabAt: number; title: string; titleSub: string; snip: string;
  load: number; loadText: string; facts: string; dym: string; dymAt: number; dymHi: number; dymLead: string; big: string; bigAt: number;
  chips: string; related: string; relatedLabel: string; qs: string; answer: string; reveal: string;
  snipAt: number; snipTitle: string; snipLead: string; snipNote: string; cardAt: number; badge: string; dur: string;
  time: string; battery: number; address: string; device: Device; px: number; font: string;
  bg: string; panel: string; line: string; ink: string; sub: string; accent: string; hl: string;
}
interface Bar { box: HTMLElement; mag: HTMLElement; type: TypeEl; mic: HTMLElement }
interface S {
  ph: PhoneEls; veil: HTMLElement; pane: HTMLElement; base: HTMLElement; ui: HTMLElement; key: string;
  sb: StatusBar; R: Record<string, HTMLElement>; L: Record<string, HTMLElement[]>; bar: Bar | null;
}
const svgIn = (el: HTMLElement, svg: string) => { if (el.dataset.k !== svg) { el.dataset.k = svg; el.innerHTML = svg; } };
const SVG = (inner: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%" style="display:block;overflow:visible">${inner}</svg>`;
const CHEV = (c: string) => SVG(`<path d="M26 38l24 24 24-24" fill="none" stroke="${c}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>`);
const PLAY = (c: string, bg: string) => SVG(`<circle cx="50" cy="50" r="46" fill="${bg}" stroke="${c}" stroke-width="5"/><path d="M40 28l34 22-34 22z" fill="${c}"/>`);
const MIC = (c: string) => SVG(`<rect x="38" y="12" width="24" height="46" rx="12" fill="${c}"/><path d="M26 46a24 24 0 0 0 48 0M50 70v14" fill="none" stroke="${c}" stroke-width="7" stroke-linecap="round"/>`);
/** the shimmer over a redacted bar: a light band sliding across */
const shimmer = (t: number, a: string, b: string, speed = 0.85) => { const s = ((t * speed) % 1) * 100; return `linear-gradient(90deg, ${a} 0%, ${b} ${s.toFixed(1)}%, ${a} 100%)`; };

export const search: ItemType<P, S> = {
  type: 'common.search', label: '搜尋頁', category: 'phone', kind: 'overlay',
  doc: '搜尋引擎的畫面（通用深色介面，不是哪一家：沒有 logo、沒有彩色字母，分頁、相關搜尋、搜尋中…、你是不是要找、精選摘要、完整版等字全是參數），用 mode 分：home 首頁疊在模糊壓暗的主軌片段上（headline hint、搜尋框逐字打字 query、自動完成清單 sugg 一行一個（「前綴|補完」或整行，跟 query 一樣的部分淡、其餘粗）、pick 第幾列 pickAt 秒點下去後框裡換成那一列、out 秒滑走）；results 結果頁（搜尋框打字，erase 先刪舊字；tabs 分頁「全部, 新聞…」底線從 tabFrom 滑到 tab；title 標題、titleSub 旁邊小字、snip 摘要；影片窗是圓角洞，主軌片段給 frame: searchWindow(參數, 寬, 高)；load 秒前蓋著「搜尋中…」載入卡；facts 一行一張「秒|小標|大字|單位」事實卡從影片窗左下彈出；dym 你是不是要找（dymAt 出現、dymHi 第幾個字標橘、dymLead 前面的字）；big 影片窗上的大字；related 相關搜尋「a, b; c」；press 秒按下搜尋框發亮；view full＝影片滿版，上方浮著搜尋框、分頁和 chips 一行一個「秒|字」篩選膠囊依序點亮）；ask 問答展開（qs 一行一題「秒-秒|問題|提示」，提示寫 redact＝答案打碼＋reveal「完整版揭曉」；一題展開成影片窗、收合時清單往上捲一列）；end 結尾（重打 query、自動完成點選，snipAt 精選摘要卡答案打碼（snipTitle、snipLead、snipNote），cardAt 結果卡：縮圖是影片窗、badge 標籤、title 標題、dur 片長、press 秒按下播放鈕）；時間都從項目開始算；enter 秒從下往上推入；9:16 鋪滿畫面，16:9／1:1 是畫面中間一支手機（device）；手指用 common.touch（位置用 searchPoint(參數, pick/bar/play, 寬, 高)），閃白用 core.flash，字幕用 common.caption，片尾用 common.outro；音效配 common.typing（打字）、common.tick（點）、common.pop（事實卡）',
  params: [
    { key: 'mode', label: '畫面（home 首頁、results 結果頁、ask 問答展開、end 結尾的精選摘要和結果卡）', type: 'enum', options: [...SEARCH_MODES], default: 'home' },
    { key: 'view', label: '結果頁的影片（window 影片窗、full 滿版加篩選膠囊）', type: 'enum', options: [...SEARCH_VIEWS], default: 'window' },
    { key: 'query', label: '搜尋框的字', type: 'string', default: '週末去哪玩' },
    { key: 'erase', label: '先刪掉的舊字（空＝沒有）', type: 'string', default: '' },
    { key: 'typeAt', label: '開始打字（秒；-1＝字已經在框裡）', type: 'number', min: -1, max: 60, step: 0.05, default: 0.2 },
    { key: 'cps', label: '每個字幾秒', type: 'number', min: 0.02, max: 1, step: 0.01, default: 0.1 },
    { key: 'hint', label: '首頁搜尋框上方的大字（空＝沒有）', type: 'string', default: '想去哪裡？' },
    { key: 'sugg', label: '自動完成（一行一列：前綴|補完，或整行）', type: 'text', default: '週末去哪玩 海邊\n週末去哪玩 老街\n週末去哪玩 一日遊' },
    { key: 'suggAt', label: '自動完成出現（秒；-1＝沒有）', type: 'number', min: -1, max: 60, step: 0.05, default: 1.0 },
    { key: 'pick', label: '點第幾列（從 0 算；-1＝不點）', type: 'number', min: -1, max: 9, step: 1, default: 1 },
    { key: 'pickAt', label: '點下去（秒）', type: 'number', min: 0, max: 60, step: 0.05, default: 2.2 },
    { key: 'press', label: '按下（秒；results 搜尋框發亮、end 播放鈕按下；-1＝沒有）', type: 'number', min: -1, max: 60, step: 0.05, default: -1 },
    { key: 'out', label: '最後幾秒滑走淡出（秒；0＝不走）', type: 'number', min: 0, max: 3, step: 0.05, default: 0 },
    { key: 'enter', label: '從下往上推入（秒；0＝不推）', type: 'number', min: 0, max: 3, step: 0.05, default: 0 },
    { key: 'tabs', label: '分頁（逗號分隔；空＝沒有分頁列）', type: 'string', default: '全部, 新聞, 圖片, 影片, 問答' },
    { key: 'tab', label: '目前的分頁（從 0 算）', type: 'number', min: 0, max: 9, step: 1, default: 0 },
    { key: 'tabFrom', label: '底線從哪個分頁滑過來（-1＝不滑）', type: 'number', min: -1, max: 9, step: 1, default: -1 },
    { key: 'tabAt', label: '底線滑動（秒）', type: 'number', min: 0, max: 60, step: 0.05, default: 0.05 },
    { key: 'title', label: '標題（results 結果標題、end 結果卡標題）', type: 'string', default: '週末小旅行' },
    { key: 'titleSub', label: '標題旁的小字', type: 'string', default: '' },
    { key: 'snip', label: '摘要（一行）', type: 'string', default: '海邊、老街、山上步道' },
    { key: 'load', label: '載入卡蓋到幾秒（0＝沒有）', type: 'number', min: 0, max: 30, step: 0.05, default: 0 },
    { key: 'loadText', label: '載入卡的字', type: 'string', default: '搜尋中…' },
    { key: 'facts', label: '事實卡（一行一張：秒|小標|大字|單位，或 秒|字）', type: 'text', default: '' },
    { key: 'dym', label: '你是不是要找：正確的字（空＝沒有）', type: 'string', default: '' },
    { key: 'dymAt', label: '你是不是要找出現（秒）', type: 'number', min: 0, max: 60, step: 0.05, default: 1 },
    { key: 'dymHi', label: '標出第幾個字（從 0 算；-1＝不標）', type: 'number', min: -1, max: 40, step: 1, default: -1 },
    { key: 'dymLead', label: '你是不是要找前面的字', type: 'string', default: '你是不是要找：' },
    { key: 'big', label: '影片窗上的大字（空＝沒有）', type: 'string', default: '' },
    { key: 'bigAt', label: '大字出現（秒）', type: 'number', min: 0, max: 60, step: 0.05, default: 1 },
    { key: 'chips', label: '篩選膠囊（view full；一行一個：秒|字，到時間點亮）', type: 'text', default: '' },
    { key: 'related', label: '相關搜尋（逗號分隔，分號換行；空＝沒有）', type: 'string', default: '海邊, 老街, 步道; 夜市, 溫泉' },
    { key: 'relatedLabel', label: '相關搜尋的標題', type: 'string', default: '相關搜尋' },
    { key: 'qs', label: '問答（ask；一行一題：秒-秒|問題|提示，提示寫 redact＝答案打碼）', type: 'text', default: '0-1.5|什麼季節去最好？|春天和秋天\n1.5-3|要待幾天？|redact\n3-4.5|怎麼去最方便？|搭火車' },
    { key: 'answer', label: '打碼答案前的字', type: 'string', default: '答案：' },
    { key: 'reveal', label: '打碼答案後的字（空＝沒有）', type: 'string', default: '完整版揭曉' },
    { key: 'snipAt', label: '精選摘要出現（秒，end）', type: 'number', min: 0, max: 60, step: 0.05, default: 2.4 },
    { key: 'snipTitle', label: '精選摘要的標題', type: 'string', default: '精選摘要' },
    { key: 'snipLead', label: '精選摘要的第一句（後面接打碼）', type: 'string', default: '答案是：' },
    { key: 'snipNote', label: '精選摘要下方的字', type: 'string', default: '答案在完整版' },
    { key: 'cardAt', label: '結果卡出現（秒，end）', type: 'number', min: 0, max: 60, step: 0.05, default: 2.6 },
    { key: 'badge', label: '結果卡的標籤（空＝沒有）', type: 'string', default: '完整版' },
    { key: 'dur', label: '結果卡的片長（空＝沒有）', type: 'string', default: '12:34' },
    { key: 'time', label: '狀態列的時間（空＝不寫）', type: 'string', default: '10:24' },
    { key: 'battery', label: '電量（%）', type: 'number', min: 0, max: 100, step: 1, default: 80 },
    { key: 'address', label: '網址列的字（空＝沒有網址列）', type: 'string', default: 'search · results' },
    { key: 'device', label: '手機（auto：9:16 鋪滿畫面、其他比例畫一支手機；phone 一律畫手機；bare 只要 9:16 的畫面不畫機身）', type: 'enum', options: DEVICES, default: 'auto' },
    { key: 'px', label: '手機中心 x（畫面寬比例；有手機時）', type: 'number', min: 0, max: 1, step: 0.005, default: 0.5 },
    { key: 'font', label: '字型', type: 'string', default: 'Noto Sans TC', theme: 'fonts.body' },
    { key: 'bg', label: '頁面底色', type: 'color', default: '#0e1620' },
    { key: 'panel', label: '搜尋框、卡片底色', type: 'color', default: '#1b2733' },
    { key: 'line', label: '分隔線', type: 'color', default: '#2a3a49' },
    { key: 'ink', label: '字色', type: 'color', default: '#eaf2f5' },
    { key: 'sub', label: '淡字、圖示', type: 'color', default: '#8fa3b3' },
    { key: 'accent', label: '強調色（框線、游標、分頁底線、亮起的膠囊）', type: 'color', default: '#2ec4b6' },
    { key: 'hl', label: '重點色（標出的字、揭曉、標籤）', type: 'color', default: '#ff8a3d' },
  ],
  build(ctx) {
    const ph = phoneEls(ctx.root), veil = lineAbs(ph.screen, { inset: '0' }), pane = lineAbs(ph.screen, { inset: '0' }), base = lineAbs(pane, { inset: '0' }), ui = lineAbs(pane, { inset: '0' });
    // the island stays last
    ph.screen.appendChild(ph.island);
    const s: S = { ph, veil, pane, base, ui, key: '', sb: statusBarEl(ui), R: {}, L: {}, bar: null };
    search.draw(ctx, s);
    return s;
  },
  draw(ctx, s) {
    const p = ctx.params, { W, H, theme, local: t, dur } = ctx;
    const { sc, k, Hd, X } = phoneView(W, H, theme.safe, p);
    placePhone(s.ph, sc);
    const font = `'${p.font}', 'Noto Sans TC', 'Segoe UI Emoji', sans-serif`;
    cssCamel(s.ph.screen, { fontFamily: font, color: p.ink });
    const mode = p.mode, full = mode === 'results' && p.view === 'full', win = windowRect(mode, p.view, Hd);
    const sugg = parseSugg(p.sugg, p.query), tabs = listOf(p.tabs), xs = tabXs(tabs);
    const y0 = mode === 'home' ? homeY(Hd) : BAR_Y;
    // ------------------------------------------------ the elements, built again only when something but the time changes
    const key = JSON.stringify(p) + `|${k}|${Hd}`;
    if (s.key !== key) {
      s.key = key;
      for (const e of [...s.ui.children]) if (e !== s.sb.el) e.remove();
      s.R = {}; s.L = {};
      buildUI(s, p, k, Hd, { win, sugg, tabs, xs, y0, full });
    }
    const { R, L } = s;
    // ------------------------------------------------ the page moving in (enter) and away (out)
    const shift = p.enter > 0 && !full ? (1 - eOut3(clamp(t / p.enter))) * Hd * 0.35 : 0, gone = p.out > 0 ? clamp((t - (dur - p.out)) / p.out) : 0;
    cssCamel(s.pane, { transform: `translateY(${(shift - eIO3(gone) * 260) * k}px)`, opacity: String(1 - gone) });
    cssCamel(s.veil, { display: mode === 'home' ? 'block' : 'none', opacity: String(1 - gone), backdropFilter: 'blur(14px) brightness(0.62) saturate(1.1)', webkitBackdropFilter: 'blur(14px) brightness(0.62)', background: 'rgba(8,14,20,0.35)' } as Record<string, string>);
    // ------------------------------------------------ the base: the page's colour with the window cut out (or a shade at the top)
    const picked = (mode === 'home' || mode === 'end') && p.pick >= 0 && sugg[p.pick] && t >= p.pickAt ? sugg[p.pick].text : null;
    if (mode === 'home') cssCamel(s.base, { display: 'none' });
    else if (full) cssCamel(s.base, { display: 'block', background: `linear-gradient(180deg, ${withAlpha(p.bg, 0.92)} 0, ${withAlpha(p.bg, 0.6)} ${X(434)}, ${withAlpha(p.bg, 0)} ${X(700)})` });
    else {
      const a = mode === 'end' ? 0.74 + 0.26 * clamp((t - p.pickAt) / 0.2) : 1;
      cssCamel(s.base, { display: 'block', background: withAlpha(p.bg, a) });
    }
    const holeOn = mode === 'ask' || (mode === 'results' && !full) || (mode === 'end' && t >= p.pickAt);
    punch(s.base, holeOn ? [win[0] * k, win[1] * k, win[2] * k, win[3] * k] : null, WIN_R * k);
    if (R.frame) cssCamel(R.frame, { display: holeOn ? 'block' : 'none' });
    // ------------------------------------------------ the status bar and the address pill
    cssCamel(s.sb.el, { display: mode === 'home' ? 'none' : 'block' });
    drawStatusBar(s.sb, { time: p.time, carrier: '', signal: 4, wifi: true, battery: p.battery, color: p.sub, font: p.font }, k, (sc.body ? 50 : 70) * k, sc.w, false);
    // ------------------------------------------------ the box
    const shown = picked ?? (p.typeAt >= 0 ? typed(p.query, t, { at: p.typeAt, cps: p.cps, erase: p.erase }) : { s: p.query, typing: false }).s;
    const typing = p.typeAt >= 0 && !picked && t >= p.typeAt && shown !== p.query;
    const until = mode === 'home' || mode === 'end' ? (p.pick >= 0 && sugg[p.pick] ? p.pickAt : Infinity) : p.press >= 0 ? p.press : Infinity;
    const caret = mode !== 'ask' && !full && p.typeAt >= 0 && t < until && (typing || caretOn(t, 2.2));
    if (s.bar) {
      drawType(s.bar.type, shown, caret, p.accent);
      const glow = p.press >= 0 && mode === 'results' ? clamp(1 - Math.abs(t - p.press) / 0.3) : 0;
      cssCamel(s.bar.box, { boxShadow: glow > 0 ? `0 0 ${40 * glow * k}px ${withAlpha(p.accent, 0.55 * glow)}` : 'none' });
    }
    // ------------------------------------------------ the tabs' underline
    if (R.under && xs.length) {
      const to = xs[clamp(Math.round(p.tab), 0, xs.length - 1)], from = p.tabFrom >= 0 ? xs[clamp(Math.round(p.tabFrom), 0, xs.length - 1)] : to;
      const q = eIO3(clamp((t - p.tabAt) / 0.45)), on = q >= 0.5 ? to : from;
      cssCamel(R.under, { left: X(lerp(from[0], to[0], q)), width: X(lerp(from[1], to[1], q)) });
      L.tabs?.forEach((e, i) => cssCamel(e, { color: xs[i] === on ? p.ink : p.sub }));
    }
    // ------------------------------------------------ autocomplete (home, end)
    if (R.drop) {
      const sp = p.suggAt >= 0 ? eOut3(clamp((t - p.suggAt) / 0.25)) : 0, fade = mode === 'end' ? 1 - clamp((t - p.pickAt) / 0.25) : 1;
      const n = L.sugg.length, ph = n * ROW_H + 30;
      cssCamel(R.drop, { display: sp > 0 && fade > 0 ? 'block' : 'none', opacity: String(sp * fade), height: X(BAR_H / 2 + ph * sp) });
      L.sugg.forEach((e, i) => {
        const rp = eOut3(clamp((t - p.suggAt - i * 0.07) / 0.22)), hot = i === p.pick && t >= p.pickAt - 0.05;
        cssCamel(e, { opacity: String(rp * fade), transform: `translateY(${(1 - rp) * 20 * k}px)`, background: hot ? withAlpha(p.accent, 0.18) : 'transparent' });
      });
    }
    // ------------------------------------------------ results
    if (mode === 'results') {
      const tp = eOut3(clamp((t - 0.12) / 0.3)), dymOn = !!p.dym && t >= p.dymAt;
      if (R.head) cssCamel(R.head, { opacity: String(dymOn ? 0 : tp), transform: `translateY(${(1 - tp) * 16 * k}px)` });
      if (R.dym) {
        const q = dymOn ? eOut3(clamp((t - p.dymAt) / 0.3)) : 0;
        cssCamel(R.dym, { display: q > 0 ? 'flex' : 'none', opacity: String(q), transform: `translateY(${(1 - q) * 14 * k}px)` });
        if (R.dymLine) cssCamel(R.dymLine, { width: `${100 * eOut3(clamp((t - p.dymAt - 0.25) / 0.3))}%` });
      }
      if (R.load) {
        const a = p.load > 0 && t < p.load + 0.2 ? 1 - clamp((t - p.load) / 0.2) : 0;
        cssCamel(R.load, { display: a > 0 ? 'block' : 'none', opacity: String(a) });
        if (R.loadFill) cssCamel(R.loadFill, { width: `${(6 + 22 * clamp(t / Math.max(0.01, p.load))).toFixed(2)}%` });
      }
      const facts = parseFacts(p.facts);
      let cur = -1;
      facts.forEach((f, i) => { if (t >= f.at) cur = i; });
      L.facts?.forEach((e, i) => {
        if (i !== cur) { cssCamel(e, { display: 'none' }); return; }
        const f = facts[i], q = eBack(clamp((t - f.at) / 0.35), 1.9), nx = facts[i + 1], o = nx ? clamp((t - (nx.at - 0.12)) / 0.12) : 0;
        cssCamel(e, { display: 'flex', opacity: String(clamp(q * 1.4) * (1 - o)), transform: `scale(${lerp(0.85, 1, q)})` });
      });
      if (R.big) {
        const q = p.big && t >= p.bigAt ? eBack(clamp((t - p.bigAt) / 0.4), 1.9) : 0;
        cssCamel(R.big, { display: q > 0 ? 'block' : 'none', opacity: String(clamp(q * 1.5)), transform: `translate(-50%, -50%) scale(${lerp(0.7, 1, q)})` });
      }
      if (full && L.chips) {
        const chips = parseSteps(p.chips);
        let act = -1;
        chips.forEach((c, i) => { if (t >= c.t) act = i; });
        const fin = eOut3(clamp(t / Math.max(0.01, p.enter || 0.3)));
        cssCamel(s.ui, { opacity: String(fin) });
        L.chips.forEach((e, i) => {
          const on = i === act, done = i < act, u = on ? clamp(eBack(clamp((t - chips[i].t) / 0.3), 1.9)) : 0, sc2 = 1 + 0.12 * Math.sin(Math.PI * u);
          cssCamel(e, { transform: `scale(${sc2})`, background: on ? p.accent : done ? withAlpha(p.accent, 0.22) : withAlpha(p.bg, 0.72), borderColor: on || done ? p.accent : withAlpha(p.ink, 0.35), color: on ? p.bg : p.ink });
        });
      } else cssCamel(s.ui, { opacity: '1' });
    } else cssCamel(s.ui, { opacity: '1' });
    // ------------------------------------------------ ask
    if (mode === 'ask' && L.rows) {
      const qs = parseAsk(p.qs), st = askAt(qs, t), Q = qs[st.cur];
      if (R.cover) cssCamel(R.cover, { height: `${(st.cover * 100).toFixed(3)}%`, display: st.cover > 0.001 ? 'block' : 'none' });
      let lowest = 0;
      L.rows.forEach((e, i) => {
        const y = askRowY(i, st, win[3]), on = i === st.cur;
        lowest = Math.max(lowest, y + ASK_H);
        const vis = y > ASK_Y - ASK_H - 10 && y < Hd;
        cssCamel(e, { display: vis ? 'block' : 'none', top: X(y - (ASK_Y - 10)) });
        const q = e.firstElementChild as HTMLElement, chev = e.lastElementChild as HTMLElement;
        cssCamel(q, { fontWeight: on ? '900' : '700', color: on ? p.ink : p.sub });
        svgIn(chev, CHEV(on ? p.accent : p.sub));
        cssCamel(chev, { transform: `rotate(${on ? 180 * eIO3(st.open) * (1 - eIO3(st.close)) : 0}deg)` });
      });
      if (R.rel) { const ry = Math.max(lowest + 20, win[1] + win[3] + 40); cssCamel(R.rel, { top: X(ry - (ASK_Y - 10)), display: ry < Hd ? 'block' : 'none' }); }
      L.hints?.forEach((e, i) => {
        const hp = i === st.cur && Q ? eOut3(clamp((t - Q.t0 - 0.5) / 0.3)) * (1 - st.close) : 0;
        cssCamel(e, { display: hp > 0 ? 'flex' : 'none', opacity: String(hp) });
      });
      L.bars?.forEach((e) => cssCamel(e, { background: shimmer(t, '#4a5b69', '#7d909e', 0.9) }));
    }
    // ------------------------------------------------ end
    if (mode === 'end') {
      const sp = eOut3(clamp((t - p.snipAt) / 0.35)), cp = eOut3(clamp((t - p.cardAt) / 0.35));
      if (R.snip) cssCamel(R.snip, { display: sp > 0 ? 'block' : 'none', opacity: String(sp), transform: `translateY(${(1 - sp) * 30 * k}px)` });
      L.bars?.forEach((e) => cssCamel(e, { background: shimmer(t, '#3a4b59', '#6f8494', 0.8) }));
      if (R.cover) cssCamel(R.cover, { display: t >= p.pickAt && cp < 1 ? 'block' : 'none', opacity: String(1 - cp) });
      if (R.card) cssCamel(R.card, { display: cp > 0 ? 'block' : 'none', opacity: String(cp) });
      if (R.play) {
        const pr = p.press >= 0 && t >= p.press ? 1 - 0.12 * Math.sin(Math.PI * clamp((t - p.press) / 0.25)) : 1;
        cssCamel(R.play, { transform: `translate(-50%, -50%) scale(${pr})` });
      }
      if (R.rel) cssCamel(R.rel, { display: t >= p.pickAt ? 'block' : 'none' });
      if (R.headBg) cssCamel(R.headBg, { display: 'block' });
    }
  },
};

/** every element of the page for these parameters, styled once in px at k; draw() animates them */
function buildUI(s: S, p: P, k: number, Hd: number, o: { win: Rect; sugg: Sugg[]; tabs: string[]; xs: Array<[number, number]>; y0: number; full: boolean }) {
  const X = (v: number) => `${v * k}px`, ui = s.ui, R = s.R, L = s.L, mode = p.mode, { win } = o;
  const fs = (text: string, px: number, room: number) => `${fitPx(text, px * k, room * k)}px`;
  // the window's thin rim
  R.frame = lineAbs(ui, { left: X(win[0]), top: X(win[1]), width: X(win[2]), height: X(win[3]), borderRadius: X(WIN_R), boxSizing: 'border-box', border: `${2 * k}px solid rgba(255,255,255,0.10)` });
  // related searches (results, ask, end)
  const related = (parent: HTMLElement, top: number, nRows: number) => {
    const box = lineAbs(parent, { left: '0', top: X(top), width: X(1080), height: X(100 + nRows * 100) });
    lineAbs(box, { left: X(52), top: '0', width: X(976), height: X(2), background: p.line });
    const lb = lineAbs(box, { left: X(52), top: X(32), fontSize: X(40), fontWeight: '700', color: p.sub });
    lb.textContent = p.relatedLabel;
    parseRelated(p.related).slice(0, nRows).forEach((row, li) => {
      const r = lineAbs(box, { left: X(52), top: X(100 + li * 100), display: 'flex', gap: X(16) });
      for (const w of row) {
        const pill = h('div', null, null, r);
        cssCamel(pill, { position: 'relative', display: 'flex', alignItems: 'center', gap: X(14), height: X(84), padding: `0 ${X(34)} 0 ${X(26)}`, boxSizing: 'border-box', borderRadius: X(42), background: p.panel, border: `${2 * k}px solid ${p.line}`, fontSize: X(44), fontWeight: '500', color: p.ink, whiteSpace: 'pre', lineHeight: '1', flex: 'none' });
        const ic = h('div', null, null, pill); cssCamel(ic, { width: X(30), height: X(30), flex: 'none' }); svgIn(ic, glyphSvg('search', p.sub));
        const tx = h('span', null, null, pill); tx.textContent = w;
      }
    });
    return box;
  };
  // ask: the window's cover and the question list sit under the header
  if (mode === 'ask') {
    const cv = lineAbs(ui, { left: X(win[0]), top: X(win[1]), width: X(win[2]), height: X(win[3]), borderRadius: X(WIN_R), overflow: 'hidden' });
    R.cover = lineAbs(cv, { left: '0', bottom: '0', width: '100%', height: '100%', background: p.bg });
    const list = lineAbs(ui, { left: '0', top: X(ASK_Y - 10), width: '100%', height: X(Hd - ASK_Y + 10), overflow: 'hidden' });
    const qs = parseAsk(p.qs);
    L.rows = qs.map((q) => {
      const row = lineAbs(list, { left: '0', width: '100%', height: X(ASK_H), background: p.bg });
      const tx = lineAbs(row, { left: X(52), top: '50%', transform: 'translateY(-50%)', fontSize: fs(q.q, 58, 820) });
      tx.textContent = q.q;
      lineAbs(row, { left: X(40), bottom: '0', width: X(1000), height: X(2), background: p.line });
      lineAbs(row, { left: X(1080 - 120 - 26), top: X(ASK_H / 2 - 26), width: X(52), height: X(52) });
      return row;
    });
    if (p.related) R.rel = related(list, 0, 2);
    // the hint or the redacted answer at the window's foot
    L.bars = [];
    L.hints = qs.map((q) => {
      const y = win[1] + win[3] - 150;
      if (q.redact) {
        const box = lineAbs(ui, { left: X(52), top: X(y - 10), width: X(976), height: X(128), borderRadius: X(28), background: withAlpha(p.bg, 0.86), display: 'flex', alignItems: 'center', gap: X(18), padding: `0 ${X(34)}`, boxSizing: 'border-box' });
        const a = h('div', null, null, box); a.textContent = p.answer; cssCamel(a, { fontSize: X(50), fontWeight: '700', color: p.ink, whiteSpace: 'pre', lineHeight: '1', flex: 'none' });
        for (let j = 0; j < 2; j++) { const b = h('div', null, null, box); cssCamel(b, { width: X(200), height: X(48), borderRadius: X(12), flex: 'none' }); L.bars.push(b); }
        const sp = h('div', null, null, box); cssCamel(sp, { flex: '1' });
        if (p.reveal) { const r = h('div', null, null, box); r.textContent = p.reveal; cssCamel(r, { fontSize: fs(p.reveal, 46, 300), fontWeight: '700', color: p.hl, whiteSpace: 'pre', lineHeight: '1', flex: 'none' }); }
        return box;
      }
      const pill = lineAbs(ui, { left: X(52), top: X(y), display: 'flex', alignItems: 'center', height: X(88), padding: `0 ${X(30)}`, borderRadius: X(28), background: withAlpha(p.bg, 0.86), fontSize: fs(q.hint, 52, 900), fontWeight: '700', color: p.ink });
      pill.textContent = q.hint;
      if (!q.hint) cssCamel(pill, { visibility: 'hidden' });
      return pill;
    });
  }
  // end: the result card's cover and card over the thumbnail window
  if (mode === 'end') {
    R.cover = lineAbs(ui, { left: X(win[0]), top: X(win[1]), width: X(win[2]), height: X(win[3]), borderRadius: X(WIN_R), background: p.bg });
    const card = R.card = lineAbs(ui, { left: X(win[0]), top: X(win[1]), width: X(win[2]), height: X(win[3]), borderRadius: X(WIN_R), overflow: 'hidden' });
    lineAbs(card, { left: '0', top: '0', width: '100%', height: X(240), background: `linear-gradient(180deg, ${withAlpha(p.bg, 0.85)}, ${withAlpha(p.bg, 0)})` });
    if (p.badge) { const b = lineAbs(card, { left: X(36), top: X(26), padding: `${X(8)} ${X(22)}`, borderRadius: X(14), background: p.hl, color: p.bg, fontSize: X(46), fontWeight: '900' }); b.textContent = p.badge; }
    const tt = lineAbs(card, { left: X(42), top: X(p.badge ? 112 : 40), fontSize: fs(p.title, 60, 940), fontWeight: '900', color: p.ink, textShadow: `0 0 ${10 * k}px ${withAlpha(p.bg, 0.7)}` });
    tt.textContent = p.title;
    R.play = lineAbs(card, { left: '50%', top: X(win[3] / 2 + 70), width: X(172), height: X(172) });
    svgIn(R.play, PLAY(p.ink, withAlpha(p.bg, 0.7)));
    if (p.dur) { const d = lineAbs(card, { right: X(26), bottom: X(26), padding: `${X(8)} ${X(18)}`, borderRadius: X(14), background: 'rgba(0,0,0,0.7)', color: '#fff', fontSize: X(40), fontWeight: '700' }); d.textContent = p.dur; }
    if (p.related) R.rel = related(ui, win[1] + win[3] + 20, 1);
  }
  // results: the window's furniture and the title area
  if (mode === 'results' && !o.full) {
    if (p.related) R.rel = related(ui, win[1] + win[3] + 40, 2);
    const head = R.head = lineAbs(ui, { left: X(52), top: X(470), width: X(976), height: X(140) });
    if (p.title) {
      const row = lineAbs(head, { left: '0', top: '0', display: 'flex', alignItems: 'baseline', gap: X(22) });
      const a = h('div', null, null, row); a.textContent = p.title; cssCamel(a, { fontSize: fs(p.title, 66, 700), fontWeight: '900', color: p.ink, whiteSpace: 'pre', lineHeight: '1' });
      if (p.titleSub) { const b = h('div', null, null, row); b.textContent = p.titleSub; cssCamel(b, { fontSize: X(40), fontWeight: '500', color: p.sub, whiteSpace: 'pre', lineHeight: '1' }); }
    }
    if (p.snip) { const sn = lineAbs(head, { left: '0', top: X(p.title ? 92 : 30), fontSize: fs(p.snip, 46, 976), fontWeight: '500', color: p.sub }); sn.textContent = p.snip; }
    if (p.dym) {
      const d = R.dym = lineAbs(ui, { left: X(52), top: X(500), display: 'flex', alignItems: 'baseline' });
      const lead = h('div', null, null, d); lead.textContent = p.dymLead; cssCamel(lead, { fontSize: X(50), fontWeight: '500', color: p.sub, whiteSpace: 'pre', lineHeight: '1' });
      [...p.dym].forEach((ch, i) => {
        const c = h('div', null, null, d); c.textContent = ch;
        cssCamel(c, { position: 'relative', fontSize: X(58), fontWeight: '900', color: i === p.dymHi ? p.hl : p.accent, whiteSpace: 'pre', lineHeight: '1' });
        if (i === p.dymHi) { R.dymLine = h('div', null, null, c); cssCamel(R.dymLine, { position: 'absolute', left: '0', top: X(68), height: X(6), background: p.hl }); }
      });
    }
    if (p.load > 0) {
      const ld = R.load = lineAbs(ui, { left: X(win[0]), top: X(win[1]), width: X(win[2]), height: X(win[3]), borderRadius: X(WIN_R), background: p.panel });
      const tx = lineAbs(ld, { left: '50%', top: X(win[3] / 2 - 30), transform: 'translate(-50%, -100%)', fontSize: fs(p.loadText, 54, win[2] - 120), fontWeight: '700', color: p.ink });
      tx.textContent = p.loadText;
      const track = lineAbs(ld, { left: X(120), top: X(win[3] / 2 + 40), width: X(win[2] - 240), height: X(14), borderRadius: X(7), background: p.line, overflow: 'hidden' });
      R.loadFill = lineAbs(track, { left: '0', top: '0', height: '100%', borderRadius: X(7), background: p.accent });
    }
    L.facts = parseFacts(p.facts).map((f) => {
      const big = !!f.big, ch = big ? 236 : 140;
      const card = lineAbs(ui, { left: X(win[0] + 40), top: X(win[1] + win[3] - 40 - ch), height: X(ch), minWidth: X(272), boxSizing: 'border-box', padding: `0 ${X(36)}`, borderRadius: X(30), background: withAlpha(p.ink, 0.96), color: p.bg, overflow: 'hidden',
        flexDirection: 'column', justifyContent: 'center', transformOrigin: '0 100%' });
      lineAbs(card, { left: '0', top: '0', width: X(12), height: '100%', background: p.accent });
      if (big) {
        const a = h('div', null, null, card); a.textContent = f.label; cssCamel(a, { fontSize: X(46), fontWeight: '700', color: withAlpha(p.bg, 0.72), whiteSpace: 'pre', lineHeight: '1', marginBottom: X(14) });
        const row = h('div', null, null, card); cssCamel(row, { display: 'flex', alignItems: 'baseline', gap: X(14), whiteSpace: 'pre', lineHeight: '1' });
        const b = h('div', null, null, row); b.textContent = f.big; cssCamel(b, { fontSize: fs(f.big, 124, 760), fontWeight: '900' });
        if (f.unit) { const u = h('div', null, null, row); u.textContent = f.unit; cssCamel(u, { fontSize: X(64), fontWeight: '900' }); }
      } else {
        const a = h('div', null, null, card); a.textContent = f.label; cssCamel(a, { fontSize: fs(f.label, 64, 900), fontWeight: '900', whiteSpace: 'pre', lineHeight: '1' });
      }
      return card;
    });
    if (p.big) {
      R.big = lineAbs(ui, { left: X(540), top: X(win[1] + 150), fontSize: fs(p.big, 120, 980), fontWeight: '900', color: p.ink, transformOrigin: '50% 50%', paintOrder: 'stroke fill',
        webkitTextStroke: `${18 * k}px ${withAlpha(p.bg, 0.85)}` });
      R.big.textContent = p.big;
    }
  }
  // the header: the page colour behind the status bar, address, box and tabs (opaque over the ask list; end before the pick shows the
  // page under it dimmed except here)
  if (mode === 'ask' || mode === 'end') R.headBg = lineAbs(ui, { left: '0', top: '0', width: '100%', height: X(ASK_Y - 10), background: p.bg });
  ui.appendChild(s.sb.el);
  if (mode !== 'home' && p.address) {
    const a = lineAbs(ui, { left: X(64), top: X(118), width: X(952), height: X(70), borderRadius: X(35), background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: p.sub, fontSize: fs(p.address, 30, 880), fontWeight: '500' });
    a.textContent = p.address;
  }
  // end: the featured snippet under the header
  if (mode === 'end') {
    const sn = R.snip = lineAbs(ui, { left: X(24), top: X(SNIP_Y), width: X(1032), height: X(SNIP_H), borderRadius: X(34), background: mixPanel(p), boxSizing: 'border-box', border: `${3 * k}px solid ${p.accent}` });
    const a = lineAbs(sn, { left: X(46), top: X(44), fontSize: X(44), fontWeight: '700', color: p.accent }); a.textContent = p.snipTitle;
    const b = lineAbs(sn, { left: X(46), top: X(122), fontSize: fs(p.snipLead, 64, 940), fontWeight: '900', color: p.ink }); b.textContent = p.snipLead;
    L.bars = [0, 1, 2].map((j) => lineAbs(sn, { left: X(46), top: X(218 + j * 70), width: X(j === 2 ? 640 : 940), height: X(46), borderRadius: X(12) }));
    const c = lineAbs(sn, { left: X(46), top: X(412), fontSize: fs(p.snipNote, 58, 940), fontWeight: '900', color: p.hl }); c.textContent = p.snipNote;
  }
  // the tabs
  if (mode !== 'home' && o.tabs.length) {
    L.tabs = o.tabs.map((w, i) => { const e = lineAbs(ui, { left: X(o.xs[i][0]), top: X(TAB_Y), fontSize: X(TAB_FS), fontWeight: '500' }); e.textContent = w; return e; });
    R.under = lineAbs(ui, { top: X(TAB_Y + 66), height: X(7), borderRadius: X(3.5), background: p.accent });
    if (!o.full) lineAbs(ui, { left: '0', top: X(TAB_Y + 76), width: '100%', height: X(2), background: p.line });
  }
  // results full: the filter chips under the tabs
  if (mode === 'results' && o.full) {
    const row = lineAbs(ui, { left: X(52), top: X(490), display: 'flex', gap: X(18) });
    L.chips = parseSteps(p.chips).map((c) => {
      const e = h('div', null, null, row); e.textContent = c.v[0] ?? '';
      cssCamel(e, { height: X(92), padding: `0 ${X(32)}`, display: 'flex', alignItems: 'center', boxSizing: 'border-box', borderRadius: X(46), border: `${3 * k}px solid`, fontSize: X(52), fontWeight: '700', whiteSpace: 'pre', lineHeight: '1', flex: 'none' });
      return e;
    });
  }
  // home: the headline over the box
  if (mode === 'home' && p.hint) {
    const hd = lineAbs(ui, { left: '0', width: '100%', top: X(o.y0 - 70), transform: 'translateY(-100%)', textAlign: 'center', fontSize: fs(p.hint, 76, 960), fontWeight: '900', color: p.ink, textShadow: `0 ${2 * k}px ${12 * k}px rgba(0,0,0,0.35)` });
    hd.textContent = p.hint;
  }
  // the autocomplete list (home, end), under the box
  if ((mode === 'home' || mode === 'end') && o.sugg.length) {
    R.drop = lineAbs(ui, { left: X(BAR_X), top: X(o.y0 + BAR_H / 2), width: X(BAR_W), borderRadius: X(40), background: p.panel, border: `${3 * k}px solid ${p.accent}`, boxSizing: 'border-box', overflow: 'hidden' });
    L.sugg = o.sugg.map((sg, i) => {
      const r = lineAbs(R.drop, { left: X(4), top: X(BAR_H / 2 + 14 + i * ROW_H - 3), width: X(BAR_W - 14), height: X(ROW_H - 6), display: 'flex', alignItems: 'center' });
      const ic = h('div', null, null, r); cssCamel(ic, { width: X(36), height: X(36), marginLeft: X(42), marginRight: X(26), flex: 'none' }); svgIn(ic, glyphSvg('search', p.sub));
      const size = fs(sg.text, 52, 820);
      const a = h('span', null, null, r); a.textContent = sg.lead; cssCamel(a, { fontSize: size, fontWeight: '500', color: p.sub, whiteSpace: 'pre', lineHeight: '1' });
      const b = h('span', null, null, r); b.textContent = sg.rest; cssCamel(b, { fontSize: size, fontWeight: '700', color: p.ink, whiteSpace: 'pre', lineHeight: '1' });
      return r;
    });
  }
  // the box
  const box = lineAbs(ui, { left: X(BAR_X), top: X(o.y0), width: X(BAR_W), height: X(BAR_H), borderRadius: X(BAR_H / 2), background: p.panel, boxSizing: 'border-box',
    border: `${3 * k}px solid ${mode === 'ask' || o.full ? p.line : p.accent}` });
  const mag = lineAbs(box, { left: X(40), top: X(BAR_H / 2 - 22), width: X(44), height: X(44) }); svgIn(mag, glyphSvg('search', p.sub));
  const mic = lineAbs(box, { right: X(42), top: X(BAR_H / 2 - 28), width: X(52), height: X(52) }); svgIn(mic, MIC(p.sub));
  const type = typeEl(box);
  const longest = [p.query, p.erase, ...o.sugg.map((x) => x.text)].reduce((a, b) => (textEm(b) > textEm(a) ? b : a), '');
  cssCamel(type.el, { left: X(110), top: '50%', transform: 'translateY(-50%)', fontSize: fs(longest, 50, 770), fontWeight: '500', color: p.ink });
  s.bar = { box, mag, type, mic };
}
/** the featured snippet's card: the panel a shade darker towards the page */
const mixPanel = (p: P) => `color-mix(in srgb, ${p.panel} 60%, ${p.bg})`;
