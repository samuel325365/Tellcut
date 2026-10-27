// common.gauge — a half-round dial gauge (a speedometer for anything: sin, spiciness, love, hype): coloured zones with their names
// along the band, a needle on a spring that jumps at every hit, an LED readout, the zone's name under it, a halo that turns into
// devil horns, warning lamps, and a "blown" ending (the needle slams past the end, the glass cracks). Promoted from the
// baking-sin short's fx.sinMeter; the score, the zone names and the hits are all params.
import { clamp, cssCamel, h, hash01, type ItemType, prog } from '@tellcut/engine';
import { canvasAt, freeCanvas } from './inkline.ts';
import { luma, mixHex, withAlpha } from './color.ts';

interface P {
  hits: string; zones: string; max: number; unit: string; scramble: number; boot: number; danger: number; boom: number; boomText: string; boomLabel: string;
  scrambleLabel: string; standbyLabel: string; countLabel: string; halo: boolean; x: number; y: number; size: number;
  font: string; body: string; face: string; accent: string; hl: string; led: string;
}
interface Zone { from: number; to: number; name: string; color: string }
interface S { cv: HTMLCanvasElement; box: HTMLElement; chars: HTMLElement[]; nums: HTMLElement[]; unit: HTMLElement; boomEl: HTMLElement; label: HTMLElement; tab: HTMLElement; key: string }

const BW = 880, BH = 670, CX = 440, CY = 440, R = 392, BAND = 64, M = 60;   // the box in its own units (the original's px)

/** "秒:加分" pairs, comma separated, sorted by time */
export const parseHits = (s: string): Array<[number, number]> => String(s ?? '').split(/[,，\n]/).map((x) => x.trim()).filter(Boolean)
  .map((x) => x.split(/[:：]/).map(Number) as [number, number]).filter(([t, d]) => Number.isFinite(t) && Number.isFinite(d)).sort((a, b) => a[0] - b[0]);

const light = (c: string) => (luma(c) ?? 0) > 0.6;

/** "起點:名稱[:顏色]" zones; a zone without a colour takes one from a ramp paper → highlight → accent → dark accent */
export function parseZones(s: string, max: number, ramp: string[]): Zone[] {
  const raw = String(s ?? '').split(/[,，\n]/).map((x) => x.trim()).filter(Boolean).map((x) => { const [f, n, c] = x.split(/[:：]/).map((y) => y.trim()); return { from: Number(f), name: n ?? '', color: c ?? '' }; })
    .filter((z) => Number.isFinite(z.from)).sort((a, b) => a.from - b.from);
  return raw.map((z, i) => {
    const q = raw.length > 1 ? (i / (raw.length - 1)) * (ramp.length - 1) : 0, j = Math.min(ramp.length - 2, Math.floor(q));
    return { from: z.from, to: i + 1 < raw.length ? raw[i + 1].from : max, name: z.name, color: z.color || mixHex(ramp[j], ramp[j + 1], q - j) };
  });
}

const spring = (u: number) => (u <= 0 ? 0 : 1 - Math.exp(-6.5 * u) * Math.cos(15 * u));
/** the value at t: every hit springs the needle by its amount; `shown` counts up (for the readout); `count` is how many hits so far */
export function gaugeValue(hits: Array<[number, number]>, t: number) {
  let v = 0, n = 0, count = 0;
  for (const [ht, d] of hits) { v += d * spring(t - ht); n += d * clamp((t - ht) / 0.3); if (t >= ht) count++; }
  return { v, shown: Math.round(n), count };
}
/** the needle's value (0 … max, past max when it blows) at t */
export function needleAt(p: Pick<P, 'scramble' | 'boot' | 'danger' | 'boom' | 'max'>, v: number, t: number): number {
  const mx = p.max || 100;
  let nv = v;
  if (t < p.scramble) nv = mx * (0.5 + Math.sin(t * 9) * 0.32 + Math.sin(t * 23) * 0.12);
  else if (p.boot >= 0 && t < p.boot) nv = 0;
  else if (p.boot >= 0 && t < p.boot + 0.8) nv = Math.sin(Math.PI * prog(t, p.boot, p.boot + 0.8)) * mx;
  if (p.boom >= 0 && t >= p.boom) { const u = t - p.boom; nv = v + (mx * 1.06 - v) * spring(u * 1.4) + Math.sin(u * 70) * 0.022 * mx * Math.exp(-u * 0.8); }
  else if (p.danger >= 0 && t >= p.danger) nv += Math.sin(t * 60) * 0.006 * mx;
  return clamp(nv, -0.02 * mx, 1.16 * mx);
}

