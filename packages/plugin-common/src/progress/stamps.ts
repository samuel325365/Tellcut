// common.progress stamps (spec 2026-11-22, progress more modes): a small loyalty card in a corner of the safe area (`align` left,
// else right — center counts as right; up and down by `position` / `y`), tilted 2 degrees, in `paper` with rounded corners and a
// soft shadow. On it `dots` cells, dashed `ink` circles: one row up to six, else two (the upper holding the larger half). Cell i is
// stamped once the progress reaches (i + 1) / dots — from 1.5 times its size down to 1 and fading in over 0.2 s, each stamp turned
// and set a little off centre by its number; the newest is solid, the older ones settle at 0.9 (an emoji or picture at 0.75; any
// lighter and the drawn red read pink on the cream). The default stamp is drawn (an
// inline SVG: a double ring round a star in `color`, roughened and speckled by an SVG filter seeded by its number, so it reads as
// inked on and stays the same every frame); `runner` stamps an emoji (never recoloured or mirrored) or a picture of the project's
// instead, placed the same way, and a picture that fails gives the drawn stamp back. Only the drawn stamp is multiplied into the
// paper like ink; an emoji multiplied came out dark. When full the stamps all turn the `done`
// colour, solid again, the drawn ones ringed in `ink` (the default yellow is lost on the cream paper without it), and the card
// jumps once into the frame (up from the bottom, down from the top) within 0.4 s. The box the card keeps in the
// corner holds its tilted corners and that jump, so all of it stays in the safe area. A cell is `size` (frame-height %) across;
// the card is never wider than 45% of the safe area (the cells shrink), so it stays a corner piece clear of the captions. All DOM.
import { abs, clamp, cssCamel, eOut3 } from '@tellcut/engine';
import { shade, withAlpha } from '../color.ts';
import { piece, showPiece } from './runner.ts';
import { arrived, corner, landscape, sinceAt, travel, type Draw } from './shared.ts';

/** seconds a stamp takes to land; the card's jump when full: from LAND to LAND + JUMP_S seconds after arriving, JUMP cells high */
const LAND = 0.2, JUMP_S = 0.4, JUMP = 0.4;
/** the card's padding and the gaps between its cells, in cells; its tilt (degrees); its widest, as a share of the safe width */
const PAD = 0.35, GAP = 0.25, TILT = -2, MAX_W = 0.45;
/** a stamp's size over its cell's (a little over: it covers the dashed circle); how far off centre it may land, in cells */
const STAMP = 1.06, JITTER = 0.035;

/** how `n` cells split into rows: one row up to 6, else two with the upper holding the larger half */
export const stampRows = (n: number): [number, number] => {
  const m = Number.isFinite(n) ? Math.max(1, Math.round(n)) : 1;
  return m <= 6 ? [m, 0] : [Math.ceil(m / 2), Math.floor(m / 2)];
};

/** the card for `n` cells `cell` px across, no wider than `maxW`: the cell actually used (shrunk to fit), the card's width and height
 *  (padding 0.35 of a cell, gaps 0.25) and each cell's centre relative to the card's top-left */
export function stampCard(n: number, cell: number, maxW: number): { cell: number; w: number; h: number; centres: Array<{ x: number; y: number }> } {
  const [a, b] = stampRows(n), rows = b ? 2 : 1, across = a + (a - 1) * GAP + 2 * PAD, down = rows + (rows - 1) * GAP + 2 * PAD;
  const c0 = Number.isFinite(cell) && cell > 0 ? cell : 0, c = Number.isNaN(maxW) ? c0 : Math.min(c0, Math.max(0, maxW) / across);
  const w = across * c, centres: Array<{ x: number; y: number }> = [];
  for (let r = 0; r < rows; r++) {
    const k = r ? b : a, x0 = (w - (k + (k - 1) * GAP) * c) / 2 + c / 2;
    for (let j = 0; j < k; j++) centres.push({ x: x0 + j * (1 + GAP) * c, y: PAD * c + c / 2 + r * (1 + GAP) * c });
  }
  return { cell: c, w, h: down * c, centres };
}

