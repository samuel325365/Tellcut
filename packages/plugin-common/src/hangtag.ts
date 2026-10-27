// common.hangtag — an evidence-style hang tag slammed onto the picture: a big "+12", the name, its original name in small italics
// and a one-line quip on a pill; then the "+12" flies off to a point (a common.gauge, a score) and lands with a ring.
// Promoted from the baking-sin short's fx.sinStamp; also prices, calories, points, a counter that adds up.
import { abs, clamp, cssCamel, eOut3 as eOut, h, type ItemType, prog } from '@tellcut/engine';

interface P {
  value: string; name: string; sub: string; quip: string; x: number; y: number; tilt: number; size: number; toX: number; toY: number;
  font: string; paper: string; ink: string; accent: string; hl: string;
}
interface S { tag: HTMLElement; hole: HTMLElement; value: HTMLElement; name: HTMLElement; sub: HTMLElement; quip: HTMLElement; fly: HTMLElement; ring: HTMLElement }

/** the slam: big, then landing (0.14 s) with a small bounce, a little smaller as it leaves */
export const tagScale = (t: number, dur: number) => {
  const inP = prog(t, 0, 0.14), outP = prog(t, dur - 0.14, dur);
  return (inP < 1 ? 2.3 - 1.3 * eOut(inP) : 1 + Math.sin(prog(t, 0.14, 0.4) * Math.PI) * 0.04) * (1 - 0.15 * outP);
};

