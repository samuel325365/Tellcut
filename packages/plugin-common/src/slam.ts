// common.slam — one big phrase that lands with a pop and a short shake; for the line that carries the video.
// From the baking-sin short: lines can land one after another (stagger, the highlighted one bigger), a small line above and one
// below (結論：/ 值得。/（明天再減肥）), a "press" landing (big and settling, like ink spreading) and an offset shadow.
// From the uk-beat short's fx.word: an accent bar wiped open under the words, and a slow drift (zoom) once they have landed.
// From the food-deep short: look 'led' (fx.slam: red glowing words on a black LED board with a dot grid), enter 'chars' (fx.title: the
// characters pop up one by one), a kicker on a coloured chip sliding in from the left, and a dark shade behind the words.
// From the katie-sweet16 short's fx.wish: look 'gold' (big italic Playfair words filled with a champagne-gold gradient, a dark soft glow
// around them and a warm flash of light as they land; a shout, a wish, a name).
// 2026-11-24: four more looks: neon (a tube that flickers on and then breathes), extrude (retro 3D block letters), box (each line on
// its own block, sliding in from alternate sides) and split (misregistered colour plates that jump on landing, then settle).
import { clamp, cssCamel, eBack, eOut3, frameOf, h, prog, rng, type ItemType } from '@tellcut/engine';
import { layoutMarkup } from './markup.ts';
import { runBox, setRuns, type RunBox } from './runs.ts';
import { isClear, luma, mixHex, withAlpha } from './color.ts';

export type Look = 'plain' | 'led' | 'gold' | 'neon' | 'extrude' | 'box' | 'split';
interface P {
  text: string; size: number; font: string; color: string; hl: string; outline: string; y: number; tilt: number; popDur: number; shake: number;
  stagger: number; hlScale: number; kicker: string; after: string; enter: 'pop' | 'press' | 'chars'; shadow: string; bar: string; drift: number;
  look: Look; ledColor: string; kickerBg: string; shade: number;
}
interface S { box: HTMLElement; text: RunBox; kicker: HTMLElement; after: HTMLElement; bar: HTMLElement; grid: HTMLElement; shade: HTMLElement; lineLook: string }

const TAU = Math.PI * 2;
/** looks split and neon: split's second plate and neon's second tube (the 【highlighted】 words), a cyan that reads beside any red,
 *  pink or yellow highlight */
export const SLAM_CYAN = '#25d8ff';
/** look box: each line's block padding (em, each side) and the time between lines sliding in when stagger is 0 */
const BOX_PAD = 0.26, BOX_STEP = 0.14;

/** look neon: how lit tube `i` (a line) is at `local` (0–1, scaling the glow): unlit before it starts, then over 0.45 s it flickers
 *  on and off from frame to frame (a fixed draw per frame number and line, more often on as it warms up), then it holds with a
 *  faint slow pulse */
export function neonLit(local: number, fps: number, i = 0): number {
  if (local < 0) return 0.08;
  if (local >= 0.45) return 0.95 + 0.05 * Math.sin(local * TAU * 0.6 + i);
  const r = rng(frameOf(local, fps) * 7919 + 101 + i * 1237); r();   // the first draw of a small seed is small whatever the seed: skip it
  return r() < 0.15 + 1.7 * local ? 1 : 0.08;
}

/** look neon: the tube's glow in `hl` at brightness `b` (em, so it follows the font size): a white-hot rim, then wider and fainter layers,
 *  and under them a steady dark haze so the tube still reads over a bright picture */
export const neonGlow = (hl: string, b: number) =>
  `0 0 0.02em ${withAlpha('#ffffff', 0.85 * b)}, 0 0 0.06em ${withAlpha(hl, b)}, 0 0 0.14em ${withAlpha(hl, 0.95 * b)}, 0 0 0.3em ${withAlpha(hl, 0.75 * b)}, 0 0 0.62em ${withAlpha(hl, 0.45 * b)}, 0 0 0.4em rgba(0,0,0,0.55), 0 0 0.9em rgba(0,0,0,0.35)`;