/** for each of `n` cells at progress p: how far its stamp is in (0 not yet, 1 landed; 0.2 s to land), whether it is the newest.
 *  Cell i stamps at p ≥ (i + 1) / n; `sinceEach(i)` is the seconds since then (NaN counts as long since). */
export function stampStates(n: number, p: number, sinceEach: (i: number) => number): Array<{ in: number; newest: boolean }> {
  const m = Math.max(0, Math.round(Number.isFinite(n) ? n : 0)), down = Array.from({ length: m }, (_, i) => p >= (i + 1) / m - 1e-9), last = down.lastIndexOf(true);
  return down.map((d, i) => {
    const since = d ? sinceEach(i) : 0;
    return { in: d ? (Number.isNaN(since) ? 1 : clamp(since / LAND)) : 0, newest: i === last };
  });
}

/** stamp i's turn (degrees, −12…12) and its offset off the cell's centre (in cells), fixed by i */
const pose = (i: number) => ({ tilt: 12 * Math.sin(i * 2.4 + 1), dx: JITTER * Math.sin(i * 3.7 + 0.5), dy: JITTER * Math.cos(i * 5.3 + 2) });

/** the five-pointed star in the stamp's middle (viewBox units, centred on 0, 0) */
const STAR = Array.from({ length: 10 }, (_, j) => {
  const r = j % 2 ? 10.5 : 25, a = -Math.PI / 2 + (j * Math.PI) / 5;
  return `${(r * Math.cos(a)).toFixed(2)},${(r * Math.sin(a)).toFixed(2)}`;
}).join(' ');

/** the drawn stamp's shapes (viewBox units): a thick ring, a thin one inside it, a star; `e` > 0 is the rim under the face, every
 *  line that much wider each side, without the thin ring (outlined, it read as a muddle of grey lines) */
const shapes = (e: number) => `<circle r="43" stroke-width="${7 + 2 * e}"/>${e ? '' : '<circle r="34.5" stroke-width="2.2"/>'}`
  + `<polygon points="${STAR}" fill="currentColor" stroke-width="${2.5 + 2 * e}" stroke-linejoin="round"/>`;
/** how much wider the rim is than the face, each side (viewBox units) */
const RIM = 1.3;

/** the drawn stamp: the face in currentColor over a rim (the same shapes a little wider, hidden until the mode shows it in `ink`:
 *  a light `done` colour such as the default yellow is lost on cream paper without it). One filter for both roughens the edges a
 *  little (a slow noise pushing them about) and knocks small specks out of the ink (a fine noise as a mask) — seeded by the stamp's
 *  number, so each is uneven in its own way and the same every frame, and the rim's specks fall where the face's do */
function inked(id: string, seed: number): string {
  return `<svg viewBox="-50 -50 100 100" width="100%" height="100%" style="display:block;overflow:visible">`
    + `<filter id="${id}" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB">`
    + `<feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="2" seed="${seed}" result="w"/>`
    + `<feDisplacementMap in="SourceGraphic" in2="w" scale="5" xChannelSelector="R" yChannelSelector="G" result="d"/>`
    + `<feTurbulence type="fractalNoise" baseFrequency="0.32" numOctaves="2" seed="${seed + 17}" result="g"/>`
    + `<feColorMatrix in="g" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -10 7.6" result="m"/>`
    + `<feComposite in="d" in2="m" operator="in"/></filter>`
    + `<g filter="url(#${id})" fill="none" stroke="currentColor" style="color:#000;opacity:0">${shapes(RIM)}</g>`
    + `<g filter="url(#${id})" fill="none" stroke="currentColor">${shapes(0)}</g></svg>`;
}