export const hangtag: ItemType<P, S> = {
  type: 'common.hangtag', label: '加分吊牌', category: 'number', kind: 'overlay',
  doc: '證物吊牌式的印章斜斜蓋在畫面上：大大的「＋分數」、名稱、原文小字、一句吐槽；接著「＋分數」飛向指定的點（例如 common.gauge）並在那裡炸一圈；計分、價錢、熱量、罪狀、收集',
  params: [
    { key: 'value', label: '大字（例：+12、NT$80）', type: 'string', default: '+12' },
    { key: 'name', label: '名稱', type: 'string', default: '生蔗糖' },
    { key: 'sub', label: '原文小字（斜體；空＝不顯示）', type: 'string', default: 'Raw sugar' },
    { key: 'quip', label: '吐槽（空＝不顯示）', type: 'string', default: '先來點糖' },
    { key: 'x', label: '中心 x（畫面寬比例）', type: 'number', min: 0, max: 1, step: 0.005, default: 0.36 },
    { key: 'y', label: '中心 y（畫面高比例）', type: 'number', min: 0, max: 1, step: 0.005, default: 0.4 },
    { key: 'tilt', label: '傾斜（度）', type: 'number', min: -30, max: 30, step: 0.5, default: -6 },
    { key: 'size', label: '大小（倍）', type: 'number', min: 0.4, max: 2.5, step: 0.05, default: 1 },
    { key: 'toX', label: '大字飛去的 x（畫面寬比例；-1＝不飛）', type: 'number', min: -1, max: 1, step: 0.005, default: 0.5 },
    { key: 'toY', label: '大字飛去的 y（畫面高比例）', type: 'number', min: 0, max: 1, step: 0.005, default: 0.7 },
    { key: 'font', label: '字型', type: 'string', default: 'Noto Sans TC', theme: 'fonts.display' },
    { key: 'paper', label: '吊牌紙色', type: 'color', default: '#fff6e6', theme: 'palette.paper' },
    { key: 'ink', label: '墨色', type: 'color', default: '#1b0f0b', theme: 'palette.ink' },
    { key: 'accent', label: '大字與框的顏色', type: 'color', default: '#e63a2e', theme: 'palette.accent' },
    { key: 'hl', label: '飛出去的大字顏色', type: 'color', default: '#ffc94a', theme: 'palette.hl' },
  ],
  build(ctx) {
    const tag = abs(ctx.root, { transform: 'translate(-50%, -50%)', whiteSpace: 'pre', lineHeight: '1', boxSizing: 'border-box' });
    const row = h('div', null, null, tag), value = h('div', null, null, row), col = h('div', null, null, row), name = h('div', null, null, col), sub = h('div', null, null, col);
    const quip = h('div', null, null, tag), hole = abs(tag);
    cssCamel(row, { display: 'flex', alignItems: 'center', gap: '0.25em' });
    cssCamel(col, { display: 'flex', flexDirection: 'column', gap: '0.12em' });
    cssCamel(quip, { display: 'inline-block' });
    const fly = abs(ctx.root, { whiteSpace: 'pre', lineHeight: '1', fontWeight: '900', transform: 'translate(-50%, -50%)' }), ring = abs(ctx.root, { borderRadius: '50%', boxSizing: 'border-box' });
    return { tag, hole, value, name, sub, quip, fly, ring };
  },
  draw(ctx, s) {
    const p = ctx.params, { W, H, local: t, dur } = ctx, k = (Math.min(W, H) / 1080) * p.size, font = `'${p.font}', 'Noto Sans TC', sans-serif`;
    const alpha = clamp(prog(t, 0, 0.14) * 3) * (1 - prog(t, dur - 0.14, dur)), ax = p.x * W, ay = p.y * H;
    cssCamel(s.tag, { left: `${ax}px`, top: `${ay}px`, minWidth: `${400 * k}px`, padding: `${30 * k}px ${40 * k}px ${p.quip ? 26 * k : 34 * k}px`, borderRadius: `${18 * k}px`,
      background: p.paper, boxShadow: `inset 0 0 0 ${10 * k}px ${p.paper}, inset 0 0 0 ${16 * k}px ${p.accent}, ${10 * k}px ${12 * k}px 0 rgba(0,0,0,0.35)`,
      fontFamily: font, opacity: String(alpha), transform: `translate(-50%, -50%) rotate(${p.tilt}deg) scale(${tagScale(t, dur)})` });
    cssCamel(s.hole, { left: `${25 * k}px`, top: `${25 * k}px`, width: `${18 * k}px`, height: `${18 * k}px`, borderRadius: '50%', background: p.ink });
    s.value.textContent = p.value; s.name.textContent = p.name; s.sub.textContent = p.sub; s.quip.textContent = p.quip;
    cssCamel(s.value, { fontSize: `${92 * k}px`, fontWeight: '900', color: p.accent });
    cssCamel(s.name, { fontSize: `${64 * k}px`, fontWeight: '900', color: p.ink });
    cssCamel(s.sub, { display: p.sub ? 'block' : 'none', fontSize: `${28 * k}px`, fontStyle: 'italic', fontWeight: '500', fontFamily: "'Noto Serif TC', serif", color: '#8a6a55' });
    cssCamel(s.quip, { display: p.quip ? 'inline-block' : 'none', marginTop: `${16 * k}px`, fontSize: `${34 * k}px`, fontWeight: '700', padding: `${8 * k}px ${18 * k}px`, borderRadius: `${25 * k}px`, background: p.ink, color: p.paper });
    // the flying value, then a ring where it lands
    const fp = prog(t, 0.12, 0.45), fly = p.toX >= 0 && fp > 0 && fp < 1, x1 = p.toX * W, y1 = p.toY * H;
    s.fly.textContent = p.value;
    if (fly) {
      const e = eOut(fp), x0 = ax - 60 * k, y0 = ay - 10 * k, x = x0 + (x1 - x0) * e, y = y0 + (y1 - y0) * e - Math.sin(e * Math.PI) * 140 * k, px = (84 - 30 * e) * k;
      cssCamel(s.fly, { display: 'block', left: `${x}px`, top: `${y}px`, fontSize: `${px}px`, fontFamily: font, color: p.hl, opacity: String(1 - fp * 0.3), webkitTextStroke: `${px * 0.2}px ${p.ink}`, paintOrder: 'stroke fill' });
    } else cssCamel(s.fly, { display: 'none' });
    const lp = prog(t, 0.45, 0.8), r = (60 + lp * 230) * k;
    cssCamel(s.ring, { display: p.toX >= 0 && lp > 0 && lp < 1 ? 'block' : 'none', left: `${x1 - r}px`, top: `${y1 - r}px`, width: `${2 * r}px`, height: `${2 * r}px`,
      border: `${(10 * (1 - lp) + 2) * k}px solid ${p.hl}`, opacity: String(1 - lp) });
  },
};