/** look extrude: twelve hard copies stepping down and to the right, `depth` em in all, in the side's colour */
export const extrusion = (side: string, depth: number) =>
  Array.from({ length: 12 }, (_, i) => { const d = (((i + 1) / 12) * depth).toFixed(4); return `${d}em ${d}em 0 ${side}`; }).join(', ');

/** look split: the two plates' offsets (em, [x, y] each) at `local`: until `settle` a new jump every frame (a fixed draw per frame
 *  number, the two thrown to opposite sides so both show), then the small fixed misregistration it keeps */
export function splitShift(local: number, fps: number, settle: number): [[number, number], [number, number]] {
  if (local >= settle) return [[-0.035, -0.012], [0.035, 0.012]];
  const r = rng(frameOf(local, fps) * 4513 + 29); r();
  const side = r() < 0.5 ? -1 : 1, x = side * (0.04 + 0.1 * r()), y = (r() - 0.5) * 0.08, back = 0.6 + 0.6 * r();
  return [[x, y], [-x * back, (r() - 0.5) * 0.08]];
}

/** dark text on a light chip, white on a dark one */
const onChip = (c: string) => ((luma(c) ?? 0) * 255 > 150 ? '#1b1410' : '#ffffff');
/** character i popping up at `local` (enter chars): 0.12 s in, one every 0.06 s, each over 0.22 s */
export const charPop = (i: number, local: number) => { const q = clamp((local - 0.12 - i * 0.06) / 0.22); return { q, opacity: clamp((local - 0.12 - i * 0.06) / 0.1), lift: 1 - clamp(eBack(q, 1.7)), scale: 0.6 + 0.4 * eBack(q, 1.7) }; };

/** look gold: the words filled with a champagne-gold gradient (clipped to the letters), a dark soft glow around them and a warm flash
 *  of light that dies out over the 0.8 s after the start; the other looks clear all of it */
export function goldFill(gold: boolean, local: number, k: number): Record<string, string> {
  if (!gold) return { backgroundImage: 'none', webkitBackgroundClip: 'border-box', backgroundClip: 'border-box', filter: 'none' };
  const flash = Math.max(0, 1 - local / 0.8);
  return {
    backgroundImage: 'linear-gradient(180deg, #fff3d6 0%, #f3dca6 55%, #d8b06a 100%)', webkitBackgroundClip: 'text', backgroundClip: 'text',
    filter: `drop-shadow(0 ${(4 * k).toFixed(1)}px ${(18 * k).toFixed(1)}px rgba(12,6,22,0.9))${flash > 0 ? ` drop-shadow(0 0 ${(40 * k * flash).toFixed(1)}px rgba(255,230,170,${(0.9 * flash).toFixed(3)}))` : ''}`,
  };
}

/** look led: the board behind the LED letters, from their colour: `bg` a near-black tinted 3 % toward it, `rim` (the inner edge) a
 *  quarter of the way, `dot` the board's r,g,b for the dot grid. The near-black bases are the ones that give the default red
 *  (#ff3b2a) exactly the board it was made with (#090404, #4a1a12); a colour that can't be read gives the bases themselves. */
export function ledBoard(ledColor: string): { bg: string; rim: string; dot: string } {
  const bg = mixHex('#010203', ledColor, 0.03), rim = mixHex('#0e0f0a', ledColor, 0.25);
  return { bg, rim, dot: [1, 3, 5].map((i) => parseInt(bg.slice(i, i + 2), 16)).join(',') };
}

/** how far line i has landed: each line pops in `popDur` seconds, `stagger` seconds after the one before */
export const lineLand = (i: number, local: number, popDur: number, stagger: number) => prog(local, i * stagger, i * stagger + popDur);

