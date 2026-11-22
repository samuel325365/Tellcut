import type { ItemType, Plugin } from './plugin.ts';
import { clamp, cssCamel, eIO3, h, lerp, prog } from './util.ts';
import { textTypes } from './text.ts';

interface FlashP { peak: number; rise: number; hold: number; fall: number; power: number; color: string; mode: 'flat' | 'bloom' | 'glow'; x: number; y: number; size: number; keys: string; blend: string; fade: 'none' | 'in' | 'out' }

/** "秒:不透明度, 秒:不透明度" as sorted [time, value] pairs (the bad ones dropped) */
export function flashKeys(s: unknown): Array<[number, number]> {
  return String(s ?? '').split(/[,，\n]/).map((x) => x.trim()).filter(Boolean).map((x) => x.split(/[:：]/).map(Number) as [number, number])
    .filter((k) => k.length >= 2 && Number.isFinite(k[0]) && Number.isFinite(k[1])).sort((a, b) => a[0] - b[0]);
}

/** the value of the keys at `t`: eased (in-out) between two keys, held before the first and after the last */
export function flashAt(keys: Array<[number, number]>, t: number): number {
  if (!keys.length) return 0;
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) if (t < keys[i][0]) { const [a, va] = keys[i - 1], [b, vb] = keys[i]; return lerp(va, vb, eIO3(prog(t, a, b))); }
  return keys[keys.length - 1][1];
}

/** Full-frame colour flash: ramps up over `rise`, holds, then decays over `fall` (shape^power × peak), or follows `keys`; `fade` out /
 *  in eases the colour fully on / off over the item's whole length instead (the films' ending fade to black, 2026-11-03: ten family
 *  films each wrote the same fx.fade, not seeing a fade in a block named flash).
 *  mode bloom (uk-transit's light at the end of the tunnel): a glow spreading from (x, y) that grows with the same curve and,
 *  past 60 % of it, fills the whole frame. mode glow (2026-11-19, celebrate's gold light): a patch of light of a fixed size at (x, y)
 *  whose strength follows the curve and never covers the frame; laid on (blend normal) it reads over bright footage, where a screen
 *  glow vanishes. `blend` sets the layer's mix-blend-mode (screen: light, multiply: shade). */
