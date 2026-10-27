// common.outro — an end card that sends viewers on: a paper page, a few big lines stamped down one per beat (【word】 on an
// accent chip), a row of numbered dots (the last ones still ?), and a hand-drawn arrow drawn to the link that bounces on
// the beat. Promoted from the zhongli-food short's fx.outro; for any short that points to the full video, a profile or a link.
import { clamp, cssCamel, eBack, eOut3 as eOut, h, prog, type ItemType } from '@tellcut/engine';
import { canvasAt, penPath, freeCanvas } from './inkline.ts';
import { emParts, fitPx, nl } from './text.ts';
import { withAlpha } from './color.ts';

interface P {
  lines: string; cta: string; tipX: number; tipY: number; dots: number; hidden: number; beat: number; x: number; cover: number;
  font: string; lineFont: string; paper: string; ink: string; accent: string; hl: string;
}
interface S { bg: HTMLElement; cv: HTMLCanvasElement; lines: HTMLElement[]; dots: HTMLElement[]; cta: HTMLElement; key: string }

const EMOJI = "'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji'";
const LINE = 221;   // one line's height in u (the original's 11.5 % of a 9:16 frame)

/** the lines of the text ("\n" or a typed "\\n" breaks a line), blank ones dropped */
export const outroLines = (text: string) => nl(text).split('\n').map((l) => l.trim()).filter(Boolean);

/** where the parts go: u (one pixel of the 1080-wide original, shrunk so the stack fits the safe area), the first line's top, the dots' centre */
export function outroLayout(lines: number, W: number, H: number, safe: { top: number; bottom: number }) {
  const u0 = Math.min(W, H) / 1080, room = 0.75 * H * (1 - safe.top - safe.bottom);
  const u = u0 * Math.min(1, room / ((Math.max(1, lines) * LINE + 200) * u0));
  const top = safe.top * H + 67 * u;
  return { u, top, dotsY: top + lines * LINE * u + 9 * u };
}