export const drawStamps: Draw = (ctx, p, m) => {
  const { W, H, local, dur, theme } = ctx, k = Math.min(W, H) / 1080, n = Math.max(1, Math.round(p.dots)), stamp = String(p.runner ?? '').trim();
  if (!m.el.card) {
    const card = (m.el.card = abs(m.root, { boxSizing: 'border-box', transformOrigin: '50% 50%' }));
    m.el.rule = abs(card, { boxSizing: 'border-box', borderStyle: 'solid' });
    for (let i = 0; i < n; i++) m.el[`cell${i}`] = abs(card, { boxSizing: 'border-box', borderStyle: 'dashed', borderRadius: '50%' });
    // the filters' ids from the item's: the same every time the item is built (a counter gave other DOM ids after reopening)
    const id = `tc-stamp-${String(ctx.item?.id ?? 'x').replace(/[^\w-]/g, '_')}`;
    for (let i = 0; i < n; i++) {
      let box: HTMLElement;
      if (stamp) {
        piece(m, `stamp${i}`, stamp, '', (f) => ctx.media.fileUrl(f));
        box = m.el[`stamp${i}`];
        card.appendChild(box);
        if (m.el[`stamp${i}Img`]) cssCamel(m.el[`stamp${i}Img`], { objectPosition: '50% 50%' });
      } else box = m.el[`stamp${i}`] = abs(card);
      cssCamel(box, { transformOrigin: '50% 50%' });
      const ink = (m.el[`ink${i}`] = abs(box, { left: '0', top: '0', width: '100%', height: '100%' }));
      ink.innerHTML = inked(`${id}-${i}`, i + 1);
      m.el[`rim${i}`] = ink.querySelector('g') as unknown as HTMLElement;
      m.list.push(box);
    }
  }
  // the card: a cell `size` % of the frame height, shrunk until the card's tilted outline is no wider than 45% of the safe area
  // and, with the room for its jump, no taller than it
  const safeW = W * (1 - 2 * theme.safe.side), safeH = H * (1 - theme.safe.top - theme.safe.bottom), maxW = MAX_W * safeW;
  const a = (Math.abs(TILT) * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
  const outline = (c: { w: number; h: number; cell: number }) => ({ bw: c.w * cos + c.h * sin, bh: c.w * sin + c.h * cos, jump: JUMP * c.cell });
  // (a cell is `size` of the frame height, times landscape(): on 16:9 as big as on 9:16)
  let card = stampCard(n, (Math.max(0.1, p.size) / 100) * H * landscape(W, H), maxW), o = outline(card);
  const fit = Math.min(o.bw > 0 ? maxW / o.bw : 1, o.bh + o.jump > 0 ? safeH / (o.bh + o.jump) : 1);
  if (fit < 1) { card = stampCard(n, card.cell * fit * (1 - 1e-9), Infinity); o = outline(card); }
  const c = card.cell, at = corner(ctx, p, o.bw, o.bh + o.jump), up = p.y >= 0 ? p.y >= 0.5 : p.position === 'bottom';
  const cx = at.left + o.bw / 2, cy = at.top + (up ? o.jump : 0) + o.bh / 2;
  // full: the stamps turn the done colour once the last has landed, and the card jumps into the frame
  const since = arrived(p.step, p.dots, local, dur), full = since >= LAND;
  const lift = full && since < LAND + JUMP_S ? o.jump * Math.sin((Math.PI * (since - LAND)) / JUMP_S) : 0, ty = Math.abs(lift) < 0.005 ? 0 : up ? -lift : lift;
  cssCamel(m.el.card, { left: `${(cx - card.w / 2).toFixed(2)}px`, top: `${(cy - card.h / 2).toFixed(2)}px`, width: `${card.w.toFixed(2)}px`, height: `${card.h.toFixed(2)}px`,
    borderRadius: `${(0.22 * c).toFixed(2)}px`, background: p.paper, transform: `translateY(${ty.toFixed(2)}px) rotate(${TILT}deg)`,
    boxShadow: `0 ${(3 * k).toFixed(2)}px ${(10 * k).toFixed(2)}px rgba(0,0,0,0.35), 0 ${(1 * k).toFixed(2)}px ${(2 * k).toFixed(2)}px rgba(0,0,0,0.2)` });
  // a thin rule round the card's inside, like a printed card's border
  const ri = 0.12 * c;
  cssCamel(m.el.rule, { left: `${ri.toFixed(2)}px`, top: `${ri.toFixed(2)}px`, width: `${Math.max(0, card.w - 2 * ri).toFixed(2)}px`, height: `${Math.max(0, card.h - 2 * ri).toFixed(2)}px`,
    borderWidth: `${Math.max(1, 0.03 * c).toFixed(2)}px`, borderColor: withAlpha(p.ink, 0.18), borderRadius: `${(0.14 * c).toFixed(2)}px` });
  const dash = withAlpha(p.ink, 0.35), bwid = `${Math.max(1, 0.045 * c).toFixed(2)}px`;
  const st = stampStates(n, travel(p.step, p.dots, local, dur), (i) => sinceAt(p.step, p.dots, (i + 1) / n, local, dur));
  // (the printed circle goes under its stamp as the stamp lands: through the ink's specks it looked smudged)
  card.centres.forEach((q, i) => cssCamel(m.el[`cell${i}`], { opacity: (1 - st[i].in).toFixed(3), left: `${(q.x - c / 2).toFixed(2)}px`, top: `${(q.y - c / 2).toFixed(2)}px`, width: `${c.toFixed(2)}px`, height: `${c.toFixed(2)}px`,
    borderWidth: bwid, borderColor: dash }));
  // (the drawn stamp inks a shade deeper than the colour: multiplied into the cream and speckled, the default red read pink; the
  // `done` colour of a full card keeps its own light shade, ringed in ink instead — deepened, the yellow turned olive)
  const d = STAMP * c, colour = full ? p.done : p.color, deep = full ? colour : shade(colour, 0.86);
  m.list.forEach((box, i) => {
    // every stamp styled every frame, down or not, so one time drawn twice is the same DOM whatever came between
    const s = st[i], q = card.centres[i], { tilt, dx, dy } = pose(i), next = st[i + 1];
    // the drawn stamp, unless an emoji or a picture stamps instead (a picture that failed gives it back)
    const drawn = stamp ? showPiece(m, `stamp${i}`).failed : true, rest = drawn ? 0.9 : 0.75;
    // (once full they are all solid again: a light done colour at 0.75 faded into the paper)
    const alpha = !s.in ? 0 : s.newest ? s.in : full ? 1 : rest + (1 - rest) * (1 - (next?.in ?? 1)), sc = 1.5 - 0.5 * eOut3(s.in);
    cssCamel(box, { display: s.in ? 'block' : 'none', left: `${(q.x + dx * c - d / 2).toFixed(2)}px`, top: `${(q.y + dy * c - d / 2).toFixed(2)}px`, width: `${d.toFixed(2)}px`, height: `${d.toFixed(2)}px`,
      opacity: alpha.toFixed(3), color: colour, mixBlendMode: drawn ? 'multiply' : 'normal', transform: `rotate(${tilt.toFixed(2)}deg) scale(${sc.toFixed(4)})` });
    cssCamel(m.el[`ink${i}`], { display: drawn ? 'block' : 'none', color: deep });
    // full: an ink rim round the done colour, which may be as light as the paper
    cssCamel(m.el[`rim${i}`], { color: p.ink, opacity: full ? '0.7' : '0' });
    const text = m.el[`stamp${i}Text`];
    if (text) cssCamel(text, { top: '50%', bottom: 'auto', left: '-50%', width: '200%', textAlign: 'center', fontSize: `${(d * 0.8).toFixed(2)}px`, marginTop: `${(-d * 0.4).toFixed(2)}px` });
  });
};
