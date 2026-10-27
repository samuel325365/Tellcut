// common.callout — a mark on something in the picture with a leader line to a label: a hand-drawn ring, a cross, a "no …" sign
// (a phone, or any emoji, in a ring with a slash) or juice bursting out (rays); the mark draws itself, the leader runs out, the label
// pops. The label stays inside the safe area wherever the target is. From the food-deep short's fx.mark.
import { clamp, cssCamel, eBack, eOut3 as eOut, h, prog, textEm, type ItemType } from '@tellcut/engine';

interface P { kind: 'circle' | 'cross' | 'ban' | 'burst'; x: number; y: number; r: number; lx: number; ly: number; text: string; icon: string; tone: 'paper' | 'accent' | 'hl'; color: string; bad: string; paper: string; ink: string; font: string }
interface Shape { e: SVGElement; len?: number; fade?: boolean; from: number; to: number }
interface S { svg: SVGSVGElement; g: SVGGElement; shapes: Shape[]; icon: HTMLElement; lab: HTMLElement; key: string }
const NS = 'http://www.w3.org/2000/svg';
const el = (tag: string, attrs: Record<string, string | number>, parent: Element) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v)); parent.appendChild(e); return e; };

/** where the label goes: given (lx, ly ≥ 0, frame fractions) or beside the target on the roomier side and a little above;
 *  then kept inside the safe area ([left, top] of a label `lw` × `lh` px, and the side its leader comes in from) */
export function calloutLabel(x: number, y: number, lx: number, ly: number, lw: number, lh: number, W: number, H: number, safe: { top: number; bottom: number; side: number }) {
  const ax = (lx >= 0 ? lx : x < 0.5 ? x + 0.24 : x - 0.24) * W, ay = (ly >= 0 ? ly : y - 0.09) * H, left = ax < x * W;
  const L = Math.min(W * (1 - safe.side) - lw, Math.max(W * safe.side, left ? ax - lw : ax));
  const T = Math.min(H * (1 - safe.bottom) - lh, Math.max(H * safe.top, ay - lh / 2));
  return { ax, ay, left: L, top: T, fromLeft: !left };
}