export const outro: ItemType<P, S> = {
  type: 'common.outro', label: '片尾導流', category: 'moment', kind: 'overlay',
  doc: '片尾導流卡：紙色底，幾行大字跟著拍子一行一行蓋下來（【詞】放進主色小牌），下面一排編號圓點（最後幾個打問號），手繪箭頭畫向連結並隨拍點彈跳；導去原片、主頁、留言、下一集',
  params: [
    { key: 'lines', label: '大字（每行一句，【詞】強調）', type: 'text', default: '完整路線\n和【6 家店名】\n都在原片' },
    { key: 'cta', label: '箭頭旁小字', type: 'string', default: '點這裡看完整版' },
    { key: 'tipX', label: '箭頭尖 x（畫面寬比例）', type: 'number', min: 0, max: 1, step: 0.005, default: 0.2 },
    { key: 'tipY', label: '箭頭尖 y（畫面高比例）', type: 'number', min: 0, max: 1, step: 0.005, default: 0.8 },
    { key: 'dots', label: '編號圓點數（0＝不顯示）', type: 'number', min: 0, max: 9, step: 1, default: 6 },
    { key: 'hidden', label: '最後幾個圓點打問號', type: 'number', min: 0, max: 9, step: 1, default: 2 },
    { key: 'beat', label: '一拍（秒；大字一拍一行，箭頭跟著彈）', type: 'number', min: 0.1, max: 2, step: 0.01, default: 0.56 },
    { key: 'x', label: '文字中心 x（畫面寬比例）', type: 'number', min: 0, max: 1, step: 0.005, default: 0.46 },
    { key: 'cover', label: '紙色底的不透明度（0＝透出影片）', type: 'number', min: 0, max: 1, step: 0.05, default: 1 },
    { key: 'font', label: '小字字型', type: 'string', default: 'Noto Sans TC', theme: 'fonts.display' },
    { key: 'lineFont', label: '大字字型', type: 'string', default: 'Noto Serif TC' },
    { key: 'paper', label: '紙色', type: 'color', default: '#f4ebdd', theme: 'palette.paper' },
    { key: 'ink', label: '墨色', type: 'color', default: '#1e1712', theme: 'palette.ink' },
    { key: 'accent', label: '主色（箭頭、小牌、圓點）', type: 'color', default: '#d9442b', theme: 'palette.accent' },
    { key: 'hl', label: '問號顏色', type: 'color', default: '#f0b429', theme: 'palette.hl' },
  ],
  build(ctx) {
    const bg = h('div', null, null, ctx.root), cv = h('canvas', null, null, ctx.root), cta = h('div', null, null, ctx.root);
    cssCamel(bg, { position: 'absolute', inset: '0' });
    cssCamel(cv, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%' });
    cssCamel(cta, { position: 'absolute', whiteSpace: 'pre', lineHeight: '1', transformOrigin: '0 50%', fontWeight: '900' });
    return { bg, cv, lines: [], dots: [], cta, key: '' };
  },
  hide(s) { freeCanvas(s.cv); },
  draw(ctx, s) {
    const p = ctx.params, { W, H, theme, local } = ctx, texts = outroLines(p.lines), nd = Math.max(0, Math.min(9, Math.round(p.dots)));
    const L = outroLayout(texts.length, W, H, theme.safe), u = L.u, cx = p.x * W, S = Math.min(W, H);
    const key = JSON.stringify([texts, nd, p.accent, p.paper]);
    if (s.key !== key) {   // the lines and dot labels are rebuilt only when they change
      s.key = key;
      for (const el of [...s.lines, ...s.dots]) el.remove();
      s.lines = texts.map((t) => {
        const d = h('div', null, null, ctx.root);
        cssCamel(d, { position: 'absolute', whiteSpace: 'pre', lineHeight: '1.3', fontWeight: '900', transform: 'translateX(-50%)' });
        for (const [piece, em] of emParts(t)) {
          const sp = h('span', null, null, d); sp.textContent = piece;
          if (em) cssCamel(sp, { color: p.paper, background: p.accent, padding: '0 0.14em', borderRadius: '0.09em', boxDecorationBreak: 'clone' });
        }
        return d;
      });
      s.dots = Array.from({ length: nd }, () => { const e = h('div', null, null, ctx.root); cssCamel(e, { position: 'absolute', whiteSpace: 'pre', lineHeight: '1', fontWeight: '900', transform: 'translate(-50%, -50%)' }); return e; });
      ctx.root.appendChild(s.cta);
    }
    cssCamel(s.bg, { background: p.paper, opacity: String(prog(local, 0, 0.2) * clamp(p.cover)),
      backgroundImage: `radial-gradient(${withAlpha(p.ink, 0.08)} ${2.2 * u}px, transparent ${2.6 * u}px)`, backgroundSize: `${34 * u}px ${34 * u}px` });
    // the lines land one a beat: big and tilted first, then settled
    const room = W * (1 - 2 * theme.safe.side);
    s.lines.forEach((d, i) => {
      const q = prog(local, 0.15 + i * p.beat, 0.15 + i * p.beat + 0.22), plain = texts[i].replace(/[【】]/g, ''), big = texts[i].includes('【');
      cssCamel(d, { left: `${cx}px`, top: `${L.top + i * LINE * u}px`, color: p.ink, fontFamily: `'${p.lineFont}', 'Noto Serif TC', serif`,
        fontSize: `${fitPx(plain, (big ? 142 : 128) * u, room)}px`, opacity: String(clamp(q * 4)),
        transform: `translateX(-50%) scale(${1 + (1 - eOut(q)) * 0.9}) rotate(${(1 - eOut(q)) * (i % 2 ? 4 : -4)}deg)` });
    });
    const g = canvasAt(s.cv, W, H);
    // the numbered dots join in after the lines, a dashed line between them
    const d0 = 0.15 + texts.length * p.beat, gap = 124 * u;
    for (let i = 0; i < nd; i++) {
      const q = prog(local, d0 + i * 0.09, d0 + i * 0.09 + 0.25), x = cx + (i - (nd - 1) / 2) * gap, y = L.dotsY, hid = i >= nd - p.hidden, el = s.dots[i];
      el.textContent = hid ? '?' : String(i + 1);
      cssCamel(el, { display: q > 0 ? 'block' : 'none', left: `${x}px`, top: `${y + 2 * u}px`, fontFamily: `'${p.font}', 'Noto Sans TC', sans-serif`, fontSize: `${42 * u}px`,
        color: hid ? p.hl : '#ffffff', transform: `translate(-50%, -50%) scale(${Math.max(0.01, eBack(q, 1.9))})` });
      if (q <= 0) continue;
      if (i > 0) { g.strokeStyle = withAlpha(p.ink, 0.35); g.lineWidth = 5 * u; g.setLineDash([10 * u, 10 * u]); g.beginPath(); g.moveTo(x - gap + 40 * u, y); g.lineTo(x - 40 * u, y); g.stroke(); g.setLineDash([]); }
      g.fillStyle = hid ? p.ink : p.accent; g.beginPath(); g.arc(x, y, 38 * u * eBack(q, 1.9), 0, Math.PI * 2); g.fill();
    }
    // the arrow: from beside the call to action down to the link, then a little hop on every beat
    const ta = d0 + (nd ? p.beat : 0), pa = eOut(prog(local, ta, ta + 0.5)), ctaY = L.dotsY + (nd ? 134 : 60) * u;
    if (pa > 0) {
      const phase = ((local - ta) / p.beat) % 1, hop = local > ta + 0.5 ? Math.max(0, 1 - phase * 3) : 0;
      const tx = p.tipX * W - hop * 10 * u, ty = p.tipY * H + hop * 24 * u, sx = cx + 0.26 * S, sy = ctaY;
      const kx = sx + (tx - sx) * 0.19, ky = sy + (ty - sy) * 0.78, pts: Array<[number, number]> = [];
      for (let i = 0; i <= 40; i++) { const t = i / 40; pts.push([(1 - t) ** 2 * sx + 2 * (1 - t) * t * kx + t * t * tx, (1 - t) ** 2 * sy + 2 * (1 - t) * t * ky + t * t * ty]); }
      penPath(g, pts, 16 * u, p.accent, 9, pa);
      if (pa > 0.96) {
        const [px, py] = pts[37], ang = Math.atan2(ty - py, tx - px), A = 70 * u;
        penPath(g, [[tx - Math.cos(ang - 0.5) * A, ty - Math.sin(ang - 0.5) * A], [tx, ty], [tx - Math.cos(ang + 0.5) * A, ty - Math.sin(ang + 0.5) * A]], 16 * u, p.accent, 17);
      }
    }
    const pc = prog(local, ta + 0.35, ta + 0.6);
    s.cta.textContent = p.cta;
    cssCamel(s.cta, { display: p.cta ? 'block' : 'none', left: `${Math.max(theme.safe.side * W * 0.5, cx - 0.36 * S)}px`, top: `${ctaY + 20 * u}px`, color: p.accent,
      fontFamily: `'${p.font}', 'Noto Sans TC', ${EMOJI}, sans-serif`, fontSize: `${fitPx(p.cta, 54 * u, 0.6 * S)}px`, opacity: String(pc),
      transform: `rotate(-4deg) translateX(${(1 - eOut(pc)) * 40 * u}px)` });
  },
};