const SEG: Record<string, string> = { 0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg', '?': 'abge', '-': 'g', ' ': '' };
/** a seven-segment digit */
function seg7(g: CanvasRenderingContext2D, ch: string, x: number, y: number, w: number, hh: number, on: string, off: string) {
  const t = w * 0.2, segs = SEG[ch] ?? '', H2 = hh / 2;
  const bar = (x0: number, y0: number, horiz: boolean, len: number) => {
    g.beginPath();
    if (horiz) { g.moveTo(x0, y0); g.lineTo(x0 + t / 2, y0 - t / 2); g.lineTo(x0 + len - t / 2, y0 - t / 2); g.lineTo(x0 + len, y0); g.lineTo(x0 + len - t / 2, y0 + t / 2); g.lineTo(x0 + t / 2, y0 + t / 2); }
    else { g.moveTo(x0, y0); g.lineTo(x0 + t / 2, y0 + t / 2); g.lineTo(x0 + t / 2, y0 + len - t / 2); g.lineTo(x0, y0 + len); g.lineTo(x0 - t / 2, y0 + len - t / 2); g.lineTo(x0 - t / 2, y0 + t / 2); }
    g.closePath(); g.fill();
  };
  const all: Record<string, [number, number, boolean, number]> = {
    a: [x + t * 0.6, y, true, w - t * 1.2], g: [x + t * 0.6, y + H2, true, w - t * 1.2], d: [x + t * 0.6, y + hh, true, w - t * 1.2],
    f: [x + t * 0.5, y + t * 0.6, false, H2 - t * 1.2], b: [x + w - t * 0.5, y + t * 0.6, false, H2 - t * 1.2],
    e: [x + t * 0.5, y + H2 + t * 0.6, false, H2 - t * 1.2], c: [x + w - t * 0.5, y + H2 + t * 0.6, false, H2 - t * 1.2] };
  for (const k of 'abcdefg') { g.fillStyle = segs.includes(k) ? on : off; bar(...all[k]); }
}

/** the gauge in the frame: `size` of the short side wide, shrunk into the safe area; y −1 puts its foot on the bottom safe line */
export function gaugeBox(p: Pick<P, 'x' | 'y' | 'size'>, W: number, H: number, safe: { top: number; bottom: number; side: number }) {
  const S = Math.min(W, H), w0 = p.size * S, f = Math.min(1, (W * (1 - 2 * safe.side)) / w0, (H * (1 - safe.top - safe.bottom)) / ((w0 * BH) / BW)), w = w0 * f, hh = (w * BH) / BW;
  return { x0: p.x * W - w / 2, y0: p.y >= 0 ? p.y * H : (1 - safe.bottom) * H - hh, w, h: hh, u: w / BW };
}

export const gauge: ItemType<P, S> = {
  type: 'common.gauge', label: '儀表計量表', category: 'number', kind: 'overlay',
  doc: '半圓速度表：色區（起點:名稱）沿著刻度帶、彈簧指針、LED 數字讀數和目前色區名稱，光環漸漸變成惡魔角；hits「秒:加分」每筆讓指針彈一下；可開場亂跳、開機掃一次、警報紅燈、最後爆表（指針撞到底、玻璃裂）；罪惡指數、辣度、心動指數、熱度',
  params: [
    { key: 'hits', label: '加分（秒:分數，逗號分隔）', type: 'text', default: '0.3:12, 0.7:15, 1.1:20, 1.5:26, 1.9:24' },
    { key: 'zones', label: '色區（起點:名稱[:顏色]，逗號分隔）', type: 'text', default: '0:清白, 20:小確幸, 40:有點罪, 60:罪孽深重, 85:地獄級' },
    { key: 'max', label: '滿分', type: 'number', min: 1, max: 100000, step: 1, default: 100 },
    { key: 'unit', label: '讀數後面的單位', type: 'string', default: '分' },
    { key: 'scramble', label: '開場亂跳到第幾秒（顯示 ???；0＝不亂跳）', type: 'number', min: 0, max: 600, step: 0.05, default: 0 },
    { key: 'boot', label: '開機掃描的時間（秒；-1＝不掃）', type: 'number', min: -1, max: 600, step: 0.05, default: -1 },
    { key: 'danger', label: '警報開始（秒；-1＝沒有）', type: 'number', min: -1, max: 600, step: 0.05, default: 1.9 },
    { key: 'boom', label: '爆表（秒；-1＝不爆）', type: 'number', min: -1, max: 600, step: 0.05, default: 2.3 },
    { key: 'boomText', label: '爆表時讀數閃的字', type: 'string', default: '爆表' },
    { key: 'boomLabel', label: '爆表時的色區名稱', type: 'string', default: '超越地獄' },
    { key: 'scrambleLabel', label: '亂跳時的色區名稱', type: 'string', default: '計算中…' },
    { key: 'standbyLabel', label: '開機前的色區名稱', type: 'string', default: '待機中' },
    { key: 'countLabel', label: '左上角計數牌（{n}＝第幾筆；空＝不顯示）', type: 'string', default: '' },
    { key: 'halo', label: '天使光環→惡魔角', type: 'bool', default: true },
    { key: 'x', label: '中心 x（畫面寬比例）', type: 'number', min: 0, max: 1, step: 0.005, default: 0.5 },
    { key: 'y', label: '上緣（畫面高比例；-1＝下緣貼齊下方安全區）', type: 'number', min: -1, max: 1, step: 0.005, default: -1 },
    { key: 'size', label: '寬（畫面短邊的比例）', type: 'number', min: 0.2, max: 1.2, step: 0.01, default: 0.8 },
    { key: 'font', label: '字型', type: 'string', default: 'Noto Sans TC', theme: 'fonts.display' },
    { key: 'body', label: '外殼顏色', type: 'color', default: '#2a1711', theme: 'palette.ink' },
    { key: 'face', label: '刻度與字的顏色', type: 'color', default: '#f6ead8', theme: 'palette.paper' },
    { key: 'accent', label: '警報與高分色', type: 'color', default: '#e63a2e', theme: 'palette.accent' },
    { key: 'hl', label: '光環與低分色', type: 'color', default: '#ffc94a', theme: 'palette.hl' },
    { key: 'led', label: 'LED 顏色', type: 'color', default: '#ffb13b' },
  ],
  build(ctx) {
    const box = h('div', null, null, ctx.root), cv = h('canvas', null, null, box);
    cssCamel(box, { position: 'absolute' });
    cssCamel(cv, { position: 'absolute' });
    const mk = (extra: Record<string, string> = {}) => { const d = h('div', null, null, box); cssCamel(d, { position: 'absolute', whiteSpace: 'pre', lineHeight: '1', fontWeight: '900', ...extra }); return d; };
    return { cv, box, chars: [], nums: [mk(), mk(), mk()], unit: mk(), boomEl: mk({ transform: 'translate(-50%, -50%)' }), label: mk({ transform: 'translateX(-50%)' }), tab: mk(), key: '' };
  },
  hide(s) { freeCanvas(s.cv); },
  draw(ctx, s) {
    const p = ctx.params, { W, H, theme, local: t, dur } = ctx, b = gaugeBox(p, W, H, theme.safe), u = b.u, mx = p.max || 100;
    const zones = parseZones(p.zones, mx, [p.face, p.hl, p.accent, mixHex(p.accent, '#000000', 0.45)]), hits = parseHits(p.hits);
    const { v, shown, count } = gaugeValue(hits, t), booming = p.boom >= 0 && t >= p.boom, danger = p.danger >= 0 && t >= p.danger && !booming;
    const scrambling = t < p.scramble, standby = !scrambling && p.boot >= 0 && t < p.boot, nv = needleAt(p, v, t);
    const ang = (x: number) => Math.PI + (clamp(x / mx, -0.02, 1.16)) * Math.PI;
    const fade = Math.min(prog(t, 0, 0.2), 1 - prog(t, dur - 0.2, dur)), font = `'${p.font}', 'Noto Sans TC', sans-serif`;
    cssCamel(s.box, { left: `${b.x0}px`, top: `${b.y0}px`, width: `${b.w}px`, height: `${b.h}px`, opacity: String(fade), fontFamily: font });
    cssCamel(s.cv, { left: `${-M * u}px`, top: `${-M * u}px`, width: `${(BW + 2 * M) * u}px`, height: `${(BH + 2 * M) * u}px` });
    const g = canvasAt(s.cv, (BW + 2 * M) * u, (BH + 2 * M) * u);
    g.save(); g.scale(u, u); g.translate(M, M);
    // housing
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.arc(CX, CY + 10, R + 46, Math.PI, 0); g.lineTo(CX + R + 46, CY + 150); g.lineTo(CX - R - 46, CY + 150); g.closePath(); g.fill();
    g.fillStyle = p.body; g.strokeStyle = p.face; g.lineWidth = 6;
    g.beginPath(); g.arc(CX, CY, R + 40, Math.PI, 0); g.lineTo(CX + R + 40, CY + 140); g.arcTo(CX + R + 40, CY + 170, CX + R + 10, CY + 170, 30); g.lineTo(CX - R - 10, CY + 170); g.arcTo(CX - R - 40, CY + 170, CX - R - 40, CY + 140, 30); g.closePath(); g.fill(); g.stroke();
    // zones
    const rb = R - BAND / 2, lit = (z: Zone) => !standby && (booming || scrambling || v >= z.from);
    for (const z of zones) {
      g.strokeStyle = z.color; g.globalAlpha = lit(z) ? 1 : 0.28; g.lineWidth = BAND; g.lineCap = 'butt';
      g.beginPath(); g.arc(CX, CY, rb, ang(z.from) + 0.006, ang(z.to) - 0.006); g.stroke();
    }
    g.globalAlpha = 1;
    // ticks: 20 steps, every other one long
    for (let k = 0; k <= 20; k++) {
      const th = ang((k / 20) * mx), r0 = R - BAND - 8, r1 = r0 - (k % 2 ? 16 : 30);
      g.strokeStyle = p.face; g.globalAlpha = 0.8; g.lineWidth = k % 2 ? 3 : 6;
      g.beginPath(); g.moveTo(CX + Math.cos(th) * r0, CY + Math.sin(th) * r0); g.lineTo(CX + Math.cos(th) * r1, CY + Math.sin(th) * r1); g.stroke();
    }
    g.globalAlpha = 1;
    // a halo (innocent) that gives way to horns (guilty) above the hub
    if (p.halo) {
      const sinP = booming ? 1 : clamp((standby ? 0 : v) / (0.7 * mx)), bob = Math.sin(t * 4) * 4;
      g.save(); g.globalAlpha = 1 - sinP; g.strokeStyle = p.hl; g.lineWidth = 9; g.beginPath(); g.ellipse(CX, CY - 150 + bob, 62, 16, 0, 0, Math.PI * 2); g.stroke(); g.restore();
      g.save(); g.globalAlpha = clamp((sinP - 0.35) / 0.4); g.fillStyle = p.accent;
      for (const sx of [-1, 1]) {
        g.beginPath(); g.moveTo(CX + sx * 34, CY - 70); g.quadraticCurveTo(CX + sx * 66, CY - 120, CX + sx * 58, CY - 168 + bob); g.quadraticCurveTo(CX + sx * 46, CY - 110, CX + sx * 6, CY - 80); g.closePath(); g.fill();
      }
      g.restore();
    }
    // the needle and the hub
    g.save(); g.translate(CX, CY); g.rotate(ang(nv));
    g.fillStyle = 'rgba(0,0,0,0.4)'; g.beginPath(); g.moveTo(-30, 10); g.lineTo(R - 70, 8); g.lineTo(R - 70, 14); g.lineTo(-30, 22); g.closePath(); g.fill();
    g.fillStyle = booming || danger ? '#ff2b2b' : p.face;
    g.beginPath(); g.moveTo(-34, -12); g.lineTo(R - 66, -3); g.lineTo(R - 54, 0); g.lineTo(R - 66, 3); g.lineTo(-34, 12); g.closePath(); g.fill();
    g.restore();
    g.fillStyle = p.accent; g.beginPath(); g.arc(CX, CY, 40, 0, Math.PI * 2); g.fill(); g.strokeStyle = p.face; g.lineWidth = 6; g.stroke();
    g.fillStyle = p.body; g.beginPath(); g.arc(CX, CY, 13, 0, Math.PI * 2); g.fill();
    // the LED readout
    const bx = CX - 190, by = CY + 52, bw = 380, bh = 104;
    g.beginPath(); g.roundRect(bx, by, bw, bh, 18); g.fillStyle = '#0c0605'; g.fill(); g.strokeStyle = withAlpha(p.face, 0.5); g.lineWidth = 3; g.stroke();
    const ledOn = booming || danger ? (Math.sin(t * 18) > -0.3 ? '#ff3b30' : '#7a1410') : standby ? withAlpha(p.led, 0.15) : p.led, ledOff = withAlpha(p.led, 0.07);
    const word = booming && Math.floor((t - p.boom) * 4) % 2 === 0;
    if (!word) {
      const str = scrambling ? '???' : booming ? '999' : String(clamp(shown, 0, 999)).padStart(3, ' ');
      [...str].forEach((ch, i) => seg7(g, ch, bx + 34 + i * 82, by + 16, 58, 72, ledOn, ledOff));
    }
    // warning lamps
    for (const sx of [-1, 1]) {
      const on = (danger || booming) && Math.sin(t * 16 + (sx > 0 ? Math.PI : 0)) > 0, lx = CX + sx * (R - 6), ly = CY + 108;
      g.fillStyle = on ? '#ff2b2b' : '#4a1712'; g.beginPath(); g.arc(lx, ly, 22, 0, Math.PI * 2); g.fill();
      if (on) { const rg = g.createRadialGradient(lx, ly, 4, lx, ly, 90); rg.addColorStop(0, 'rgba(255,60,40,0.55)'); rg.addColorStop(1, 'rgba(255,60,40,0)'); g.fillStyle = rg; g.beginPath(); g.arc(lx, ly, 90, 0, Math.PI * 2); g.fill(); }
    }
    // cracked glass once it blew
    if (booming) {
      const q = prog(t, p.boom, p.boom + 0.25), ox = CX + 150, oy = CY - 210;
      g.save(); g.beginPath(); g.arc(CX, CY, R + 34, Math.PI, 0); g.closePath(); g.clip();
      g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 3; g.lineCap = 'round';
      for (let k = 0; k < 11; k++) {
        const a0 = (k / 11) * Math.PI * 2 + hash01(k) * 0.4, len = (130 + hash01(k, 2) * 260) * q;
        g.beginPath(); g.moveTo(ox, oy);
        for (let st = 1; st <= 4; st++) { const a = a0 + (hash01(k, st + 3) - 0.5) * 0.7; g.lineTo(ox + (Math.cos(a) * len * st) / 4, oy + (Math.sin(a) * len * st) / 4); }
        g.stroke();
      }
      g.globalAlpha = 0.45 * q; g.beginPath(); for (let k = 0; k < 3; k++) { g.moveTo(ox + 30 + k * 26, oy); g.arc(ox, oy, 30 + k * 26, 0, Math.PI * 2); } g.stroke();
      g.restore();
    }
    g.restore();
    // the text: zone names along the band (one rotated div a character), 0 / half / max, the unit, the zone under the readout, the count tab
    const key = JSON.stringify(zones.map((z) => z.name));
    if (s.key !== key) {
      s.key = key;
      for (const c of s.chars) c.remove();
      s.chars = zones.flatMap((z) => [...z.name].map((ch) => { const d = h('div', null, null, s.box); d.textContent = ch; cssCamel(d, { position: 'absolute', lineHeight: '1', fontWeight: '900', whiteSpace: 'pre' }); return d; }));
    }
    let ci = 0;
    for (const z of zones) {
      const chars = [...z.name], mid = ang((z.from + z.to) / 2), step = 36 / rb, on = lit(z);
      chars.forEach((_, i) => {
        const th = mid + (i - (chars.length - 1) / 2) * step, d = s.chars[ci++];
        cssCamel(d, { left: `${(CX + Math.cos(th) * rb) * u}px`, top: `${(CY + Math.sin(th) * rb) * u}px`, fontSize: `${32 * u}px`, color: light(z.color) ? p.body : p.face,
          opacity: on ? '1' : '0.5', transform: `translate(-50%, -50%) rotate(${((th + Math.PI / 2) * 180) / Math.PI}deg)` });
      });
    }
    [0, mx / 2, mx].forEach((val, i) => {
      const th = ang(val), r = R - BAND - 62, d = s.nums[i];
      d.textContent = String(Math.round(val));
      cssCamel(d, { left: `${(CX + Math.cos(th) * r) * u}px`, top: `${(CY + Math.sin(th) * r + (i === 1 ? 6 : -10)) * u}px`, fontSize: `${30 * u}px`, fontWeight: '700', color: p.face,
        transform: 'translate(-50%, -70%)' });
    });
    s.unit.textContent = p.unit;
    cssCamel(s.unit, { display: p.unit && !word ? 'block' : 'none', left: `${(bx + 292) * u}px`, top: `${(by + 62) * u}px`, fontSize: `${26 * u}px`, color: ledOn });
    s.boomEl.textContent = p.boomText;
    cssCamel(s.boomEl, { display: word ? 'block' : 'none', left: `${CX * u}px`, top: `${(by + bh / 2 + 4) * u}px`, fontSize: `${78 * u}px`, color: ledOn });
    const z = zones.find((x) => v < x.to) ?? zones[zones.length - 1];
    const zname = scrambling ? p.scrambleLabel : standby ? p.standbyLabel : booming ? p.boomLabel : z?.name ?? '';
    // the last (darkest) zone's colour is lightened so its name reads on the housing
    const zcol = booming ? p.hl : standby ? withAlpha(p.face, 0.5) : !z ? p.face : z === zones[zones.length - 1] && zones.length > 1 ? mixHex(z.color, '#ffffff', 0.45) : z.color;
    s.label.textContent = zname;
    cssCamel(s.label, { left: `${CX * u}px`, top: `${(CY + 172) * u}px`, fontSize: `${38 * u}px`, color: zcol, webkitTextStroke: `${8 * u}px ${p.body}`, paintOrder: 'stroke fill' });
    const tab = p.countLabel && count > 0 ? p.countLabel.replace('{n}', String(Math.min(count, 99)).padStart(2, '0')) : '';
    s.tab.textContent = tab;
    cssCamel(s.tab, { display: tab ? 'block' : 'none', left: `${0}px`, top: `${0}px`, fontSize: `${34 * u}px`, padding: `${11 * u}px ${20 * u}px`, borderRadius: `${12 * u}px`, background: p.accent, color: p.face });
  },
};
