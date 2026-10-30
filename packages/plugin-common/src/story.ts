// common.story — a story's interactive stickers, from t2-reels' fx.storySticker (its poll, slider and timer kinds): kind poll is a
// question with two to four answers whose bars fill to the result percentages (counting up) once the vote comes in at `at`, a tick
// on the one picked; kind slider is a question over a track whose emoji thumb slides to `value` between `at` and `end`; kind timer
// is a dark sticker whose mm:ss clock runs from `from` to `to` seconds between `at` and `end` (waiting, counting down). The sticker
// pops in, tilted by `rot`, and shrinks away in the item's last 0.2 s. (The source's location / price / text stickers are
// common.tag's label, common.hangtag and common.tag / common.caption; a ring timer is common.countdown.)
// On 9:16 it uses the frame; on a wide or square frame it sits on the same phone as common.reels.
import { clamp, cssCamel, eBack, eIO3, eOut3 as eOut, fitLines, h, type ItemType } from '@tellcut/engine';
import { DEVICES, glyphSvg, ICON_KINDS, phoneEls, phoneView, placePhone, type Device, type PhoneEls } from './phone.ts';
import { fitPx } from './text.ts';
import { withAlpha } from './color.ts';
import { WORDS, wordsLang, type WordsLang } from './words.ts';

export const STORY_KINDS = ['poll', 'slider', 'timer'] as const;
type Kind = typeof STORY_KINDS[number];

/** the answers "a|b|c" (two to four; yes and no in `lang` when fewer are given) and their result shares, scaled to 100 % */
export function pollOf(options: string, votes: string, lang: WordsLang = 'zh'): { opts: string[]; shares: number[] } {
  let opts = String(options ?? '').split('|').map((x) => x.trim()).filter(Boolean).slice(0, 4);
  if (opts.length < 2) opts = [...opts, ...WORDS.yesNo[lang]].slice(0, 2);
  const v = String(votes ?? '').split(/[,，\s]+/).map(Number).map((x) => (Number.isFinite(x) && x > 0 ? x : 0));
  const raw = opts.map((_, i) => v[i] ?? 0), sum = raw.reduce((a, b) => a + b, 0);
  return { opts, shares: sum > 0 ? raw.map((x) => x / sum) : opts.map(() => 1 / opts.length) };
}
/** a clock of `sec` seconds: m:ss under an hour (mm with two digits), h:mm:ss above */
export function clockText(sec: number): string {
  const s = Math.max(0, Math.floor(sec + 1e-6)), hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60, two = (n: number) => String(n).padStart(2, '0');
  return hh ? `${hh}:${two(mm)}:${two(ss)}` : `${two(mm)}:${two(ss)}`;
}
/** the timer's seconds at t: from → to between at and end (whole seconds, counting either way) */
export const timerAt = (t: number, at: number, end: number, from: number, to: number) => from + (to - from) * clamp((t - at) / Math.max(1e-6, end - at));
/** the slider's position at t: 0 → value between at and end, eased */
export const sliderAt = (t: number, at: number, end: number, value: number) => clamp(value) * eIO3(clamp((t - at) / Math.max(1e-6, end - at)));

interface P {
  kind: Kind; text: string; options: string; votes: string; pick: number; emoji: string; value: number; from: number; to: number; icon: string;
  at: number; end: number; x: number; y: number; rot: number; scale: number; device: Device; px: number;
  font: string; round: string; paper: string; ink: string; accent: string; hl: string;
}
interface Opt { row: HTMLElement; fill: HTMLElement; label: HTMLElement; tick: HTMLElement; pct: HTMLElement }
interface S { ph: PhoneEls; card: HTMLElement; q: HTMLElement; opts: Opt[]; track: HTMLElement; bar: HTMLElement; thumb: HTMLElement; icon: HTMLElement; col: HTMLElement; label: HTMLElement; num: HTMLElement; key: string }

