// common.lockscreen — a phone's lock screen over the footage (the footage is the wallpaper), from t2-notify's fx.lockWall: the status
// bar, a focus-mode pill, the date and a big clock whose changed digits flip, a title line with count dots ("3/10"), a live-activity
// bar that takes the clock's place for a while, and the dock (two round buttons, the unlock hint, the home bar). Every word is a
// parameter; times are from the item's start. On 9:16 it covers the frame; on a wide or square frame it is a phone in the middle
// (phone.ts). Notifications go on top as common.notify (y 0.43).
import { clamp, cssCamel, eOut3 as eOut, h, lerp, textEm, type ItemType } from '@tellcut/engine';
import { DEVICES, drawStatusBar, glyphSvg, iconTile, parseSteps, phoneEls, phoneView, placePhone, statusBarEl, stepAt, timeSpan, type Device, type PhoneEls, type StatusBar } from './phone.ts';
import { fitPx, lineAbs, nl } from './text.ts';
import { withAlpha } from './color.ts';

export const MODE_LOOKS = ['plain', 'calm', 'accent'] as const;
type ModeLook = typeof MODE_LOOKS[number];
const MODE_ICON: Record<ModeLook, string> = { plain: 'work', calm: 'moon', accent: 'bell' };

/** the live-activity spans ("1.2-3.4", one a line or comma separated) and how far live mode is at t (0 lock screen, 1 live; 0.4 s each way) */
export function liveSpans(text: string): Array<[number, number]> {
  return nl(text).split(/[\n,，]/).map(timeSpan).filter((x): x is [number, number | undefined] => !!x && x[1] !== undefined).map((x) => [x[0], x[1]!]);
}
export const liveAt = (spans: Array<[number, number]>, t: number) => spans.reduce((m, [a, b]) => Math.max(m, Math.min(clamp((t - a) / 0.4), clamp((b - t) / 0.4))), 0);
/** the clock's characters at t: what shows, what it changed from, and how far the flip is (0→1 over 0.4 s) */
export function clockAt(steps: Array<{ t: number; v: string[] }>, t: number): { cur: string; old: string; p: number } {
  const { cur, prev } = stepAt(steps, t);
  if (!cur) return { cur: steps[0]?.v[0] ?? '', old: steps[0]?.v[0] ?? '', p: 1 };
  const p = eOut(clamp((t - cur.t) / 0.4));
  return { cur: cur.v[0] ?? '', old: prev && p < 1 ? prev.v[0] ?? '' : cur.v[0] ?? '', p };
}

interface P {
  clock: string; date: string; mode: string; title: string; count: string; of: number; live: string; liveIcon: string; liveLabel: string;
  hint: string; dock: 'none' | 'clear' | 'band'; dockIcons: string; time: string; carrier: string; signal: number; wifi: boolean; battery: number;
  wall: 'clear' | 'gradient' | 'dark'; dim: number; device: Device; px: number; font: string; round: string; clockFont: string; color: string; accent: string;
}
interface Pill { box: HTMLElement; icon: HTMLElement; text: HTMLElement }
interface S {
  ph: PhoneEls; wall: HTMLElement; vigTop: HTMLElement; vigBot: HTMLElement; sb: StatusBar; group: HTMLElement; pills: [Pill, Pill]; date: HTMLElement;
  clock: HTMLElement; clockKey: string; titles: [HTMLElement, HTMLElement]; dots: HTMLElement; dotEls: HTMLElement[]; countText: HTMLElement;
  live: HTMLElement; liveIconEl: HTMLElement; liveTitle: HTMLElement; liveRight: HTMLElement;
  band: HTMLElement; buttons: HTMLElement[]; hints: [HTMLElement, HTMLElement]; chevron: HTMLElement; homeBar: HTMLElement;
}