export const callout: ItemType<P, S> = {
  type: 'common.callout', label: '圈選標註', category: 'mark', kind: 'overlay',
  doc: '在畫面裡的東西上做記號再拉一條標註線到標籤：circle 手畫圈、cross 打叉、ban 禁止圖示（圓圈斜線，裡面是電話或任何 emoji）、burst 爆汁放射線；記號先畫出、線拉出去、標籤彈出，標籤自動留在安全區；指出食材、做法、「不接電話訂」這種重點',
  params: [
    { key: 'kind', label: '記號（circle 圈、cross 叉、ban 禁止、burst 放射線）', type: 'enum', options: ['circle', 'cross', 'ban', 'burst'], default: 'circle' },
    { key: 'x', label: '目標 x（畫面寬比例）', type: 'number', min: 0, max: 1, step: 0.005, default: 0.42 },
    { key: 'y', label: '目標 y（畫面高比例）', type: 'number', min: 0, max: 1, step: 0.005, default: 0.45 },
    { key: 'r', label: '半徑（畫面短邊比例）', type: 'number', min: 0.02, max: 0.5, step: 0.005, default: 0.11 },
    { key: 'lx', label: '標籤 x（畫面寬比例；-1＝自動放在比較空的一邊）', type: 'number', min: -1, max: 1, step: 0.005, default: -1 },
    { key: 'ly', label: '標籤 y（畫面高比例；-1＝目標上方一點）', type: 'number', min: -1, max: 1, step: 0.005, default: -1 },
    { key: 'text', label: '標籤字（空＝沒有標籤）', type: 'string', default: '味噌炒醬 ✓' },
    { key: 'icon', label: '禁止圖示裡的東西（phone＝電話聽筒，或任何 emoji）', type: 'string', default: 'phone' },
    { key: 'tone', label: '標籤底色（paper 米白、accent 主色、hl 高亮）', type: 'enum', options: ['paper', 'accent', 'hl'], default: 'paper' },
    { key: 'color', label: '圈與放射線的顏色', type: 'color', default: '#f0b23e', theme: 'palette.hl' },
    { key: 'bad', label: '叉與禁止的顏色', type: 'color', default: '#e0372b', theme: 'palette.accent' },
    { key: 'paper', label: '米白（標籤、聽筒）', type: 'color', default: '#f6ead2', theme: 'palette.paper' },
    { key: 'ink', label: '標籤字色', type: 'color', default: '#1b1410', theme: 'palette.ink' },
    { key: 'font', label: '字型', type: 'string', default: 'Noto Sans TC', theme: 'fonts.display' },
  ],
  build(ctx) {
    // the emoji under the ring's slash, the label on top
    const icon = h('div', null, null, ctx.root), svg = document.createElementNS(NS, 'svg') as SVGSVGElement, g = el('g', {}, svg) as SVGGElement;
    ctx.root.appendChild(svg);
    cssCamel(svg as unknown as HTMLElement, { position: 'absolute', left: '0', top: '0', overflow: 'visible' });
    const lab = h('div', null, null, ctx.root);
    cssCamel(icon, { position: 'absolute', lineHeight: '1', transform: 'translate(-50%, -50%)', fontFamily: "'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif" });
    cssCamel(lab, { position: 'absolute', whiteSpace: 'nowrap', fontWeight: '900', lineHeight: '1.2' });
    return { svg, g, shapes: [], icon, lab, key: '' };
  },
  draw(ctx, s) {
    const p = ctx.params, { W, H, theme, local, dur } = ctx, k = Math.min(W, H) / 1080, X = p.x * W, Y = p.y * H, R = p.r * Math.min(W, H);
    const fs = 40 * k, lw = textEm(p.text) * fs + 40 * k, lh = fs * 1.2 + 16 * k, pos = calloutLabel(p.x, p.y, p.lx, p.ly, lw, lh, W, H, theme.safe);
    const LX = pos.fromLeft ? pos.left : pos.left + lw, LY = pos.top + lh / 2;   // the leader ends on the label's near edge
    const key = JSON.stringify([p.kind, X, Y, R, LX, LY, p.color, p.bad, p.paper, p.icon, W, H]);
    if (key !== s.key) {
      s.key = key; s.g.replaceChildren(); s.shapes = [];
      s.svg.setAttribute('width', String(W)); s.svg.setAttribute('height', String(H)); s.svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      const col = p.kind === 'cross' || p.kind === 'ban' ? p.bad : p.color, add = (sh: Shape) => s.shapes.push(sh);
      if (p.kind === 'circle' || p.kind === 'ban') {
        // a slightly squashed hand-drawn ellipse that overshoots its start
        const pts: string[] = [];
        for (let i = 0; i <= 64; i++) { const a = -1.9 + (i / 64) * Math.PI * 2.15; pts.push(`${(X + Math.cos(a) * R * 1.08).toFixed(1)},${(Y + Math.sin(a) * R * 0.92).toFixed(1)}`); }
        add({ e: el('polyline', { points: pts.join(' '), fill: 'none', stroke: col, 'stroke-width': 8 * k, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, s.g), len: R * 2 * Math.PI * 1.08, from: 0, to: 0.35 });
      }
      if (p.kind === 'ban') {
        if (p.icon === 'phone' || !p.icon) {
          const hr = R * 0.5, hp = el('g', {}, s.g);
          el('path', { d: `M${X - hr},${Y + hr * 0.25} A${hr},${hr} 0 0 1 ${X + hr},${Y + hr * 0.25}`, fill: 'none', stroke: p.paper, 'stroke-width': R * 0.2, 'stroke-linecap': 'round' }, hp);
          for (const d of [-1, 1]) el('rect', { x: X + d * hr - R * 0.17, y: Y + hr * 0.12, width: R * 0.34, height: R * 0.24, rx: R * 0.08, fill: p.paper }, hp);
          add({ e: hp, fade: true, from: 0.1, to: 0.3 });
        }
        add({ e: el('line', { x1: X - R * 0.7, y1: Y - R * 0.7, x2: X + R * 0.7, y2: Y + R * 0.7, stroke: col, 'stroke-width': 10 * k, 'stroke-linecap': 'round' }, s.g), len: R * 2, from: 0.3, to: 0.45 });
      }
      if (p.kind === 'cross') for (const [n, d] of [[0, 1], [1, -1]]) {
        add({ e: el('line', { x1: X - R, y1: Y - R * d, x2: X + R, y2: Y + R * d, stroke: col, 'stroke-width': 12 * k, 'stroke-linecap': 'round' }, s.g), len: R * 2.9, from: n * 0.15, to: n * 0.15 + 0.18 });
      }
      if (p.kind === 'burst') for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + 0.3, r0 = R * 0.75, r1 = R * (1.25 + (i % 2) * 0.3);
        add({ e: el('line', { x1: X + Math.cos(a) * r0, y1: Y + Math.sin(a) * r0, x2: X + Math.cos(a) * r1, y2: Y + Math.sin(a) * r1, stroke: col, 'stroke-width': 9 * k, 'stroke-linecap': 'round' }, s.g), len: R, from: 0.04 * (i % 3), to: 0.04 * (i % 3) + 0.2 });
      }
      if (p.text) {
        const ang = Math.atan2(LY - Y, LX - X), ex = X + Math.cos(ang) * R * 1.05, ey = Y + Math.sin(ang) * R * 0.95;
        add({ e: el('line', { x1: ex, y1: ey, x2: LX, y2: LY, stroke: col, 'stroke-width': 5 * k, 'stroke-linecap': 'round' }, s.g), len: Math.hypot(LX - ex, LY - ey), from: 0.32, to: 0.5 });
        add({ e: el('circle', { cx: LX, cy: LY, r: 9 * k, fill: col }, s.g), fade: true, from: 0.48, to: 0.52 });
      }
      for (const sh of s.shapes) if (sh.len) sh.e.setAttribute('stroke-dasharray', `${sh.len} ${sh.len}`);
    }
    for (const sh of s.shapes) {
      const q = eOut(clamp((local - sh.from) / (sh.to - sh.from)));
      if (sh.len) sh.e.setAttribute('stroke-dashoffset', String(+(sh.len * (1 - q)).toFixed(2)));
      if (sh.fade) sh.e.setAttribute('opacity', String(q));
    }
    const out = 1 - prog(local, dur - 0.18, dur);
    s.g.setAttribute('opacity', String(out));
    // an emoji in the ban ring, under the slash
    const emoji = p.kind === 'ban' && p.icon && p.icon !== 'phone';
    s.icon.textContent = emoji ? p.icon : '';
    cssCamel(s.icon, { display: emoji ? 'block' : 'none', left: `${X}px`, top: `${Y}px`, fontSize: `${R * 1.0}px`, opacity: String(eOut(prog(local, 0.1, 0.3)) * out) });
    const q = eBack(clamp((local - 0.45) / 0.25), 2.2);
    s.lab.textContent = p.text;
    const bg = p.tone === 'accent' ? p.bad : p.tone === 'hl' ? p.color : p.paper;
    cssCamel(s.lab, { display: p.text ? 'block' : 'none', left: `${pos.left}px`, top: `${pos.top}px`, padding: `${8 * k}px ${20 * k}px`, borderRadius: `${12 * k}px`, fontSize: `${fs}px`,
      fontFamily: `'${p.font}', 'Noto Sans TC', sans-serif`, background: bg, color: p.tone === 'accent' ? '#ffffff' : p.ink, boxShadow: `0 ${6 * k}px ${16 * k}px rgba(0,0,0,.45)`,
      transformOrigin: pos.fromLeft ? '0 50%' : '100% 50%', transform: `scale(${Math.max(0, q).toFixed(3)})`, opacity: String(clamp((local - 0.45) / 0.08) * out) });
  },
};