const flash: ItemType<FlashP, HTMLElement> = {
  type: 'core.flash', label: '閃白', kind: 'overlay', over: 'picture', likeness: 'colour',
  doc: '整個畫面閃一下顏色（預設白）；重拍、轉場、拍照快門；fade out 是片尾淡出：整個項目長度慢慢蓋滿顏色（color 給 #000 就是淡出到黑），fade in 是片頭從顏色淡入；keys「秒:不透明度」照關鍵影格變（淡入黑、淡出白、閃兩下）；mode bloom 是從一點（x, y）擴散的光暈，越來越大最後蓋滿（隧道盡頭的光、回憶、結尾）；mode glow 是停在 (x, y) 的一團光，大小 size 固定、只有亮度照曲線變，不會蓋滿畫面（慶祝的金光、聚光；blend normal 在亮的畫面上也看得到）；blend 換混合方式（screen 只變亮）',
  params: [
    { key: 'peak', label: '最大不透明度', type: 'number', min: 0, max: 1, step: 0.05, default: 0.85 },
    { key: 'rise', label: '上升 (s)', type: 'number', min: 0, step: 0.05, default: 0 },
    { key: 'hold', label: '停留 (s)', type: 'number', min: 0, step: 0.05, default: 0 },
    { key: 'fall', label: '衰減 (s)', type: 'number', min: 0, step: 0.05, default: 0.3 },
    { key: 'power', label: '曲線次方', type: 'number', min: 1, max: 4, step: 1, default: 1 },
    { key: 'color', label: '顏色', type: 'color', default: '#fff' },
    { key: 'keys', label: '不透明度關鍵影格（「秒:不透明度」逗號分開，相對項目開始；給了就取代最大不透明度、上升、停留、衰減）', type: 'string', default: '' },
    { key: 'mode', label: '樣式（flat 整片一個顏色、bloom 從一點擴散的光暈、glow 停在一點的一團光）', type: 'enum', options: ['flat', 'bloom', 'glow'], default: 'flat' },
    { key: 'x', label: '光暈中心 x（畫面寬比例；bloom、glow）', type: 'number', min: 0, max: 1, step: 0.01, default: 0.5 },
    { key: 'y', label: '光暈中心 y（畫面高比例；bloom、glow）', type: 'number', min: 0, max: 1, step: 0.01, default: 0.5 },
    { key: 'size', label: '光的半徑（畫面長邊比例；glow）', type: 'number', min: 0.05, max: 1.5, step: 0.05, default: 0.5 },
    { key: 'blend', label: '混合方式（normal 蓋上去、screen 只變亮、multiply 只變暗、overlay 疊加）', type: 'enum', options: ['normal', 'screen', 'multiply', 'overlay', 'soft-light'], default: 'normal' },
    { key: 'fade', label: '淡入淡出（out 整個項目長度慢慢蓋滿顏色、in 從顏色慢慢淡開；不看最大不透明度、上升、停留、衰減、關鍵影格）', type: 'enum', options: ['none', 'in', 'out'], default: 'none' },
  ],
  // named sets of these params (templates.ts); their golden samples are core-flash-tpl-<id>
  templates: [
    { id: 'bloom-pop', label: '光暈一閃', doc: '重拍、拍照的一閃：中心的光暈一下蓋滿畫面，再在半秒內縮回一點消失', params: { mode: 'bloom', peak: 1, fall: 0.5 } },
    { id: 'fade-in', label: '白光淡入', doc: '開場、從回憶醒來：一開始整個畫面是白光，在整個項目裡慢慢退成中間一團光暈再收掉，露出畫面', params: { fade: 'in', mode: 'bloom' } },
    { id: 'fade-out', label: '收黑', doc: '片尾、段落結束：整個項目長度慢慢蓋滿黑色，最後全黑', params: { fade: 'out', color: '#000' } },
    { id: 'soft-dip', label: '柔光換段', doc: '柔和的換段：畫面只變亮（screen），0.15 秒亮起、停一下，再慢慢退回', params: { blend: 'screen', rise: 0.15, hold: 0.1, fall: 0.6, power: 2 } },
  ],
  build(ctx) {
    const el = h('div', null, null, ctx.root);
    cssCamel(el, { position: 'absolute', inset: '0', pointerEvents: 'none', background: ctx.params.color });
    if (ctx.params.blend && ctx.params.blend !== 'normal') cssCamel(ctx.root, { mixBlendMode: ctx.params.blend });
    return el;
  },
  draw(ctx, el) {
    const { peak, rise, hold, fall, power, color } = ctx.params;
    const l = ctx.local, keys = flashKeys(ctx.params.keys);
    // the curve (0–1) and how strong it gets at its top: the keys' own values, else shape^power × peak
    let s: number, top: number;
    if (ctx.params.fade === 'in' || ctx.params.fade === 'out') { const p = eIO3(prog(l, 0, ctx.dur)); s = ctx.params.fade === 'out' ? p : 1 - p; top = 1; }
    else if (keys.length) { top =clamp(Math.max(...keys.map((k) => k[1]))); s = top > 0 ? clamp(flashAt(keys, l)) / top : 0; }
    else { const shape = rise > 0 && l < rise ? prog(l, 0, rise) : l < rise + hold ? 1 : 1 - prog(l, rise + hold, rise + hold + fall); s = Math.pow(shape, power); top = peak; }
    if (ctx.params.mode !== 'bloom' && ctx.params.mode !== 'glow') { cssCamel(el, { opacity: String(top * s) }); return; }
    const mix = (a: number) => `color-mix(in srgb, ${color} ${(clamp(a) * 100).toFixed(2)}%, transparent)`;
    const at = `${(ctx.params.x * 100).toFixed(2)}% ${(ctx.params.y * 100).toFixed(2)}%`;
    if (ctx.params.mode === 'glow') {
      // glow: a held patch, full in the middle and gone by its radius (a soft shoulder, no rim), only its strength following the curve
      const a = top * s, r = Math.max(1, (Number(ctx.params.size) || 0.5) * Math.max(ctx.W, ctx.H));
      cssCamel(el, { opacity: a > 0 ? '1' : '0', background: `radial-gradient(circle ${r.toFixed(1)}px at ${at}, ${mix(a)} 0%, ${mix(a * 0.7)} 30%, ${mix(a * 0.3)} 60%, ${mix(a * 0.08)} 85%, ${mix(0)} 100%)` });
      return;
    }
    // bloom: the glow's middle and its radius grow with the curve; past 60 % a flat layer fills the frame
    const R = lerp(0.12, 1.6, s) * Math.max(ctx.W, ctx.H), fill = s > 0.6 ? ((s - 0.6) / 0.4) * top : 0, a = top * clamp(s / 0.15);
    const glow = `radial-gradient(circle ${R.toFixed(1)}px at ${at}, ${mix(lerp(0.5, 1, s) * a)} 0%, ${mix(lerp(0.25, 1, s) * a)} ${(lerp(0.35, 0.85, s) * 100).toFixed(1)}%, ${mix(0)} 100%)`;
    cssCamel(el, { opacity: s > 0 ? '1' : '0', background: `linear-gradient(${mix(fill)}, ${mix(fill)}), ${glow}` });
  },
};

export const corePlugin = { id: 'core', items: [flash as ItemType, ...textTypes],
  fonts: ['Noto Sans TC:wght@400;500;700', 'Noto Serif TC:wght@400;500;700'] } satisfies Plugin;   // captions draw at 500