export const story: ItemType<P, S> = {
  type: 'common.story', label: '限動貼紙', category: 'phone', kind: 'overlay',
  doc: '限動的互動貼紙（彈出、照 rot 歪一點，最後 0.2 秒縮掉）：kind poll 投票——問題（text）加兩到四個選項（options 用 | 分開），在 at 投票、每格填到結果百分比（votes 例如 62,38，數字往上跳），pick 那個打勾；slider 表情滑桿——問題下面一條軌道，emoji 從 at 到 end 滑到 value（0–1）；timer 計時——深色貼紙，mm:ss 從 from 秒在 at 到 end 之間跑到 to 秒（等待、倒數都行，icon 是內建圖示或一個 emoji）；x、y 是中心（手機畫面比例）；9:16 用整個畫面，16:9／1:1 跟 common.reels 疊在同一支手機上（device）；地點貼紙用 common.tag 的 label、價格用 common.hangtag、文字貼紙用 common.tag／common.caption、計時環用 common.countdown；音效配 common.pop（出現、投票）、common.tick（計時）',
  params: [
    { key: 'kind', label: '種類（poll 投票、slider 表情滑桿、timer 計時）', type: 'enum', options: [...STORY_KINDS], default: 'poll' },
    { key: 'text', label: '問題（poll、slider；timer：時間上面的小字）', type: 'string', default: '要不要再去一次？' },
    { key: 'options', label: '選項（poll：兩到四個，用 | 分開；不到兩個就補「是」「否」，問題是英文、日文就補英文、日文）', type: 'string', default: '當然要 😍|下次再說' },
    { key: 'votes', label: '結果（poll：每個選項的票數或百分比，逗號分隔）', type: 'string', default: '72,28' },
    { key: 'pick', label: '打勾的選項（poll：從 0 數，-1＝不打勾）', type: 'number', min: -1, max: 3, step: 1, default: 0 },
    { key: 'emoji', label: '滑桿上的表情（slider）', type: 'string', default: '🤩' },
    { key: 'value', label: '滑到哪裡（slider：0–1）', type: 'number', min: 0, max: 1, step: 0.01, default: 0.9 },
    { key: 'from', label: '開始的秒數（timer）', type: 'number', min: 0, max: 86400, step: 1, default: 0 },
    { key: 'to', label: '結束的秒數（timer；比 from 小就是倒數）', type: 'number', min: 0, max: 86400, step: 1, default: 600 },
    { key: 'icon', label: '圖示（timer：內建圖示名或一個 emoji；空＝不要）', type: 'string', default: 'clock' },
    { key: 'at', label: '開始（項目內秒數：poll 投票、slider 開始滑、timer 開始跑）', type: 'number', min: 0, max: 600, step: 0.05, default: 0.8 },
    { key: 'end', label: '結束（slider 滑到、timer 跑到；poll 填滿的時間）', type: 'number', min: 0, max: 600, step: 0.05, default: 2.2 },
    { key: 'x', label: '中心 x（手機畫面寬比例）', type: 'number', min: 0, max: 1, step: 0.005, default: 0.5 },
    { key: 'y', label: '中心 y（手機畫面高比例）', type: 'number', min: 0, max: 1, step: 0.005, default: 0.4 },
    { key: 'rot', label: '旋轉（度）', type: 'number', min: -30, max: 30, step: 0.5, default: -3 },
    { key: 'scale', label: '大小', type: 'number', min: 0.3, max: 2, step: 0.05, default: 1 },
    { key: 'device', label: '手機（auto：9:16 鋪滿畫面、其他比例畫一支手機；phone 一律畫手機；bare 只要 9:16 的畫面不畫機身）', type: 'enum', options: DEVICES, default: 'auto' },
    { key: 'px', label: '手機中心 x（畫面寬比例；有手機時）', type: 'number', min: 0, max: 1, step: 0.005, default: 0.5 },
    { key: 'font', label: '字型', type: 'string', default: 'Noto Sans TC', theme: 'fonts.body' },
    { key: 'round', label: '問題的圓體', type: 'string', default: 'Huninn' },
    { key: 'paper', label: '貼紙底色（poll、slider）', type: 'color', default: '#ffffff', theme: 'palette.paper' },
    { key: 'ink', label: '貼紙字色（poll、slider）', type: 'color', default: '#1b1b1b', theme: 'palette.ink' },
    { key: 'accent', label: '填色的尾端（poll、slider）', type: 'color', default: '#ff6b3d', theme: 'palette.accent' },
    { key: 'hl', label: '填色的起頭（poll、slider；timer 的數字）', type: 'color', default: '#ffd84d', theme: 'palette.hl' },
  ],
  build(ctx) {
    const ph = phoneEls(ctx.root), card = h('div', null, null, ph.screen), q = h('div', null, null, card);
    cssCamel(card, { position: 'absolute', boxSizing: 'border-box', transformOrigin: '50% 50%' });
    const track = h('div', null, null, card), bar = h('div', null, null, track), thumb = h('div', null, null, track);
    const icon = h('div', null, null, card), col = h('div', null, null, card), label = h('div', null, null, col), num = h('div', null, null, col);
    return { ph, card, q, opts: [], track, bar, thumb, icon, col, label, num, key: '' };
  },
  draw(ctx, s) {
    const p = ctx.params, { W, H, theme, local: t, dur } = ctx;
    const { sc, k, Hd, X } = phoneView(W, H, theme.safe, p);
    placePhone(s.ph, sc);
    const font = `'${p.font}', 'Noto Sans TC', 'Segoe UI Emoji', sans-serif`, round = `'${p.round}', '${p.font}', 'Noto Sans TC', 'Segoe UI Emoji', sans-serif`;
    // in with an overshoot, out over the last 0.2 s
    const inn = Math.max(0, eBack(clamp(t / 0.3))), out = clamp((dur - t) / 0.2), sz = p.scale * inn * (0.6 + 0.4 * out);
    const poll = p.kind === 'poll', slider = p.kind === 'slider', timer = p.kind === 'timer';
    const grad = `linear-gradient(90deg, ${p.hl}, ${p.accent})`;
    cssCamel(s.card, { display: sz > 0.005 ? (timer ? 'flex' : 'block') : 'none', left: X(p.x * 1080), top: X(p.y * Hd), opacity: String(Math.min(clamp(t / 0.15), out)),
      transform: `translate(-50%, -50%) rotate(${p.rot}deg) scale(${sz})`, fontFamily: font, whiteSpace: 'pre', lineHeight: '1',
      width: timer ? 'auto' : X(poll ? 660 : 640), padding: timer ? `${X(22)} ${X(40)} ${X(24)} ${X(30)}` : poll ? `${X(28)} ${X(28)} ${X(30)}` : `${X(28)} ${X(40)} ${X(46)}`,
      borderRadius: X(30), background: timer ? 'rgba(20,20,20,0.74)' : p.paper, color: timer ? '#fff' : p.ink, alignItems: 'center', boxShadow: `0 ${8 * k}px ${24 * k}px rgba(0,0,0,0.28)` });
    // the question, wrapped on two lines at most
    const qLines = fitLines(p.text, (poll ? 600 : 560) / 52, 2, 0.7);
    s.q.textContent = qLines.lines.join('\n');
    cssCamel(s.q, { display: !timer && p.text ? 'block' : 'none', textAlign: 'center', fontFamily: round, fontWeight: '700', fontSize: X(52 * qLines.scale), lineHeight: '1.25', marginBottom: X(poll ? 14 : 34) });
    // poll: the answers; their bars fill to the result after the vote
    const pl = pollOf(p.options, p.votes, wordsLang([p.text, p.options], ctx)), key = `${p.kind}|${pl.opts.join('|')}`;
    if (s.key !== key) {
      s.key = key;
      for (const o of s.opts) o.row.remove();
      s.opts = poll ? pl.opts.map(() => {
        const row = h('div', null, null, s.card), fill = h('div', null, null, row), label = h('div', null, null, row), tick = h('div', null, null, row), pct = h('div', null, null, row);
        cssCamel(row, { position: 'relative', overflow: 'hidden' });
        for (const e of [fill, label, tick, pct]) cssCamel(e, { position: 'absolute' });
        return { row, fill, label, tick, pct };
      }) : [];
      if (poll) s.card.insertBefore(s.q, s.card.firstChild);
    }
    const u = poll ? eOut(clamp((t - p.at) / Math.max(0.2, p.end - p.at))) : 0, voted = poll && t >= p.at;
    s.opts.forEach((o, i) => {
      const share = pl.shares[i], ticked = voted && i === Math.round(p.pick);
      cssCamel(o.row, { height: X(86), borderRadius: X(43), marginTop: X(14), background: withAlpha(p.ink, 0.07) });
      cssCamel(o.fill, { left: '0', top: '0', bottom: '0', width: `${(voted ? share * u : 0) * 100}%`, borderRadius: X(43), background: grad });
      o.label.textContent = pl.opts[i];
      cssCamel(o.label, { left: X(30), top: '50%', transform: 'translateY(-50%)', fontSize: X(fitPx(pl.opts[i], 46, 430)), fontWeight: '700' });
      if (o.tick.dataset.k !== p.ink) { o.tick.dataset.k = p.ink; o.tick.innerHTML = glyphSvg('check', p.ink); }
      cssCamel(o.tick, { display: ticked ? 'block' : 'none', right: X(150), top: X(21), width: X(44), height: X(44), opacity: String(clamp((t - p.at) / 0.2)) });
      o.pct.textContent = `${Math.round(share * u * 100)}%`;
      cssCamel(o.pct, { display: voted ? 'block' : 'none', right: X(30), top: '50%', transform: 'translateY(-50%)', fontSize: X(44), fontWeight: '900', fontVariantNumeric: 'tabular-nums', opacity: String(clamp((t - p.at) / 0.2)) });
    });
    // slider: the emoji slides along the track, bobbing while it moves
    const v = sliderAt(t, p.at, p.end, p.value), w = 560, mv = Math.max(0, Math.sin(Math.PI * clamp((t - p.at) / Math.max(1e-6, p.end - p.at))));
    cssCamel(s.track, { display: slider ? 'block' : 'none', position: 'relative', height: X(18), borderRadius: X(9), background: withAlpha(p.ink, 0.1) });
    cssCamel(s.bar, { position: 'absolute', left: '0', top: '0', bottom: '0', width: X(v * w), borderRadius: X(9), background: grad });
    s.thumb.textContent = p.emoji;
    cssCamel(s.thumb, { position: 'absolute', left: X(v * w), top: '50%', transform: `translate(-50%, -50%) scale(${1 + 0.18 * mv})`, fontSize: X(84), lineHeight: '1', fontFamily: "'Segoe UI Emoji', 'Noto Color Emoji', sans-serif" });
    // timer: an icon, the label and the running clock
    const ic = p.icon.trim(), known = ICON_KINDS.includes(ic);
    if (s.icon.dataset.k !== ic) { s.icon.dataset.k = ic; if (known) s.icon.innerHTML = glyphSvg(ic, '#fff', 'rgba(0,0,0,0.6)'); else s.icon.textContent = ic; }
    cssCamel(s.icon, { display: timer && ic ? 'block' : 'none', flex: 'none', width: X(96), height: X(96), marginRight: X(26), fontSize: X(80), lineHeight: '1.2', textAlign: 'center' });
    cssCamel(s.col, { display: timer ? 'block' : 'none' });
    s.label.textContent = p.text;
    cssCamel(s.label, { display: p.text ? 'block' : 'none', fontSize: X(fitPx(p.text, 36, 420)), fontWeight: '700', opacity: '0.85', marginBottom: X(10) });
    s.num.textContent = clockText(timerAt(t, p.at, p.end, p.from, p.to));
    cssCamel(s.num, { fontSize: X(92), fontWeight: '700', fontVariantNumeric: 'tabular-nums', letterSpacing: X(2), color: p.hl });
  },
};