const CHEVRON = (c: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 40" width="100%" height="100%" style="display:block"><path d="M10 32L40 9l30 23" fill="none" stroke="${c}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export const lockscreen: ItemType<P, S> = {
  type: 'common.lockscreen', label: '手機鎖定畫面', category: 'phone', kind: 'overlay',
  doc: '手機的鎖定畫面疊在影片上（影片就是桌布）：狀態列（time／carrier／signal／wifi／battery）、模式膠囊（mode 一行「秒|文字|plain/calm/accent|圖示」）、日期、大時鐘（clock 一行「秒|時間」，變的數字往上翻）、標題列（title「秒|文字」）＋計數點（count「秒|n」、of 幾格）、即時動態條（live「秒-秒」：時鐘收起、頂端換成動態條，liveLabel 加在計數前）、底部 dock（兩顆圓鈕＋解鎖提示 hint「秒|文字|up」up 會跳動加箭頭＋底部橫條；band 是一整條深色底，能蓋住下面的東西）；9:16 鋪滿畫面，16:9／1:1 是畫面中間一支手機（device，wall 給手機桌布）；通知疊 common.notify（y 0.43）；音效配 common.buzz（震動）、common.recv（通知）、common.hush（靜音、切換模式）、common.tick（翻時鐘）',
  params: [
    { key: 'clock', label: '時鐘（一行一個：秒|時間，變了的字往上翻）', type: 'text', default: '0|14:59\n1.2|15:00' },
    { key: 'date', label: '日期列', type: 'string', default: '6月1日 星期一' },
    { key: 'mode', label: '模式膠囊（一行一個：秒|文字|樣式 plain/calm/accent|圖示；空＝不顯示）', type: 'text', default: '0|專注模式|plain|work\n1.8|休息模式|calm|moon' },
    { key: 'title', label: '標題列（一行一個：秒|文字，第一行的時間開始出現；空＝不顯示）', type: 'text', default: '0.3|今天的五件小事' },
    { key: 'count', label: '計數（一行一個：秒|n；空＝沒有計數點）', type: 'text', default: '0.3|0\n1.4|1\n2.2|2' },
    { key: 'of', label: '計數點幾格（0＝只寫數字不畫點）', type: 'number', min: 0, max: 12, step: 1, default: 5 },
    { key: 'live', label: '即時動態的時段（秒-秒，逗號或換行分隔：時鐘收起、頂端換成動態條）', type: 'text', default: '' },
    { key: 'liveIcon', label: '動態條的圖示', type: 'string', default: 'mic' },
    { key: 'liveLabel', label: '動態條右邊、計數前的字', type: 'string', default: '' },
    { key: 'hint', label: '底部提示（一行一個：秒|文字|up 跳動加箭頭；空＝不顯示）', type: 'text', default: '0|向上滑動以解鎖' },
    { key: 'dock', label: '底部（none 不畫、clear 圓鈕＋提示＋橫條、band 再加一整條深色底）', type: 'enum', options: ['none', 'clear', 'band'], default: 'clear' },
    { key: 'dockIcons', label: '底部兩顆圓鈕的圖示（逗號分隔）', type: 'string', default: 'torch,camera' },
    { key: 'time', label: '狀態列的時間（空＝左上角寫電信）', type: 'string', default: '' },
    { key: 'carrier', label: '電信', type: 'string', default: '晴天電信' },
    { key: 'signal', label: '訊號格數', type: 'number', min: 0, max: 4, step: 1, default: 4 },
    { key: 'wifi', label: 'Wi-Fi', type: 'bool', default: true },
    { key: 'battery', label: '電量（%）', type: 'number', min: 0, max: 100, step: 1, default: 80 },
    { key: 'wall', label: '桌布（clear 透出下面的影片、gradient theme 色漸層、dark 深色）', type: 'enum', options: ['clear', 'gradient', 'dark'], default: 'clear' },
    { key: 'dim', label: '上下壓暗（0–1）', type: 'number', min: 0, max: 1, step: 0.05, default: 1 },
    { key: 'device', label: '手機（auto：9:16 鋪滿畫面、其他比例畫一支手機；phone 一律畫手機；bare 只要 9:16 的畫面不畫機身）', type: 'enum', options: DEVICES, default: 'auto' },
    { key: 'px', label: '手機中心 x（畫面寬比例；有手機時）', type: 'number', min: 0, max: 1, step: 0.005, default: 0.5 },
    { key: 'font', label: '字型', type: 'string', default: 'Noto Sans TC', theme: 'fonts.body' },
    { key: 'round', label: '標題列與動態條的圓體', type: 'string', default: 'Huninn' },
    { key: 'clockFont', label: '時鐘字型（細）', type: 'string', default: 'Inter' },
    { key: 'color', label: '字色', type: 'color', default: '#ffffff' },
    { key: 'accent', label: '強調色（計數點、跳動箭頭、accent 膠囊）', type: 'color', default: '#ff4d4f', theme: 'palette.accent' },
  ],
  build(ctx) {
    const ph = phoneEls(ctx.root), sc = ph.screen;
    const wall = lineAbs(sc), vigTop = lineAbs(sc), vigBot = lineAbs(sc);
    const sb = statusBarEl(sc), group = lineAbs(sc);
    const pill = (): Pill => { const box = lineAbs(group), icon = h('div', null, null, box), text = lineAbs(box); cssCamel(icon, { position: 'absolute' }); return { box, icon, text }; };
    const pills: [Pill, Pill] = [pill(), pill()], date = lineAbs(group), clock = lineAbs(group);
    const titles: [HTMLElement, HTMLElement] = [lineAbs(sc), lineAbs(sc)], dots = lineAbs(sc), countText = lineAbs(dots);
    cssCamel(dots, { display: 'flex', alignItems: 'center' });
    const live = lineAbs(sc), liveIconEl = h('div', null, null, live), liveTitle = lineAbs(live), liveRight = lineAbs(live);
    cssCamel(liveIconEl, { position: 'absolute' });
    const band = lineAbs(sc), buttons = [lineAbs(sc), lineAbs(sc)], hints: [HTMLElement, HTMLElement] = [lineAbs(sc), lineAbs(sc)], chevron = lineAbs(sc), homeBar = lineAbs(sc);
    return { ph, wall, vigTop, vigBot, sb, group, pills, date, clock, clockKey: '', titles, dots, dotEls: [], countText, live, liveIconEl, liveTitle, liveRight, band, buttons, hints, chevron, homeBar };
  },
  draw(ctx, s) {
    const p = ctx.params, { W, H, theme, local: t } = ctx;
    const { sc, k, Hd, X } = phoneView(W, H, theme.safe, p);
    placePhone(s.ph, sc);
    const font = `'${p.font}', 'Noto Sans TC', 'Segoe UI Emoji', sans-serif`, round = `'${p.round}', '${p.font}', 'Noto Sans TC', sans-serif`;
    const shadow = (b: number) => `0 0 ${b * k}px rgba(0,0,0,0.35)`;
    cssCamel(s.ph.screen, { color: p.color, fontFamily: font });
    // wallpaper and the dark at the top and bottom that keeps the white words readable on any footage
    const wall = p.wall === 'gradient' ? `linear-gradient(165deg, ${theme.palette.accent2}, ${theme.palette.ink})` : p.wall === 'dark' ? '#101014' : 'none';
    cssCamel(s.wall, { display: p.wall === 'clear' ? 'none' : 'block', inset: '0', background: wall });
    cssCamel(s.vigTop, { left: '0', top: '0', width: '100%', height: X(820), background: `linear-gradient(rgba(0,0,0,${0.42 * p.dim}), rgba(0,0,0,0))` });
    cssCamel(s.vigBot, { left: '0', top: X(Hd - 700), width: '100%', height: X(700), background: `linear-gradient(rgba(0,0,0,0), rgba(0,0,0,${0.4 * p.dim}))` });
    drawStatusBar(s.sb, { time: p.time, carrier: p.carrier, signal: p.signal, wifi: p.wifi, battery: p.battery, color: p.color, font: p.font }, k, 124 * k, sc.w);
    // live mode: the clock group rises and fades, the live bar grows in at the top
    const live = liveAt(liveSpans(p.live), t);
    cssCamel(s.group, { left: '0', top: '0', width: '100%', height: '0', overflow: 'visible', opacity: String(1 - live), transform: `translateY(${-live * 120 * k}px)`, display: live < 1 ? 'block' : 'none' });
    // the mode pill: the new one pops in over the old one
    const modes = parseSteps(p.mode), m = stepAt(modes, t);
    const pillA = m.cur ? clamp((t - m.cur.t) / 0.35) : 0, pop = m.cur ? 1 + 0.12 * Math.sin(pillA * Math.PI) : 1;
    const drawPill = (pl: Pill, st: { v: string[] } | null, alpha: number) => {
      if (!st || alpha <= 0) { cssCamel(pl.box, { display: 'none' }); return; }
      const text = st.v[0] ?? '', look = ((MODE_LOOKS as readonly string[]).includes(st.v[1]) ? st.v[1] : 'plain') as ModeLook, icon = st.v[2] || MODE_ICON[look];
      const bg = look === 'accent' ? withAlpha(p.accent, 0.85) : look === 'calm' ? 'rgba(95,61,196,0.78)' : 'rgba(25,25,30,0.55)';
      const w = (textEm(text) * 40 + 120) * k;
      pl.text.textContent = text;
      iconTile(pl.icon, icon, 52 * k);
      cssCamel(pl.box, { display: 'block', left: `${sc.w / 2 - w / 2}px`, top: X(232), width: `${w}px`, height: X(70), borderRadius: X(35), background: bg, opacity: String(alpha), transform: `scale(${pop})` });
      cssCamel(pl.icon, { left: X(10), top: X(9), borderRadius: '50%' });
      cssCamel(pl.text, { left: X(76), top: '50%', transform: 'translateY(-50%)', fontSize: X(40), fontWeight: '700', color: '#fff' });
    };
    drawPill(s.pills[0], m.prev && pillA < 1 ? m.prev : null, 1 - pillA);
    drawPill(s.pills[1], m.cur, m.prev ? pillA : 1);
    // the date and the clock
    s.date.textContent = p.date;
    cssCamel(s.date, { left: '50%', top: X(372), transform: 'translate(-50%, -50%)', fontSize: X(fitPx(p.date, 50, 960)), fontWeight: '700', textShadow: shadow(18) });
    const c = clockAt(parseSteps(p.clock), t), cur = [...c.cur], old = [...c.old];
    const key = `${c.old}>${c.cur}`;
    if (s.clockKey !== key) {
      s.clockKey = key; s.clock.textContent = '';
      cur.forEach((ch, i) => {
        const cell = h('span', null, null, s.clock), n = h('span', null, null, cell);
        const flip = (old[i] ?? ch) !== ch;
        // a changing digit flips inside its own body (clipped there); the others keep their whole shadow
        cssCamel(cell, { position: 'relative', display: 'inline-block', clipPath: flip ? 'inset(0.1em -0.1em 0.04em -0.1em)' : 'none' });
        cssCamel(n, { display: 'inline-block' });
        n.textContent = ch;
        if (flip) { const o = h('span', null, null, cell); o.textContent = old[i]; cssCamel(o, { position: 'absolute', left: '0', top: '0' }); }
      });
    }
    cssCamel(s.clock, { left: '50%', top: X(520), transform: 'translate(-50%, -50%)', fontFamily: `'${p.clockFont}', ${font}`, fontWeight: '300', fontSize: X(fitPx(c.cur, 250, 980)),
      fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em', textShadow: shadow(18) });
    for (const cell of s.clock.children as any as HTMLElement[]) {
      const [n, o] = cell.children as any as HTMLElement[];
      if (!o) { cssCamel(n, { transform: 'none', opacity: '1' }); continue; }
      cssCamel(n, { transform: `translateY(${(1 - c.p) * 0.5}em)`, opacity: String(c.p) });
      cssCamel(o, { transform: `translateY(${-c.p * 0.5}em)`, opacity: String(1 - c.p) });
    }
    // the title line (crossfading when it changes) and the count dots under it
    const titles = parseSteps(p.title), tt = stepAt(titles, t), first = titles[0]?.t ?? Infinity;
    const ta = clamp((t - first) / 0.4) * (1 - live), sw = tt.cur ? clamp((t - tt.cur.t) / 0.35) : 1;
    const drawTitle = (el: HTMLElement, text: string, a: number, dy: number) => {
      el.textContent = text;
      cssCamel(el, { display: a > 0 ? 'block' : 'none', left: '50%', top: X(684 + dy), transform: 'translate(-50%, -50%)', fontFamily: round, fontWeight: '700', fontSize: X(fitPx(text, 52, 960)), opacity: String(a), textShadow: `0 0 ${14 * k}px rgba(0,0,0,0.5)` });
    };
    drawTitle(s.titles[0], tt.prev?.v[0] ?? '', tt.prev && sw < 1 ? ta * (1 - sw) : 0, -sw * 20);
    drawTitle(s.titles[1], tt.cur?.v[0] ?? '', tt.cur ? ta * (tt.prev && sw < 1 ? sw : 1) : 0, tt.prev && sw < 1 ? 20 - sw * 20 : 0);
    const counts = parseSteps(p.count), cn = stepAt(counts, t), nv = Number(cn.cur?.v[0]) || 0, popP = cn.cur ? clamp((t - cn.cur.t) / 0.4) : 1;
    const of = Math.max(0, Math.round(p.of));
    if (s.dotEls.length !== of) {
      for (const d of s.dotEls) d.remove();
      s.dotEls = Array.from({ length: of }, () => { const d = h('div', null, null, s.dots); s.dots.insertBefore(d, s.countText); return d; });
    }
    s.dotEls.forEach((d, i) => {
      const lit = i < nv, fresh = i === nv - 1 && popP < 1, r = 12 * (fresh ? 1 + 0.7 * Math.sin(popP * Math.PI) : 1);
      cssCamel(d, { flex: 'none', width: X(24), height: X(24), marginRight: X(20), borderRadius: '50%', background: lit ? p.accent : 'rgba(255,255,255,0.38)', transform: `scale(${r / 12})`, boxShadow: `0 0 ${6 * k}px rgba(0,0,0,0.3)` });
    });
    s.countText.textContent = of > 0 ? `${nv}/${of}` : String(nv);
    cssCamel(s.countText, { position: 'static', marginLeft: X(6), fontSize: X(40), fontWeight: '700', textShadow: shadow(6) });
    cssCamel(s.dots, { display: counts.length && ta > 0 ? 'flex' : 'none', left: '50%', top: X(758), transform: 'translate(-50%, -50%)', opacity: String(ta) });
    // the live-activity bar
    const la = eOut(live);
    cssCamel(s.live, { display: live > 0 ? 'block' : 'none', left: X(40), top: X(196), width: X(1000), height: X(112), borderRadius: X(40), background: 'rgba(16,16,20,0.94)', opacity: String(live),
      transformOrigin: '50% 50%', transform: `scale(${lerp(0.85, 1, la)}, ${lerp(0.6, 1, la)})` });
    if (live > 0) {
      iconTile(s.liveIconEl, p.liveIcon, 72 * k);
      cssCamel(s.liveIconEl, { left: X(26), top: X(20), borderRadius: '50%' });
      const right = [p.liveLabel, counts.length ? `${nv}/${of || nv}` : ''].filter(Boolean).join(' ');
      s.liveRight.textContent = right;
      const rightW = textEm(right) * 40;
      s.liveTitle.textContent = tt.cur?.v[0] ?? '';
      cssCamel(s.liveTitle, { left: X(120), top: '50%', transform: 'translateY(-50%)', fontFamily: round, fontWeight: '700', fontSize: X(fitPx(s.liveTitle.textContent, 52, 1000 - 150 - rightW - 40)), color: '#fff' });
      cssCamel(s.liveRight, { right: X(36), top: '50%', transform: 'translateY(-50%)', fontSize: X(40), fontWeight: '700', color: p.accent });
    }
    // the dock
    const dock = p.dock !== 'none';
    cssCamel(s.band, { display: p.dock === 'band' ? 'block' : 'none', left: '0', top: X(Hd - 360), width: '100%', height: X(360), background: `linear-gradient(rgba(10,10,14,0) 0, #0a0a0e ${90 * k}px)` });
    const icons = String(p.dockIcons ?? '').split(/[,，]/).map((x) => x.trim()).filter(Boolean);
    s.buttons.forEach((b, i) => {
      const kind = icons[i] ?? '';
      if (b.dataset.k !== kind) { b.dataset.k = kind; b.innerHTML = kind ? `<div style="position:absolute;inset:26%">${glyphSvg(kind, '#fff', 'rgba(0,0,0,0.25)')}</div>` : ''; }
      cssCamel(b, { display: dock && kind ? 'block' : 'none', left: X(i ? 930 - 62 : 150 - 62), top: X(Hd - 190 - 62), width: X(124), height: X(124), borderRadius: '50%', background: 'rgba(255,255,255,0.16)', backdropFilter: 'blur(6px)' });
    });
    const hints = parseSteps(p.hint), hs = stepAt(hints, t), hp = hs.cur ? clamp((t - hs.cur.t) / 0.3) : 0;
    const up = !!hs.cur && !!hs.cur.v[1] && !/^(0|false|no)$/i.test(hs.cur.v[1]);
    const bounce = up ? Math.abs(Math.sin((t - hs.cur!.t) * Math.PI * 1.25)) * 16 : 0, hy = Hd - 178;
    const drawHint = (el: HTMLElement, text: string, a: number, bold: boolean, dy: number) => {
      el.textContent = text;
      cssCamel(el, { display: dock && a > 0 ? 'block' : 'none', left: '50%', top: X(hy - dy), transform: 'translate(-50%, -50%)', fontSize: X(fitPx(text, 46, 600)), fontWeight: bold ? '700' : '500', opacity: String(a), textShadow: shadow(8) });
    };
    drawHint(s.hints[0], hs.prev?.v[0] ?? '', hs.prev && hp < 1 ? 1 - hp : 0, false, 0);
    drawHint(s.hints[1], hs.cur?.v[0] ?? '', hs.cur ? (hs.prev ? hp : hs.cur.t <= 0 ? 0.95 : hp * 0.95) : 0, up, bounce);
    if (s.chevron.dataset.k !== p.accent) { s.chevron.dataset.k = p.accent; s.chevron.innerHTML = CHEVRON(p.accent); }
    cssCamel(s.chevron, { display: dock && up ? 'block' : 'none', left: X(500), top: X(hy - 92 - bounce), width: X(80), height: X(40), opacity: String(hp) });
    cssCamel(s.homeBar, { display: dock ? 'block' : 'none', left: X(390), top: X(Hd - 52), width: X(300), height: X(11), borderRadius: X(6), background: withAlpha(p.color, 0.9) });
  },
};
