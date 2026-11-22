// common.progress battery (spec 2026-11-22, progress characters): a phone's charging battery in a corner of the safe area (`align`
// left, or right — center counts as right), not across the frame. An outline in `paper` with a little terminal nub on its right,
// `dots` cells inside with small gaps between them: they light one by one in `color`, the one charging breathes, and while the charge
// is under 20% the lit cells are red. When full, the whole battery turns the `done` colour and its cells blink twice within 0.8 s.
// The percentage beside it (on the inner side, counting 0–100) is DOM text `size` % of the frame height tall, so check measures it.
// All DOM; the battery is `size × 2.6` wide and `size × 1.2` tall in frame-height %.
import { abs, clamp, cssCamel } from '@tellcut/engine';
import { withAlpha } from '../color.ts';
import { arrived, band, travel, type Draw } from './shared.ts';

const LOW = '#ff4d4f';
/** seconds of each of the two blinks when full (off for the second half of each) */
const BLINK = 0.4;

/** `lit` cells fully on, `charging` the index breathing (−1 when full), low when the charge is under 20%, blink during the two
 *  flashes after full (`since` = arrived(); −1 before) */
export function batteryState(p: number, n: number, since: number): { lit: number; charging: number; low: boolean; full: boolean; blink: boolean; percent: number } {
  const m = Math.max(1, Math.round(Number.isFinite(n) ? n : 1)), q = clamp(Number.isFinite(p) ? p : 0), full = q >= 1;
  const lit = full ? m : Math.min(m - 1, Math.floor(q * m + 1e-9)), percent = full ? 100 : Math.min(99, Math.floor(q * 100 + 1e-9));
  const blink = full && since >= 0 && since < 2 * BLINK && since % BLINK >= BLINK / 2;
  return { lit, charging: full ? -1 : lit, low: !full && q < 0.2, full, blink, percent };
}

/** the charging cell's breath, 0.3…1, a little over once a second */
const breath = (local: number) => 0.3 + 0.7 * (0.5 + 0.5 * Math.cos((2 * Math.PI * local) / 1.1));

export const drawBattery: Draw = (ctx, p, m) => {
  const { W, H, local, dur } = ctx, k = Math.min(W, H) / 1080, n = Math.max(1, Math.round(p.dots));
  if (!m.el.body) {
    m.el.body = abs(m.root, { boxSizing: 'border-box', borderStyle: 'solid' });
    m.el.nub = abs(m.root);
    for (let i = 0; i < n; i++) m.list.push(abs(m.root));
    m.el.text = abs(m.root, { whiteSpace: 'pre', lineHeight: '1', fontWeight: '700', fontFamily: "'Noto Sans TC', sans-serif", fontVariantNumeric: 'tabular-nums' }, 'span');
  }
  const size = Math.max(0.1, p.size) / 100 * H, bw = size * 2.6, bh = size * 1.2, fs = size, lw = Math.max(2, p.thickness * 0.25 * k);
  const nw = Math.max(lw * 1.5, bh * 0.11), nh = bh * 0.44, height = Math.max(bh, fs * 1.15);
  const { x, w, top } = band(ctx, p, height), cy = top + height / 2, left = p.align === 'left';
  const bx = left ? x : x + w - nw - bw, by = cy - bh / 2;
  const st = batteryState(travel(p.step, p.dots, local, dur), n, arrived(p.step, p.dots, local, dur));
  const line = st.full ? p.done : p.paper, on = st.low ? LOW : st.full ? p.done : p.color;
  cssCamel(m.el.body, { left: `${bx.toFixed(2)}px`, top: `${by.toFixed(2)}px`, width: `${bw.toFixed(2)}px`, height: `${bh.toFixed(2)}px`, borderWidth: `${lw.toFixed(2)}px`,
    borderColor: line, borderRadius: `${(bh * 0.26).toFixed(2)}px`, background: 'rgba(0,0,0,0.38)', boxShadow: `0 ${(2 * k).toFixed(2)}px ${(8 * k).toFixed(2)}px rgba(0,0,0,0.35)` });
  cssCamel(m.el.nub, { left: `${(bx + bw - lw * 0.2).toFixed(2)}px`, top: `${(cy - nh / 2).toFixed(2)}px`, width: `${(nw + lw * 0.2).toFixed(2)}px`, height: `${nh.toFixed(2)}px`,
    borderRadius: `0 ${(nw * 0.6).toFixed(2)}px ${(nw * 0.6).toFixed(2)}px 0`, background: line });
  // the cells, inside the outline with a gap all round them and between them
  const gap = Math.max(1.5, bh * 0.08), pad = lw + gap, cw = Math.max(0, (bw - 2 * pad - gap * (n - 1)) / n), ch = Math.max(0, bh - 2 * pad);
  m.list.forEach((cell, i) => {
    const lit = i < st.lit, charging = i === st.charging;
    cssCamel(cell, { left: `${(bx + pad + i * (cw + gap)).toFixed(2)}px`, top: `${(by + pad).toFixed(2)}px`, width: `${cw.toFixed(2)}px`, height: `${ch.toFixed(2)}px`,
      borderRadius: `${Math.max(1, bh * 0.08).toFixed(2)}px`, background: lit || charging ? on : withAlpha(p.paper, 0.14),
      opacity: (st.blink ? 0.15 : charging ? breath(local) : 1).toFixed(3) });
  });
  // the percentage on the battery's inner side: after the nub when it sits on the left, ending before the outline on the right
  const text = m.el.text, label = `${st.percent}%`;
  if (text.textContent !== label) text.textContent = label;
  cssCamel(text, { left: `${(left ? bx + bw + nw + 0.32 * fs : bx - 0.32 * fs).toFixed(2)}px`, top: `${(cy - fs / 2).toFixed(2)}px`, transform: left ? 'none' : 'translateX(-100%)',
    fontSize: `${fs.toFixed(2)}px`, color: st.full ? p.done : st.low ? LOW : p.paper, textShadow: `0 ${(2 * k).toFixed(2)}px ${(6 * k).toFixed(2)}px rgba(0,0,0,0.55)` });
};
