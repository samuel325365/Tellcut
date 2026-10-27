// common.tripclock — a travel clock: the local time running with the shooting time, how long since arriving, and a route that lights up
// station by station. Promoted from the seattle-short travel clock; all the words are params, nothing assumes a frame rate.
import { abs, clamp, cssCamel, eOut3, h, type ItemType } from '@tellcut/engine';
import { withAlpha } from './color.ts';

interface P {
  stops: string; roll: number; land: string; city: string; cityLabel: string; sinceLabel: string; beforeLabel: string;
  stations: string; stationAt: string; y: number; size: number; shade: number; color: string; accent: string; font: string;
}
interface Stop { dot: HTMLElement; ring: HTMLElement; label: HTMLElement }
interface S { shade: HTMLElement; city: HTMLElement; clock: HTMLElement; since: HTMLElement; track: HTMLElement; fill: HTMLElement; stops: Stop[]; key: string }

/** "06:26" (or "06：26", typed with a CJK IME) → minutes after midnight (NaN when it is not a time) */
export const hm = (s: string) => { const m = /^\s*(\d{1,2})[:：](\d{2})\s*$/.exec(String(s)); return m ? Number(m[1]) * 60 + Number(m[2]) : NaN; };
const pad = (n: number) => String(n).padStart(2, '0');
const DAY = 1440;
/** b − a the short way round the clock face, in [−720, 720): 23:50 → 00:10 is +20, not −1420 */
const turn = (a: number, b: number) => ((((b - a) % DAY) + DAY * 1.5) % DAY) - DAY / 2;
/** minutes on any day (above 1440 or below 0 too) → "HH:MM" */
export const clockText = (mins: number) => { const m = ((Math.floor(mins) % DAY) + DAY) % DAY; return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`; };

/** "0=06:26, 3=09:24" → sorted [seconds, minutes] pairs */
export function parseClock(s: string): Array<[number, number]> {
  return String(s).split(/[,，]/).map((x) => x.trim()).filter(Boolean).map((x) => { const [t, v] = x.split(/[=＝]/); return [Number(t), hm(v ?? '')] as [number, number]; })
    .filter(([t, v]) => Number.isFinite(t) && Number.isFinite(v)).sort((a, b) => a[0] - b[0]);
}

/** the clock's minutes at item time t: after each stop it rolls to the new time over `roll` seconds, the short way round. Past
 *  midnight the value runs on above 1440 (or below 0), so the time since arrival can be counted from it; clockText shows it. */
export function clockAt(stops: Array<[number, number]>, t: number, roll: number): number {
  if (!stops.length) return 0;
  let v = stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    if (t < stops[i][0]) break;
    v += turn(v, stops[i][1]) * eOut3(clamp(roll > 0 ? (t - stops[i][0]) / roll : 1));
  }
  return v;
}

/** where along the route the traveller is (0 = first station; eases into each station at its time) */
export function routeAt(at: number[], n: number, t: number): number {
  let pos = 0;
  for (let i = 1; i < n; i++) if (Number.isFinite(at[i]) && t >= at[i]) pos = i - 1 + eOut3(clamp((t - at[i]) / 0.9));
  return Math.min(pos, n - 1);
}

/** "落地後  2h 58m" / the before-arrival words / '' when no arrival time is given. `mins` is clockAt's running value, `start`
 *  the clock's first time: the arrival is the one nearest the start (past midnight, or before the clip begins) */
export function sinceText(mins: number, land: string, sinceLabel: string, beforeLabel: string, start = mins): string {
  const l = hm(land);
  if (!Number.isFinite(l)) return '';
  const d = Math.floor(mins) - (start + turn(start, l));
  return d < 0 ? beforeLabel : `${sinceLabel}  ${Math.floor(d / 60)}h ${pad(d % 60)}m`;
}

export const tripclock: ItemType<P, S> = {
  type: 'common.tripclock', label: '旅程時鐘', category: 'travel', kind: 'overlay',
  doc: '畫面上方的當地時間（隨拍攝時間往前跑）、抵達後經過多久，和一條一站一站亮起的路線；旅遊、一日行程、跟著時間走的片子',
  params: [
    { key: 'stops', label: '時間（秒=HH:MM，逗號分隔；每到一個就跳過去）', type: 'text', default: '0=06:26, 1=09:24' },
    { key: 'roll', label: '跳動時間 (s)', type: 'number', min: 0, max: 4, step: 0.05, default: 1.1 },
    { key: 'land', label: '抵達時間（HH:MM；空＝不顯示經過多久）', type: 'string', default: '06:26' },
    { key: 'city', label: '城市', type: 'string', default: 'SEATTLE' },
    { key: 'cityLabel', label: '城市後的字', type: 'string', default: '當地時間' },
    { key: 'sinceLabel', label: '抵達後的字', type: 'string', default: '落地後' },
    { key: 'beforeLabel', label: '還沒抵達時的字', type: 'string', default: '降落中' },
    { key: 'stations', label: '路線站名（逗號分隔；少於兩站＝不顯示路線）', type: 'string', default: '機場,市場,海濱,太空針塔' },
    { key: 'stationAt', label: '每站亮起的秒數（逗號分隔）', type: 'string', default: '0,0.8,1.6,2.4' },
    { key: 'y', label: '上緣（畫面高比例；-1＝安全區上緣）', type: 'number', min: -1, max: 0.6, step: 0.005, default: -1 },
    { key: 'size', label: '時鐘字級（畫面高 %，其他跟著縮放）', type: 'number', min: 3, max: 16, step: 0.1, default: 8.3 },
    { key: 'shade', label: '上緣暗帶（0–1，讓白字在天空上讀得清楚）', type: 'number', min: 0, max: 1, step: 0.05, default: 1 },
    { key: 'color', label: '字色', type: 'color', default: '#ffffff' },
    { key: 'accent', label: '強調色（經過時間、路線）', type: 'color', default: '#7fd4ff', theme: 'palette.accent' },
    { key: 'font', label: '字型', type: 'string', default: 'Noto Sans TC', theme: 'fonts.display' },
  ],
  build(ctx) {
    const shade = abs(ctx.root), track = abs(ctx.root), fill = abs(ctx.root), city = abs(ctx.root), clock = abs(ctx.root), since = abs(ctx.root);
    for (const el of [city, clock, since]) { cssCamel(el, { left: '50%', whiteSpace: 'pre', lineHeight: '1', transform: 'translateX(-50%)' }); }
    return { shade, city, clock, since, track, fill, stops: [], key: '' };
  },
  draw(ctx, s) {
    const p = ctx.params, { W, H, theme } = ctx, local = Math.round(ctx.local * 1e4) / 1e4;   // the same moment always gives the same minute
    const z = ((p.size / 100) * H) / 160, top = (p.y >= 0 ? p.y : theme.safe.top) * H;
    const fade = clamp(Math.min(local / 0.5, (ctx.dur - local) / 0.5)), font = `'${p.font}', 'Noto Sans TC', sans-serif`;
    const shadow = `0 ${2 * z}px ${18 * z}px rgba(0,0,0,0.45)`, at = (base: number, size: number) => `${base - size * 0.88}px`;
    const sh = top + 470 * z;
    cssCamel(s.shade, { display: p.shade > 0 ? 'block' : 'none', left: '0', top: '0', width: `${W}px`, height: `${sh}px`, opacity: String(fade * p.shade),
      background: 'linear-gradient(180deg, rgba(0,10,20,0.55) 0%, rgba(0,10,20,0.22) 60%, rgba(0,10,20,0) 100%)' });
    const text = (el: HTMLElement, str: string | null, base: number, size: number, weight: number, color: string, extra: Record<string, string> = {}) => {
      if (str !== null && el.textContent !== str) el.textContent = str;
      cssCamel(el, { display: str === '' ? 'none' : 'block', top: at(base, size), fontSize: `${size}px`, fontWeight: String(weight), fontFamily: font, color, textShadow: shadow, opacity: String(fade), ...extra });
    };
    text(s.city, [p.city, p.cityLabel].filter(Boolean).join('  ·  '), top + 30 * z, 30 * z, 400, withAlpha(p.color, 0.82), { letterSpacing: `${6 * z}px` });
    const stops = parseClock(p.stops), mins = Math.floor(clockAt(stops, local, p.roll) + 1e-6), cy = top + 175 * z;
    const colon = local % 1 < 0.6 ? 1 : 0.35, clock = clockText(mins);
    if (s.clock.dataset.v !== clock) { s.clock.dataset.v = clock; s.clock.innerHTML = `${clock.slice(0, 2)}<span>:</span>${clock.slice(3)}`; }
    text(s.clock, null, cy, 160 * z, 400, p.color, { fontVariantNumeric: 'tabular-nums' });
    cssCamel(s.clock.firstElementChild as HTMLElement, { opacity: String(colon), position: 'relative', top: `${-8 * z}px` });
    text(s.since, sinceText(mins, p.land, p.sinceLabel, p.beforeLabel, stops.length ? stops[0][1] : mins), cy + 70 * z, 42 * z, 700, p.accent);
    // the route
    const names = p.stations.split(/[,，]/).map((x) => x.trim()).filter(Boolean), n = names.length, show = n >= 2;
    if (s.key !== p.stations) {
      s.key = p.stations;
      for (const st of s.stops) { st.dot.remove(); st.ring.remove(); st.label.remove(); }
      s.stops = names.map((name) => {
        const mk = () => { const d = h('div', null, null, ctx.root); cssCamel(d, { position: 'absolute', boxSizing: 'border-box', borderRadius: '50%' }); return d; };
        const ring = mk(), dot = mk(), label = mk();
        label.textContent = name;
        cssCamel(label, { borderRadius: '0', whiteSpace: 'pre', lineHeight: '1', transform: 'translateX(-50%)' });
        return { dot, ring, label };
      });
    }
    const lx = Math.max(W * 0.17, theme.safe.side * W + 50 * z), rx = W - lx, ly = cy + 145 * z, th = 4 * z;
    const pos = routeAt(p.stationAt.split(/[,，]/).map(Number), n, local), cur = Math.round(pos), sx = (i: number) => lx + ((rx - lx) * i) / Math.max(1, n - 1);
    cssCamel(s.track, { display: show ? 'block' : 'none', left: `${lx}px`, top: `${ly - th / 2}px`, width: `${rx - lx}px`, height: '0', opacity: String(fade),
      borderTop: `${th}px dotted ${withAlpha(p.color, 0.35)}` });
    cssCamel(s.fill, { display: show ? 'block' : 'none', left: `${lx}px`, top: `${ly - 2.5 * z}px`, width: `${((rx - lx) * pos) / Math.max(1, n - 1)}px`, height: `${5 * z}px`,
      borderRadius: `${5 * z}px`, background: p.accent, opacity: String(fade), boxShadow: `0 0 ${8 * z}px rgba(0,0,0,0.45)` });
    s.stops.forEach((st, i) => {
      const reached = pos >= i - 0.02, x = sx(i), here = i === cur, r = (here ? 11 : 8) * z, ph = (local % 1.6) / 1.6, rr = 12 * z + ph * 22 * z;
      cssCamel(st.ring, { display: show && here && Math.abs(pos - cur) < 0.05 ? 'block' : 'none', left: `${x - rr}px`, top: `${ly - rr}px`, width: `${2 * rr}px`, height: `${2 * rr}px`,
        border: `${3 * z}px solid ${p.accent}`, opacity: String(fade * (1 - ph) * 0.8) });
      cssCamel(st.dot, { display: show ? 'block' : 'none', left: `${x - r}px`, top: `${ly - r}px`, width: `${2 * r}px`, height: `${2 * r}px`, opacity: String(fade),
        background: reached ? p.accent : 'rgba(10,20,30,0.6)', border: `${3 * z}px solid ${reached ? p.color : withAlpha(p.color, 0.6)}`, boxShadow: `0 0 ${8 * z}px rgba(0,0,0,0.45)` });
      const size = (here ? 36 : 30) * z;
      cssCamel(st.label, { display: show ? 'block' : 'none', left: `${x}px`, top: at(ly + 54 * z, size), fontSize: `${size}px`, fontWeight: here ? '700' : '400', fontFamily: font,
        color: here ? p.color : withAlpha(p.color, reached ? 0.85 : 0.55), textShadow: shadow, opacity: String(fade) });
    });
  },
};
