import type { ItemType, Plugin } from './plugin.ts';
import { clamp, cssCamel, eIO3, h, lerp, prog } from './util.ts';
import { textTypes } from './text.ts';

interface FlashP { peak: number; rise: number; hold: number; fall: number; power: number; color: string; mode: 'flat' | 'bloom'; x: number; y: number; keys: string; blend: string }

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

/** Full-frame colour flash: ramps up over `rise`, holds, then decays over `fall` (shape^power × peak), or follows `keys`.
 *  mode bloom (uk-transit's light at the end of the tunnel): a glow spreading from (x, y) that grows with the same curve and,
 *  past 60 % of it, fills the whole frame. `blend` sets the layer's mix-blend-mode (screen: light, multiply: shade). */
const flash: ItemType<FlashP, HTMLElement> = {
  type: 'core.flash', label: '閃白', kind: 'overlay',
  doc: '整個畫面閃一下顏色（預設白）；重拍、轉場、拍照快門；keys「秒:不透明度」照關鍵影格變（淡入黑、淡出白、閃兩下）；mode bloom 是從一點（x, y）擴散的光暈，越來越大最後蓋滿（隧道盡頭的光、回憶、結尾）；blend 換混合方式（screen 只變亮）',
  params: [
    { key: 'peak', label: '最大不透明度', type: 'number', min: 0, max: 1, step: 0.05, default: 0.85 },
    { key: 'rise', label: '上升 (s)', type: 'number', min: 0, step: 0.05, default: 0 },
    { key: 'hold', label: '停留 (s)', type: 'number', min: 0, step: 0.05, default: 0 },
    { key: 'fall', label: '衰減 (s)', type: 'number', min: 0, step: 0.05, default: 0.3 },
    { key: 'power', label: '曲線次方', type: 'number', min: 1, max: 4, step: 1, default: 1 },
    { key: 'color', label: '顏色', type: 'color', default: '#fff' },
    { key: 'keys', label: '不透明度關鍵影格（「秒:不透明度」逗號分開，相對項目開始；給了就取代最大不透明度、上升、停留、衰減）', type: 'string', default: '' },
    { key: 'mode', label: '樣式（flat 整片一個顏色、bloom 從一點擴散的光暈）', type: 'enum', options: ['flat', 'bloom'], default: 'flat' },
    { key: 'x', label: '光暈中心 x（畫面寬比例；bloom）', type: 'number', min: 0, max: 1, step: 0.01, default: 0.5 },
    { key: 'y', label: '光暈中心 y（畫面高比例；bloom）', type: 'number', min: 0, max: 1, step: 0.01, default: 0.5 },
    { key: 'blend', label: '混合方式（normal 蓋上去、screen 只變亮、multiply 只變暗、overlay 疊加）', type: 'enum', options: ['normal', 'screen', 'multiply', 'overlay', 'soft-light'], default: 'normal' },
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
    if (keys.length) { top = clamp(Math.max(...keys.map((k) => k[1]))); s = top > 0 ? clamp(flashAt(keys, l)) / top : 0; }
    else { const shape = rise > 0 && l < rise ? prog(l, 0, rise) : l < rise + hold ? 1 : 1 - prog(l, rise + hold, rise + hold + fall); s = Math.pow(shape, power); top = peak; }
    if (ctx.params.mode !== 'bloom') { cssCamel(el, { opacity: String(top * s) }); return; }
    // bloom: the glow's middle and its radius grow with the curve; past 60 % a flat layer fills the frame
    const mix = (a: number) => `color-mix(in srgb, ${color} ${(clamp(a) * 100).toFixed(2)}%, transparent)`;
    const R = lerp(0.12, 1.6, s) * Math.max(ctx.W, ctx.H), fill = s > 0.6 ? ((s - 0.6) / 0.4) * top : 0, a = top * clamp(s / 0.15);
    const glow = `radial-gradient(circle ${R.toFixed(1)}px at ${(ctx.params.x * 100).toFixed(2)}% ${(ctx.params.y * 100).toFixed(2)}%, ${mix(lerp(0.5, 1, s) * a)} 0%, ${mix(lerp(0.25, 1, s) * a)} ${(lerp(0.35, 0.85, s) * 100).toFixed(1)}%, ${mix(0)} 100%)`;
    cssCamel(el, { opacity: s > 0 ? '1' : '0', background: `linear-gradient(${mix(fill)}, ${mix(fill)}), ${glow}` });
  },
};

export const corePlugin = { id: 'core', items: [flash as ItemType, ...textTypes],
  fonts: ['Noto Sans TC:wght@400;500;700', 'Noto Serif TC:wght@400;500;700'] } satisfies Plugin;   // captions draw at 500
