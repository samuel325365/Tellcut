// common.timelapse — time passing in fast forward: the picture dims, a clock face whose hands spin, the hours counting up under it
// ("冷藏 2.3 小時") and a blinking "▶▶ 快轉". Promoted from the baking-sin short's fx.sinClock; chilling, baking, waiting, overnight.
import { cssCamel, h, prog, type ItemType } from '@tellcut/engine';
import { canvasAt, freeCanvas } from './inkline.ts';

interface P { from: number; to: number; text: string; unit: string; decimals: number; badge: string; x: number; y: number; size: number; dim: number; font: string; paper: string; ink: string; accent: string; hl: string }
interface S { cv: HTMLCanvasElement; label: HTMLElement; badge: HTMLElement }

/** the hours shown at t: from → to over the item, after a 0.15 s start and before a 0.3 s rest */
export const hoursAt = (from: number, to: number, t: number, dur: number) => from + (to - from) * prog(t, 0.15, Math.max(0.2, dur - 0.3));

export const timelapse: ItemType<P, S> = {
  type: 'common.timelapse', label: '快轉時鐘', category: 'number', kind: 'overlay',
  doc: '時間快轉：畫面壓暗、鐘面指針狂轉、下面的時數一路往上數（「冷藏 2.3 小時」）、上方「▶▶ 快轉」閃爍；冷藏、烘烤、發酵、等待、一夜過去的跳接',
  params: [
    { key: 'from', label: '從幾小時', type: 'number', min: 0, max: 1000, step: 0.5, default: 0 },
    { key: 'to', label: '到幾小時', type: 'number', min: 0, max: 1000, step: 0.5, default: 4 },
    { key: 'text', label: '時數前的字', type: 'string', default: '冷藏' },
    { key: 'unit', label: '單位', type: 'string', default: '小時' },
    { key: 'decimals', label: '小數位數', type: 'number', min: 0, max: 2, step: 1, default: 1 },
    { key: 'badge', label: '上方閃爍的字（空＝不顯示）', type: 'string', default: '▶▶ 快轉' },
    { key: 'x', label: '鐘的中心 x（畫面寬比例）', type: 'number', min: 0, max: 1, step: 0.005, default: 0.5 },
    { key: 'y', label: '鐘的中心 y（畫面高比例）', type: 'number', min: 0, max: 1, step: 0.005, default: 0.4 },
    { key: 'size', label: '鐘的直徑（畫面短邊的比例）', type: 'number', min: 0.1, max: 0.9, step: 0.01, default: 0.32 },
    { key: 'dim', label: '畫面壓暗（0–1）', type: 'number', min: 0, max: 1, step: 0.05, default: 0.5 },
    { key: 'font', label: '字型', type: 'string', default: 'Noto Sans TC', theme: 'fonts.display' },
    { key: 'paper', label: '鐘面與字色', type: 'color', default: '#fff6e6', theme: 'palette.paper' },
    { key: 'ink', label: '指針與描邊', type: 'color', default: '#1b0f0b', theme: 'palette.ink' },
    { key: 'accent', label: '鐘框與分針', type: 'color', default: '#e63a2e', theme: 'palette.accent' },
    { key: 'hl', label: '閃爍字顏色', type: 'color', default: '#ffc94a', theme: 'palette.hl' },
  ],
  build(ctx) {
    const cv = h('canvas', null, null, ctx.root), mk = () => { const d = h('div', null, null, ctx.root); cssCamel(d, { position: 'absolute', whiteSpace: 'pre', lineHeight: '1', fontWeight: '900', transform: 'translate(-50%, -50%)', paintOrder: 'stroke fill' }); return d; };
    cssCamel(cv, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%' });
    return { cv, label: mk(), badge: mk() };
  },
  hide(s) { freeCanvas(s.cv); },
  draw(ctx, s) {
    const p = ctx.params, { W, H, local: t, dur } = ctx, S = Math.min(W, H), k = S / 1080, a = prog(t, 0, 0.15) * (1 - prog(t, dur - 0.15, dur));
    const cx = p.x * W, cy = p.y * H, r = (p.size * S) / 2, hrs = hoursAt(p.from, p.to, t, dur), font = `'${p.font}', 'Noto Sans TC', sans-serif`;
    const g = canvasAt(s.cv, W, H);
    g.globalAlpha = a;
    g.fillStyle = `rgba(0,0,0,${p.dim})`; g.fillRect(0, 0, W, H);
    g.fillStyle = p.paper; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
    g.strokeStyle = p.accent; g.lineWidth = r * 0.082; g.stroke();
    for (let i = 0; i < 12; i++) {
      const th = (i / 12) * Math.PI * 2; g.strokeStyle = p.ink; g.lineWidth = r * (i % 3 ? 0.024 : 0.053);
      g.beginPath(); g.moveTo(cx + Math.cos(th) * r * 0.894, cy + Math.sin(th) * r * 0.894); g.lineTo(cx + Math.cos(th) * r * 0.753, cy + Math.sin(th) * r * 0.753); g.stroke();
    }
    const mh = hrs * Math.PI * 2 - Math.PI / 2, hh = (hrs / 12) * Math.PI * 2 - Math.PI / 2 + (Math.PI * 4) / 6;
    g.lineCap = 'round'; g.strokeStyle = p.ink; g.lineWidth = r * 0.082;
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(hh) * r * 0.5, cy + Math.sin(hh) * r * 0.5); g.stroke();
    g.lineWidth = r * 0.053; g.strokeStyle = p.accent; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(mh) * r * 0.78, cy + Math.sin(mh) * r * 0.78); g.stroke();
    g.fillStyle = p.ink; g.beginPath(); g.arc(cx, cy, r * 0.082, 0, Math.PI * 2); g.fill();
    s.label.textContent = `${p.text} ${hrs.toFixed(Math.max(0, Math.round(p.decimals)))} ${p.unit}`.trim();
    cssCamel(s.label, { left: `${cx}px`, top: `${cy + r + 90 * k}px`, fontSize: `${86 * k}px`, fontFamily: font, color: p.paper, opacity: String(a), webkitTextStroke: `${14 * k}px ${p.ink}` });
    s.badge.textContent = p.badge;
    cssCamel(s.badge, { display: p.badge ? 'block' : 'none', left: `${cx}px`, top: `${cy - r - 58 * k}px`, fontSize: `${52 * k}px`, fontFamily: font, color: p.hl, webkitTextStroke: `${10 * k}px ${p.ink}`,
      opacity: String(Math.sin(t * 14) > -0.2 ? a : 0) });
  },
};
