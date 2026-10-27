// common.slam — one big phrase that lands with a pop and a short shake; for the line that carries the video.
// From the baking-sin short: lines can land one after another (stagger, the highlighted one bigger), a small line above and one
// below (結論：/ 值得。/（明天再減肥）), a "press" landing (big and settling, like ink spreading) and an offset shadow.
// From the uk-beat short's fx.word: an accent bar wiped open under the words, and a slow drift (zoom) once they have landed.
// From the food-deep short: look 'led' (fx.slam: red glowing words on a black LED board with a dot grid), enter 'chars' (fx.title: the
// characters pop up one by one), a kicker on a coloured chip sliding in from the left, and a dark shade behind the words.
import { clamp, cssCamel, eBack, eOut3, frameOf, h, prog, rng, type ItemType } from '@tellcut/engine';
import { layoutMarkup } from './markup.ts';
import { runBox, setRuns, type RunBox } from './runs.ts';
import { isClear, luma, withAlpha } from './color.ts';

interface P {
  text: string; size: number; font: string; color: string; hl: string; outline: string; y: number; tilt: number; popDur: number; shake: number;
  stagger: number; hlScale: number; kicker: string; after: string; enter: 'pop' | 'press' | 'chars'; shadow: string; bar: string; drift: number;
  look: 'plain' | 'led'; ledColor: string; kickerBg: string; shade: number;
}
interface S { box: HTMLElement; text: RunBox; kicker: HTMLElement; after: HTMLElement; bar: HTMLElement; grid: HTMLElement; shade: HTMLElement }

/** dark text on a light chip, white on a dark one */
const onChip = (c: string) => ((luma(c) ?? 0) * 255 > 150 ? '#1b1410' : '#ffffff');
/** character i popping up at `local` (enter chars): 0.12 s in, one every 0.06 s, each over 0.22 s */
export const charPop = (i: number, local: number) => { const q = clamp((local - 0.12 - i * 0.06) / 0.22); return { q, opacity: clamp((local - 0.12 - i * 0.06) / 0.1), lift: 1 - clamp(eBack(q, 1.7)), scale: 0.6 + 0.4 * eBack(q, 1.7) }; };

/** how far line i has landed: each line pops in `popDur` seconds, `stagger` seconds after the one before */
export const lineLand = (i: number, local: number, popDur: number, stagger: number) => prog(local, i * stagger, i * stagger + popDur);

