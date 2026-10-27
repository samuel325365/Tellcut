// common.censor — a sticker over the mouth (or any spot) for the word that gets bleeped; pair it with the common.beep sound.
import { cssCamel, eBack, h, prog, type ItemType } from '@tellcut/engine';

interface P { label: string; size: number; y: number; angle: number; color: string; textColor: string; outline: string; font: string }
interface S { box: HTMLElement; label: HTMLElement }

export const censor: ItemType<P, S> = {
  type: 'common.censor', label: '消音貼紙', category: 'mark', kind: 'overlay',
  doc: '蓋在嘴上的消音貼紙（彈入後左右晃動）；說到不能說的字時用，配 common.beep 嗶聲；位置用項目的 transform 移動',
  params: [
    { key: 'label', label: '貼紙上的字', type: 'string', default: '消音' },
    { key: 'size', label: '寬度（畫面短邊 %）', type: 'number', min: 5, max: 80, step: 1, default: 26 },
    { key: 'y', label: '垂直位置（畫面高比例）', type: 'number', min: 0, max: 1, step: 0.01, default: 0.55 },
    { key: 'angle', label: '基本傾斜（度）', type: 'number', min: -30, max: 30, step: 0.5, default: -6 },
    { key: 'color', label: '貼紙顏色', type: 'color', default: '#ff4d4f', theme: 'palette.accent' },
    { key: 'textColor', label: '字色', type: 'color', default: '#fff8ec', theme: 'palette.paper' },
    { key: 'outline', label: '外框顏色', type: 'color', default: '#1a1a1a', theme: 'palette.ink' },
    { key: 'font', label: '字型', type: 'string', default: 'Noto Sans TC', theme: 'fonts.display' },
  ],
  build(ctx) {
    const box = h('div', null, null, ctx.root), label = h('div', null, null, box);
    cssCamel(box, { position: 'absolute', left: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box', fontWeight: '900', whiteSpace: 'pre' });
    return { box, label };
  },
  draw(ctx, s) {
    const p = ctx.params, { W, H, theme } = ctx, k = Math.min(W, H) / 1080, w = (p.size / 100) * Math.min(W, H);
    const pop = eBack(prog(ctx.local, 0, 0.2), 2.4), wobble = 3 * Math.sin(ctx.local * 18) * prog(ctx.local, 0.2, 0.5);
    s.label.textContent = p.label;
    cssCamel(s.box, {
      top: `${p.y * H}px`, width: `${w}px`, height: `${w * 0.42}px`, background: p.color, color: p.textColor,
      border: `${theme.stroke * k}px solid ${p.outline}`, borderRadius: `${theme.radius * k}px`,
      fontFamily: `'${p.font}', 'Noto Sans TC', sans-serif`, fontSize: `${w * 0.22}px`,
      opacity: String(Math.min(1, prog(ctx.local, 0, 0.08) * 6)), transform: `translate(-50%, -50%) rotate(${p.angle + wobble}deg) scale(${pop})`,
    });
  },
};