export const slam: ItemType<P, S> = {
  type: 'common.slam', label: '爆字', category: 'text', kind: 'overlay',
  doc: '一句超大的字「砸」進畫面（放大彈入、微晃、傾斜），【詞】變強調色（hlScale 放大）；stagger 讓每行依序砸下；上下可加一行小字（kicker／after），enter: press 是從大縮回像印泥暈開、chars 一個字一個字往上彈；bar 在字下面刷開一條強調色槓、drift 落定後極慢放大（對拍字卡）；kickerBg 把上方小字放進色塊從左滑進、shade 在字後面壓一片暗；影片的重點句、驚嘆、鉤子、結論。',
  variants: { param: 'look', list: [
    { value: 'plain', label: '描邊大字', doc: '描邊的大字（color 字色、outline 描邊，shadow 給顏色是錯位陰影）；什麼重點句都搭' },
    { value: 'led', label: 'LED 看板', doc: '黑色 LED 看板裡發光的紅字（ledColor 換顏色），字上一層暗點格子；定格的真心話' },
    { value: 'gold', label: '香檳金', doc: '香檳金漸層的斜體襯線大字，周圍一圈暗暗的柔光，落下時一陣暖光；歡呼、願望、名字' },
    { value: 'neon', label: '霓虹', doc: '近白的字芯、hl 色的層層光暈、【詞】是另一支青色燈管，每行像霓虹燈管先閃幾下才亮、亮了之後輕輕呼吸（不彈入、不晃；stagger 讓各行依序亮）；夜景、酒吧、城市、「營業中」' },
    { value: 'extrude', label: '立體厚字', doc: 'color 字面、outline 細描邊，往右下疊出一層層硬陰影的復古立體厚字（shadow 給顏色就換成側面的顏色）；標題、綜藝感、大聲宣告' },
    { value: 'box', label: '色塊字', doc: '每一行各放在一塊 outline 色的實心色塊上、左右交錯微歪，一行接一行從兩側輪流滑進來（stagger 改間隔，shadow 給色塊錯位陰影）；雜誌剪貼標籤感，條列主張、步驟、壓在雜亂畫面上的強烈句子' },
    { value: 'split', label: '色版錯位', doc: 'color 字後面錯開兩層分色（hl 和青色），落下時亂跳約 0.3 秒再停在小小的錯位；科技、故障、出錯、「等等，什麼？」' },
  ] },
  params: [
    { key: 'text', label: '文字（【強調】）', type: 'text', default: '重點！' },
    { key: 'size', label: '字級（畫面高 %）', type: 'number', min: 2, max: 40, step: 0.5, default: 9 },
    { key: 'font', label: '字型', type: 'string', default: 'Noto Sans TC', theme: 'fonts.display' },
    { key: 'color', label: '文字顏色', type: 'color', default: '#fff8ec', theme: 'palette.paper' },
    { key: 'hl', label: '強調顏色（neon 是光暈，split 是錯開的一層）', type: 'color', default: '#ff4d4f', theme: 'palette.hl', themeIfSet: true }, // the project's palette.hl only when it sets one: the built-in one is yellow, and this red would turn in every unthemed project
    { key: 'outline', label: '描邊顏色（box 是色塊）', type: 'color', default: '#1a1a1a', theme: 'palette.ink' },
    { key: 'y', label: '垂直位置（畫面高比例）', type: 'number', min: 0, max: 1, step: 0.01, default: 0.42 },
    { key: 'tilt', label: '傾斜（度）', type: 'number', min: -20, max: 20, step: 0.5, default: -4 },
    { key: 'popDur', label: '彈入長度 (s)', type: 'number', min: 0.05, max: 1, step: 0.01, default: 0.28 },
    { key: 'shake', label: '微晃強度', type: 'number', min: 0, max: 1, step: 0.05, default: 0.3 },
    { key: 'stagger', label: '每行間隔 (s)（0＝整句一起；box 的 0 是一行 0.14 秒）', type: 'number', min: 0, max: 2, step: 0.01, default: 0 },
    { key: 'hlScale', label: '強調字放大（倍）', type: 'number', min: 1, max: 1.8, step: 0.02, default: 1 },
    { key: 'kicker', label: '上方小字（空＝不顯示）', type: 'string', default: '' },
    { key: 'after', label: '下方小字（大字落定後出現；空＝不顯示）', type: 'string', default: '' },
    { key: 'enter', label: '落下方式（pop 彈入、press 從大縮回、chars 逐字往上彈）', type: 'enum', options: ['pop', 'press', 'chars'], default: 'pop' },
    { key: 'shadow', label: '錯位陰影顏色（透明＝沒有；extrude 是側面的顏色，box 是色塊的陰影）', type: 'color', default: '#00000000' },
    { key: 'bar', label: '字下面刷開的色槓（透明＝沒有）', type: 'color', default: '#00000000' },
    { key: 'drift', label: '落定後慢慢放大（到結束時多幾倍，0＝不動）', type: 'number', min: 0, max: 0.5, step: 0.01, default: 0 },
    { key: 'look', label: '樣子', type: 'enum', options: ['plain', 'led', 'gold', 'neon', 'extrude', 'box', 'split'], default: 'plain' },
    { key: 'ledColor', label: 'LED 字的顏色（led）', type: 'color', default: '#ff3b2a' },
    { key: 'kickerBg', label: '上方小字的色塊（透明＝沒有；有色塊時從左滑進）', type: 'color', default: '#00000000' },
    { key: 'shade', label: '字後面壓暗（0–1）', type: 'number', min: 0, max: 1, step: 0.05, default: 0 },
  ],
  build(ctx) {
    const shade = h('div', null, null, ctx.root);
    cssCamel(shade, { position: 'absolute', left: '0', right: '0', display: 'none' });
    const box = h('div', null, null, ctx.root);
    cssCamel(box, { position: 'absolute', left: '50%', textAlign: 'center', whiteSpace: 'pre', lineHeight: '1.15', fontWeight: '900' });
    const text = runBox(box), mk = (pos: Record<string, string>) => { const d = h('div', null, null, box); cssCamel(d, { position: 'absolute', left: '50%', whiteSpace: 'pre', webkitTextStroke: '0', ...pos }); return d; };
    const bar = h('div', null, null, box);
    cssCamel(bar, { position: 'absolute', left: '50%', top: '100%', transformOrigin: '0 50%', display: 'none' });
    const grid = h('div', null, null, box);
    cssCamel(grid, { position: 'absolute', inset: '0', display: 'none', borderRadius: 'inherit' });
    return { box, text, kicker: mk({ bottom: '100%' }), after: mk({ top: '100%' }), bar, grid, shade, lineLook: '' };
  },
  draw(ctx, s) {
    const p = ctx.params, { W, H, theme } = ctx, k = Math.min(W, H) / 1080, px = (p.size / 100) * H, look = p.look ?? 'plain';
    const led = look === 'led', gold = look === 'gold', neon = look === 'neon', extrude = look === 'extrude', boxed = look === 'box', split = look === 'split';
    const hs = Math.max(1, p.hlScale ?? 1), boxEm = (W * (1 - 2 * theme.safe.side)) / px / hs;
    // box: the blocks' padding comes out of the width; extrude: the depth does
    const fit = boxed ? layoutMarkup(p.text, boxEm, 3, 1, null, 2 * BOX_PAD) : extrude ? layoutMarkup(p.text, boxEm, 3, 1, null, 0.1) : layoutMarkup(p.text, boxEm, 3);
    const stagger = Math.max(0, p.stagger ?? 0), press = p.enter === 'press', chars = p.enter === 'chars';
    // box and neon style each line (and neon each highlighted word): another look gets its lines made again plain
    const lineLook = boxed || neon ? look : '';
    if (s.lineLook !== lineLook) s.text.key = '';
    s.lineLook = lineLook;
    setRuns(s.text, fit.lines, neon ? mixHex('#ffffff', SLAM_CYAN, 0.2) : p.hl, { ...(hs !== 1 ? { hlScale: hs } : {}), ...(chars ? { perChar: true } : {}) });
    if (chars) ([...s.text.el.querySelectorAll('span')] as HTMLElement[]).forEach((el, i) => { const c = charPop(i, ctx.local); cssCamel(el, { opacity: String(c.opacity), transform: `translateY(${(c.lift * 60 * k).toFixed(1)}px) scale(${c.scale.toFixed(3)})` }); });
    const land = (q: number) => (press ? 1.5 - 0.5 * eOut3(q) : 0.4 + 0.6 * eBack(q, 2.2));
    // box lands line by line even when stagger is 0; neon does not pop (its entrance is the flicker), unless it is pressed
    const step = stagger > 0 ? stagger : boxed ? BOX_STEP : 0, still = boxed || (neon && !press);
    const lines = [...s.text.el.children] as HTMLElement[], last = step > 0 ? (lines.length - 1) * step : 0;
    if (stagger > 0 && !boxed && !neon) lines.forEach((el, i) => { const q = lineLand(i, ctx.local, p.popDur, stagger); cssCamel(el, { opacity: String(clamp(q * 2)), transform: `scale(${land(q)})` }); });
    if (boxed) lines.forEach((el, i) => {   // each line on its own block, tipped and slid in from its side, the first from the left
      const q = lineLand(i, ctx.local, p.popDur * 1.3, step), dir = i % 2 ? 1 : -1;
      cssCamel(el, { width: 'fit-content', margin: '0 auto 0.1em', padding: `0.02em ${BOX_PAD}em 0.06em`, background: p.outline, lineHeight: '1.15',
        boxShadow: isClear(p.shadow) ? 'none' : `0.07em 0.07em 0 ${p.shadow}`, opacity: String(clamp(q * 3)),
        transform: `translateX(${((1 - eBack(q, 1.2)) * dir * W * 0.8).toFixed(1)}px) rotate(${(dir * 1.6).toFixed(2)}deg)` });
    });
    if (neon) lines.forEach((el, i) => {   // each line a tube of its own, flickering on `stagger` s after the one before, dim while unlit
      const b = neonLit(ctx.local - i * stagger, ctx.fps, i);
      cssCamel(el, { opacity: b > 0.5 ? '1' : '0.3', textShadow: neonGlow(p.hl, b) });
      for (const w of el.querySelectorAll('span')) if (w.style.color) cssCamel(w, { textShadow: neonGlow(SLAM_CYAN, b) });   // a 【word】: the second tube
    });
    const pop = stagger > 0 || chars || boxed ? 1 : prog(ctx.local, 0, p.popDur), scale = (stagger > 0 || chars || still ? 1 : land(pop)) * (1 + (p.drift ?? 0) * prog(ctx.local, last + p.popDur, ctx.dur));
    // a shake that dies out over the half second after the landing; the offsets come from the frame number, never from chance
    const decay = neon ? 0 : 1 - prog(ctx.local, last + p.popDur, last + p.popDur + 0.5), r = rng(frameOf(ctx.local, ctx.fps) + 17);
    const dx = (r() - 0.5) * 2 * p.shake * decay * 14 * k, dy = (r() - 0.5) * 2 * p.shake * decay * 14 * k;
    const out = 1 - prog(ctx.local, ctx.dur - 0.15, ctx.dur), board = ledBoard(p.ledColor);
    const side = isClear(p.shadow) ? p.outline : p.shadow;
    const [sa, sb] = split ? splitShift(ctx.local, ctx.fps, last + p.popDur + 0.3) : [[0, 0], [0, 0]];
    const em = (v: number) => `${v.toFixed(3)}em`;
    cssCamel(s.box, {
      top: `${p.y * H}px`, opacity: String(Math.min(1, pop * (press ? 2 : 4)) * out),
      textShadow: led ? `0 0 ${10 * k}px ${p.ledColor}, 0 0 ${28 * k}px ${withAlpha(p.ledColor, 0.6)}`
        : extrude ? extrusion(side, 0.1 * eOut3(clamp(pop * 1.5)))
        : split ? `${em(sa[0])} ${em(sa[1])} 0 ${withAlpha(p.hl, 0.9)}, ${em(sb[0])} ${em(sb[1])} 0 ${withAlpha(SLAM_CYAN, 0.9)}, 0 0 0.16em rgba(0,0,0,0.35)`
        : gold || boxed || neon || isClear(p.shadow) ? 'none' : `0.04em 0.05em 0 ${p.shadow}`,
      transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) rotate(${p.tilt}deg) scale(${scale})`,
      fontFamily: gold ? `'Playfair Display', '${p.font}', 'Noto Serif TC', serif` : neon ? `'Huninn', '${p.font}', 'Noto Sans TC', sans-serif` : `'${p.font}', 'Noto Sans TC', sans-serif`,
      fontSize: `${(px * fit.scale).toFixed(2)}px`, fontWeight: neon ? '400' : '900',
      color: led ? p.ledColor : gold ? 'transparent' : neon ? mixHex('#ffffff', p.hl, 0.15) : p.color, fontStyle: gold ? 'italic' : 'normal',
      webkitTextStroke: led || neon || boxed || split ? '0' : gold ? `${2.5 * k}px rgba(70,40,10,0.65)` : extrude ? `${Math.max(2, theme.stroke * 0.45) * k}px ${p.outline}` : `${theme.stroke * 1.4 * k}px ${p.outline}`, paintOrder: 'stroke fill',
      ...(led ? { padding: `${0.11 * px}px ${0.31 * px}px`, borderRadius: `${16 * k}px`, background: board.bg, letterSpacing: '0.05em',
        boxShadow: `inset 0 0 0 ${3 * k}px ${board.rim}, 0 ${12 * k}px ${30 * k}px rgba(0,0,0,.6)` }
        : { padding: '0', borderRadius: '0', background: 'none', letterSpacing: neon ? '0.04em' : 'normal', boxShadow: 'none' }),
      ...goldFill(gold, ctx.local, k),   // after the background shorthand, which would clear it
    });
    // led: a grid of dark dots over the letters
    cssCamel(s.grid, { display: led ? 'block' : 'none', backgroundImage: `radial-gradient(circle, rgba(${board.dot},0) ${2.2 * k}px, rgba(${board.dot},.55) ${2.6 * k}px)`, backgroundSize: `${7 * k}px ${7 * k}px` });
    // the shade: a dark band behind the words, darkest below them
    const sh = p.shade ?? 0;
    cssCamel(s.shade, { display: sh > 0 ? 'block' : 'none', top: `${p.y * H - 1.6 * px}px`, height: `${3.6 * px}px`, opacity: String(sh * eOut3(prog(ctx.local, 0, 0.2)) * out),
      background: 'linear-gradient(rgba(0,0,0,0), rgba(0,0,0,.85) 40%, rgba(0,0,0,.9) 70%, rgba(0,0,0,0))' });
    // the bar: 80 % of the words' width, wiped open from the left just after the landing, outlined like the words
    const bw = isClear(p.bar) ? 0 : s.text.el.offsetWidth * 0.8, bp = eOut3(prog(ctx.local, p.popDur * 0.5, p.popDur * 2));
    cssCamel(s.bar, { display: bw ? 'block' : 'none', width: `${bw}px`, marginLeft: `${-bw / 2}px`, marginTop: '0.12em', height: `${16 * k}px`, background: p.bar ?? '',
      boxShadow: `0 0 0 ${4 * k}px ${p.outline}`, transform: `scaleX(${bp.toFixed(4)})` });
    // the small lines: above at once, below once the big one has landed; kept the same size whatever the pop does
    const small = (px * 0.42) / scale, afterAt = last + p.popDur + 0.55;
    s.kicker.textContent = p.kicker ?? ''; s.after.textContent = p.after ?? '';
    const chip = !isClear(p.kickerBg), ka = eOut3(prog(ctx.local, 0, chip ? 0.25 : 0.3));
    cssCamel(s.kicker, { display: p.kicker ? 'block' : 'none', fontSize: `${small}px`, fontWeight: chip ? '900' : '700', color: chip ? onChip(p.kickerBg) : p.color,
      transform: chip ? `translate(calc(-50% + ${((1 - ka) * -200 * k).toFixed(1)}px), -0.3em)` : 'translate(-50%, -0.3em)',
      background: chip ? p.kickerBg : 'none', padding: chip ? '0.12em 0.5em' : '0', borderRadius: chip ? `${8 * k}px` : '0', letterSpacing: chip ? '0.12em' : 'normal',
      textShadow: chip ? 'none' : `0 0 ${small * 0.12}px ${p.outline}, 0 0 ${small * 0.12}px ${p.outline}, 0 0 ${small * 0.2}px ${p.outline}`, opacity: String(ka) });
    cssCamel(s.after, { display: p.after ? 'block' : 'none', fontSize: `${small * 0.96}px`, fontWeight: '700', color: p.hl, transform: 'translate(-50%, 0.3em)',
      textShadow: `0 0 ${small * 0.12}px ${p.outline}, 0 0 ${small * 0.12}px ${p.outline}, 0 0 ${small * 0.2}px ${p.outline}`, opacity: String(eOut3(prog(ctx.local, afterAt, afterAt + 0.3))) });
  },
};