export const slam: ItemType<P, S> = {
  type: 'common.slam', label: '爆字', category: 'text', kind: 'overlay',
  doc: '一句超大的字「砸」進畫面（放大彈入、微晃、傾斜），【詞】變強調色（hlScale 放大）；stagger 讓每行依序砸下；上下可加一行小字（kicker／after），enter: press 是從大縮回像印泥暈開、chars 一個字一個字往上彈；bar 在字下面刷開一條強調色槓、drift 落定後極慢放大（對拍字卡）；kickerBg 把上方小字放進色塊從左滑進、shade 在字後面壓一片暗；look led 是黑色 LED 看板裡發光的紅字（定格的真心話）；影片的重點句、驚嘆、鉤子、結論',
  params: [
    { key: 'text', label: '文字（【強調】）', type: 'text', default: '重點！' },
    { key: 'size', label: '字級（畫面高 %）', type: 'number', min: 2, max: 40, step: 0.5, default: 9 },
    { key: 'font', label: '字型', type: 'string', default: 'Noto Sans TC', theme: 'fonts.display' },
    { key: 'color', label: '文字顏色', type: 'color', default: '#fff8ec', theme: 'palette.paper' },
    { key: 'hl', label: '強調顏色', type: 'color', default: '#ff4d4f', theme: 'palette.accent' },
    { key: 'outline', label: '描邊顏色', type: 'color', default: '#1a1a1a', theme: 'palette.ink' },
    { key: 'y', label: '垂直位置（畫面高比例）', type: 'number', min: 0, max: 1, step: 0.01, default: 0.42 },
    { key: 'tilt', label: '傾斜（度）', type: 'number', min: -20, max: 20, step: 0.5, default: -4 },
    { key: 'popDur', label: '彈入長度 (s)', type: 'number', min: 0.05, max: 1, step: 0.01, default: 0.28 },
    { key: 'shake', label: '微晃強度', type: 'number', min: 0, max: 1, step: 0.05, default: 0.3 },
    { key: 'stagger', label: '每行間隔 (s)（0＝整句一起）', type: 'number', min: 0, max: 2, step: 0.01, default: 0 },
    { key: 'hlScale', label: '強調字放大（倍）', type: 'number', min: 1, max: 1.8, step: 0.02, default: 1 },
    { key: 'kicker', label: '上方小字（空＝不顯示）', type: 'string', default: '' },
    { key: 'after', label: '下方小字（大字落定後出現；空＝不顯示）', type: 'string', default: '' },
    { key: 'enter', label: '落下方式（pop 彈入、press 從大縮回、chars 逐字往上彈）', type: 'enum', options: ['pop', 'press', 'chars'], default: 'pop' },
    { key: 'shadow', label: '錯位陰影顏色（透明＝沒有）', type: 'color', default: '#00000000' },
    { key: 'bar', label: '字下面刷開的色槓（透明＝沒有）', type: 'color', default: '#00000000' },
    { key: 'drift', label: '落定後慢慢放大（到結束時多幾倍，0＝不動）', type: 'number', min: 0, max: 0.5, step: 0.01, default: 0 },
    { key: 'look', label: '樣子（plain 描邊大字、led 黑色 LED 看板發光字）', type: 'enum', options: ['plain', 'led'], default: 'plain' },
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
    return { box, text, kicker: mk({ bottom: '100%' }), after: mk({ top: '100%' }), bar, grid, shade };
  },
  draw(ctx, s) {
    const p = ctx.params, { W, H, theme } = ctx, k = Math.min(W, H) / 1080, px = (p.size / 100) * H;
    const hs = Math.max(1, p.hlScale ?? 1), fit = layoutMarkup(p.text, (W * (1 - 2 * theme.safe.side)) / px / hs, 3);
    const stagger = Math.max(0, p.stagger ?? 0), press = p.enter === 'press', chars = p.enter === 'chars', led = p.look === 'led';
    setRuns(s.text, fit.lines, p.hl, { ...(hs !== 1 ? { hlScale: hs } : {}), ...(chars ? { perChar: true } : {}) });
    if (chars) ([...s.text.el.querySelectorAll('span')] as HTMLElement[]).forEach((el, i) => { const c = charPop(i, ctx.local); cssCamel(el, { opacity: String(c.opacity), transform: `translateY(${(c.lift * 60 * k).toFixed(1)}px) scale(${c.scale.toFixed(3)})` }); });
    const land = (q: number) => (press ? 1.5 - 0.5 * eOut3(q) : 0.4 + 0.6 * eBack(q, 2.2));
    const lines = [...s.text.el.children] as HTMLElement[], last = stagger > 0 ? (lines.length - 1) * stagger : 0;
    if (stagger > 0) lines.forEach((el, i) => { const q = lineLand(i, ctx.local, p.popDur, stagger); cssCamel(el, { opacity: String(clamp(q * 2)), transform: `scale(${land(q)})` }); });
    const pop = stagger > 0 || chars ? 1 : prog(ctx.local, 0, p.popDur), scale = (stagger > 0 || chars ? 1 : land(pop)) * (1 + (p.drift ?? 0) * prog(ctx.local, last + p.popDur, ctx.dur));
    // a shake that dies out over the half second after the landing; the offsets come from the frame number, never from chance
    const decay = 1 - prog(ctx.local, last + p.popDur, last + p.popDur + 0.5), r = rng(frameOf(ctx.local, ctx.fps) + 17);
    const dx = (r() - 0.5) * 2 * p.shake * decay * 14 * k, dy = (r() - 0.5) * 2 * p.shake * decay * 14 * k;
    const out = 1 - prog(ctx.local, ctx.dur - 0.15, ctx.dur);
    cssCamel(s.box, {
      top: `${p.y * H}px`, opacity: String(Math.min(1, pop * (press ? 2 : 4)) * out),
      textShadow: led ? `0 0 ${10 * k}px ${p.ledColor}, 0 0 ${28 * k}px ${withAlpha(p.ledColor, 0.6)}` : isClear(p.shadow) ? 'none' : `0.04em 0.05em 0 ${p.shadow}`,
      transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) rotate(${p.tilt}deg) scale(${scale})`,
      fontFamily: `'${p.font}', 'Noto Sans TC', sans-serif`, fontSize: `${(px * fit.scale).toFixed(2)}px`, color: led ? p.ledColor : p.color,
      webkitTextStroke: led ? '0' : `${theme.stroke * 1.4 * k}px ${p.outline}`, paintOrder: 'stroke fill',
      ...(led ? { padding: `${0.11 * px}px ${0.31 * px}px`, borderRadius: `${16 * k}px`, background: '#090404', letterSpacing: '0.05em',
        boxShadow: `inset 0 0 0 ${3 * k}px #4a1a12, 0 ${12 * k}px ${30 * k}px rgba(0,0,0,.6)` }
        : { padding: '0', borderRadius: '0', background: 'none', letterSpacing: 'normal', boxShadow: 'none' }),
    });
    // led: a grid of dark dots over the letters
    cssCamel(s.grid, { display: led ? 'block' : 'none', backgroundImage: `radial-gradient(circle, rgba(9,4,4,0) ${2.2 * k}px, rgba(9,4,4,.55) ${2.6 * k}px)`, backgroundSize: `${7 * k}px ${7 * k}px` });
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
