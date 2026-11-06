// common.badge — a numbered badge (star, burst or circle) with a name plate beside it: "No.1  阿桃的店". Pops in, holds, drops out.
// shape box (the Dopamine Colors pilot film's "No.1" box, 2026-11-06): the number in heavy italic on a flat tilted block of `color`, its
// plate a small block of the same colour.
import { cssCamel, eBack, h, prog, type ItemType } from '@tellcut/engine';
import { polygonSvg, setPolygon, spikePoints } from './shapes.ts';

interface P { label: string; plate: string; shape: 'star' | 'burst' | 'circle' | 'box'; x: number; y: number; size: number; color: string; textColor: string; ink: string; plateColor: string; font: string }
interface S { box: HTMLElement; badge: HTMLElement; svg: SVGSVGElement; poly: SVGPolygonElement; num: HTMLElement; plate: HTMLElement }

/** the badge's centre in px: `y` (a share of the height), or below 0 the badge's top on the top safe margin */
export const badgeCenter = (y: number, r: number, H: number, safeTop: number) => (y >= 0 ? y * H : safeTop * H + r);

export const badge: ItemType<P, S> = {
  type: 'common.badge', label: '編號徽章', category: 'chapter', kind: 'overlay',
  doc: '星形／鋸齒／圓形徽章裡放編號（No.1、02），旁邊可接一塊店名／標題牌；排行、清單、分段介紹（第幾家、第幾招）；shape box 是一塊微斜的方塊（color 底、textColor 字，粗斜體；字型給 Playfair Display 最像雜誌），標題牌也是同色的小方塊（多巴胺配色的清單，配 common.popcard）',
  params: [
    { key: 'label', label: '徽章上的字', type: 'string', default: 'No.1' },
    { key: 'plate', label: '旁邊的標題牌（空＝沒有）', type: 'string', default: '' },
    { key: 'shape', label: '形狀（box 微斜的方塊）', type: 'enum', options: ['star', 'burst', 'circle', 'box'], default: 'star' },
    { key: 'x', label: '徽章中心 x（畫面寬比例；box 是方塊的左緣）', type: 'number', min: 0, max: 1, step: 0.01, default: 0.14 },
    { key: 'y', label: '徽章中心 y（畫面高比例；-1＝徽章上緣貼齊安全區上緣）', type: 'number', min: -1, max: 1, step: 0.01, default: -1 },
    { key: 'size', label: '徽章大小（畫面短邊 %）', type: 'number', min: 4, max: 40, step: 0.5, default: 15 },
    { key: 'color', label: '徽章顏色', type: 'color', default: '#ffe14d', theme: 'palette.hl' },
    { key: 'textColor', label: '徽章字色', type: 'color', default: '#1a1a1a', theme: 'palette.ink' },
    { key: 'ink', label: '外框顏色', type: 'color', default: '#1a1a1a', theme: 'palette.ink' },
    { key: 'plateColor', label: '標題牌底線顏色', type: 'color', default: '#ffe14d', theme: 'palette.hl' },
    { key: 'font', label: '字型', type: 'string', default: 'Noto Sans TC', theme: 'fonts.display' },
  ],
  build(ctx) {
    const box = h('div', null, null, ctx.root), badge = h('div', null, null, box), { svg, poly } = polygonSvg();
    badge.appendChild(svg);
    const num = h('div', null, null, badge), plate = h('div', null, null, box);
    cssCamel(box, { position: 'absolute', display: 'flex', alignItems: 'center', fontWeight: '900', whiteSpace: 'pre' });
    cssCamel(badge, { position: 'relative', flex: 'none' });
    cssCamel(num, { position: 'absolute', inset: '0', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' });
    return { box, badge, svg, poly, num, plate };
  },
  draw(ctx, s) {
    const p = ctx.params, { W, H, theme } = ctx, k = Math.min(W, H) / 1080, size = (p.size / 100) * Math.min(W, H), r = size / 2;
    const pop = eBack(prog(ctx.local, 0, 0.3), 2.2), out = 1 - prog(ctx.local, ctx.dur - 0.25, ctx.dur);
    const stroke = theme.stroke * 0.7 * k;
    const pts = p.shape === 'circle' ? Array.from({ length: 48 }, (_, i) => [+(Math.cos((i / 48) * 6.2832) * (r - stroke)).toFixed(2), +(Math.sin((i / 48) * 6.2832) * (r - stroke)).toFixed(2)] as [number, number])
      : p.shape === 'star' ? spikePoints(5, r - stroke, (r - stroke) * 0.55, 0.06) : spikePoints(14, r - stroke, (r - stroke) * 0.78, 0, 1, 3);
    s.num.textContent = p.label;
    s.plate.textContent = p.plate;
    if (p.shape === 'box') {
      // a flat block sized by its words: the number at 0.42 of the size, the plate at 0.2, both heavy, the number italic
      const fs = size * 0.42, pfs = size * 0.2, top = badgeCenter(p.y, fs * 0.65, H, theme.safe.top) - fs * 0.65;
      cssCamel(s.svg as unknown as HTMLElement, { display: 'none' });
      cssCamel(s.badge, { width: 'auto', height: 'auto', background: p.color, padding: `${0.04 * fs}px ${0.24 * fs}px ${0.08 * fs}px ${0.18 * fs}px`, transform: 'rotate(-3deg)' });
      cssCamel(s.num, { position: 'static', display: 'block', color: p.textColor, fontSize: `${fs}px`, lineHeight: '1.1', fontStyle: 'italic', fontFamily: `'${p.font}', 'Noto Sans TC', sans-serif`, transform: 'none' });
      cssCamel(s.plate, { display: p.plate ? 'block' : 'none', marginLeft: `${size * 0.16}px`, alignSelf: 'flex-start', marginTop: `${fs * 0.1}px`, fontSize: `${pfs}px`, lineHeight: '1.2',
        fontFamily: `'Noto Serif TC', '${p.font}', serif`, color: p.textColor, background: p.color, padding: `${0.1 * pfs}px ${0.4 * pfs}px`, fontStyle: 'normal',
        transform: `translateX(${-(1 - prog(ctx.local, 0.1, 0.4)) * size * 0.4}px) rotate(2deg)`, opacity: String(prog(ctx.local, 0.1, 0.3)) });
      cssCamel(s.box, { left: `${p.x * W}px`, top: `${top}px`, opacity: String(out), transform: `scale(${pop})`, transformOrigin: '0% 50%', alignItems: 'flex-start' });
      return;
    }
    cssCamel(s.svg as unknown as HTMLElement, { display: 'block' });
    setPolygon(s.svg, s.poly, size, pts, p.color, p.ink, stroke);
    cssCamel(s.badge, { width: `${size}px`, height: `${size}px`, background: 'none', padding: '0', transform: 'none' });
    cssCamel(s.num, { position: 'absolute', display: 'flex', lineHeight: '', fontStyle: 'normal', color: p.textColor, fontSize: `${size * Math.min(0.3, 0.5 / (0.6 * Math.max(1, [...p.label].length)))}px`, fontFamily: `'${p.font}', 'Noto Sans TC', sans-serif`, transform: 'rotate(-8deg)' });
    cssCamel(s.plate, {
      display: p.plate ? 'block' : 'none', alignSelf: 'auto', marginTop: '0', lineHeight: '', fontStyle: 'normal', marginLeft: `${size * 0.12}px`, fontSize: `${size * 0.42}px`, fontFamily: `'${p.font}', 'Noto Sans TC', sans-serif`, color: p.ink,
      background: `linear-gradient(transparent 62%, ${p.plateColor} 62%)`, padding: '0 0.15em',
      transform: `translateX(${-(1 - prog(ctx.local, 0.1, 0.4)) * size * 0.4}px)`, opacity: String(prog(ctx.local, 0.1, 0.3)),
    });
    cssCamel(s.box, { left: `${p.x * W - r}px`, top: `${badgeCenter(p.y, r, H, theme.safe.top) - r}px`, opacity: String(out), transform: `scale(${pop})`, transformOrigin: `${r}px ${r}px`, alignItems: 'center' });
  },
};
