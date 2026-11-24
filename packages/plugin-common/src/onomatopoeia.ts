// common.onomatopoeia — a comic's sound word (哈哈哈！, SNIFF, Zzz…): coloured letters with a heavy ink outline, set at a slant
// anywhere in the frame, popping in one letter after another with a springy overshoot, each letter tipped a little the other way
// from its neighbour and twitching while it stays. Promoted 2026-11-05 from the comic pilot film's fx.comicsfx. DOM text, so check
// measures it; a pure function of time (the twitch comes from a seeded generator keyed to the frame's twelfth of a second).
// 2026-11-24: `look` draws the word the way a comic letters that kind of sound (a shout growing letter by letter, a shiver, a
// whisper, a whoosh, a rumble, a sparkle, a soft bounce, a pop-art bang), and `vertical` stacks the letters top to bottom.
import { clamp, cssCamel, eBack, eOut3, h, rng, type ItemType } from '@tellcut/engine';
import { graphemes } from './text.ts';
import { withAlpha } from './color.ts';

export type Look = 'pop' | 'shout' | 'tremble' | 'whisper' | 'zoom' | 'rumble' | 'sparkle' | 'bubble' | 'halftone';
interface P { text: string; look: Look; x: number; y: number; size: number; color: string; color2: string; ink: string; stroke: number; depth: number; tilt: number; rise: number; spacing: number; gap: number; shake: number; font: string; weight: number; vertical: boolean; outDur: number }
interface S { box: HTMLElement; chars: HTMLElement[]; extras: HTMLElement[]; text: string }

const TAU = Math.PI * 2, EXTRAS = 6;
/** look sparkle: where each glint sits (fractions of the word's box, outside its edges) and how big it is (letter heights) */
const GLINTS: Array<[number, number, number]> = [[-0.07, -0.22, 0.42], [1.06, -0.12, 0.3], [0.3, -0.4, 0.22], [0.78, 1.22, 0.34], [-0.05, 1.08, 0.2], [1.1, 0.8, 0.26]];
const STAR = 'polygon(50% 0, 60% 40%, 100% 50%, 60% 60%, 50% 100%, 40% 60%, 0 50%, 40% 40%)';

/** letter i's pop (0 → past 1 → 1) at `local`: a spring started `gap` s after the one before */
export function letterPop(spring: (t: number) => number, i: number, gap: number, local: number): number {
  const t = local - i * gap;
  return t < 0 ? 0 : spring(t);
}

export interface Letter { show: boolean; x: number; y: number; rot: number; skew: number; sx: number; sy: number; opacity: number }
/** Where letter i of n is at `local` in a look: its offset from its place in the row (px), turn and skew (degrees), scale and
 *  opacity. `shake` and `px` (the letter height) are in px, `W` the frame's width; a pure function of its arguments. */
export function letterAt(look: Look, i: number, n: number, local: number, o: { gap: number; shake: number; px: number; W: number; spring: (t: number) => number }): Letter {
  const { gap, shake, px } = o, at = (every: number) => local - i * every, flip = i % 2 ? 1 : -1;
  const jitter = (hz: number, amp: number) => { const r = rng(Math.floor(local * hz) * 31 + i * 7 + 3); return [(r() - 0.5) * 2 * amp, (r() - 0.5) * 2 * amp, r() - 0.5]; };
  if (look === 'shout') {   // each letter bigger than the last, slammed down from 2.4×, shaking hard
    const q = clamp(at(gap) / 0.16), grow = n > 1 ? 0.78 + (0.5 * i) / (n - 1) : 1.1, [jx, jy] = jitter(24, shake * 2.2);
    return { show: at(gap) >= 0, x: jx, y: jy, rot: flip * 3, skew: 0, sx: grow * (2.4 - 1.4 * eOut3(q)), sy: grow * (2.4 - 1.4 * eOut3(q)), opacity: clamp(q * 3) };
  }
  if (look === 'tremble') {   // there at once, never still: a new offset, turn and height twenty times a second
    const [jx, jy, jr] = jitter(20, shake * 2);
    return { show: at(gap) >= 0, x: jx, y: jy, rot: jr * 10, skew: 0, sx: 1, sy: 1 + jr * 0.08, opacity: clamp(at(gap) / 0.08) };
  }
  if (look === 'whisper') {   // fading in slowly, a letter every four gaps, rising a quarter of its height and drifting on up
    const every = Math.max(gap, 0.02) * 4, q = clamp(at(every) / 0.5);
    return { show: at(every) >= 0, x: 0, y: (1 - eOut3(q)) * 0.25 * px - Math.max(0, at(every)) * 0.02 * px, rot: 0, skew: 0, sx: 1, sy: 1, opacity: 0.92 * q };
  }
  if (look === 'zoom') {   // shot in from the left, leaning forward
    const every = gap * 0.6, q = eOut3(clamp(at(every) / 0.22)), [jx, jy] = jitter(12, shake * 0.5);
    return { show: at(every) >= 0, x: -(1 - q) * o.W * 0.6 + jx, y: jy, rot: 0, skew: -16, sx: 1, sy: 1, opacity: clamp(q * 4) };
  }
  if (look === 'rumble') {   // dropped from above, squashed by the landing, then a slow heavy rumble
    const every = gap * 1.5, q = clamp(at(every) / 0.2), s = at(every) - 0.2, squash = s > 0 ? 0.22 * Math.exp(-s * 10) * Math.cos(s * 28) : 0;
    return { show: at(every) >= 0, x: Math.sin(local * TAU * 7 + i * 2.1) * shake * 0.6, y: -(1 - eOut3(q)) * 0.8 * px + Math.sin(local * TAU * 9 + i * 1.3) * shake * 1.2,
      rot: flip * 2, skew: 0, sx: 1 + squash, sy: 1 - squash, opacity: clamp(q * 4) };
  }
  if (look === 'sparkle') {   // spun open from nothing, then floating
    const k = letterPop(o.spring, i, gap, local), turn = (1 - clamp(at(gap) / 0.3)) * -30;
    return { show: k > 0, x: 0, y: Math.sin(local * 3 + i) * 0.03 * px, rot: turn, skew: 0, sx: Math.max(0, k), sy: Math.max(0, k), opacity: 1 };
  }
  if (look === 'bubble') {   // a wave of hops along the word, each letter stretching on the way up and squashing on the way down
    const k = Math.max(0, letterPop(o.spring, i, gap, local)), wave = Math.sin(local * TAU * 1.1 - i * 0.7);
    return { show: k > 0, x: 0, y: -Math.max(0, wave) * 0.22 * px, rot: flip * 3, skew: 0, sx: k * (1 - 0.1 * wave), sy: k * (1 + 0.14 * wave), opacity: 1 };
  }
  if (look === 'halftone') {   // the whole word banged in together, overshooting, then a small pulse
    const q = clamp(at(0.03) / 0.22), sc = Math.max(0, eBack(q, 2.6)) * (1 + 0.02 * Math.sin(local * 10)), [jx, jy] = jitter(12, shake * 0.4);
    return { show: at(0.03) >= 0, x: jx, y: jy, rot: flip * 3 + (1 - q) * -12, skew: 0, sx: sc, sy: sc, opacity: clamp(q * 4) };
  }
  const k = letterPop(o.spring, i, gap, local), [jx, jy] = jitter(12, shake);
  return { show: k > 0, x: jx, y: jy, rot: flip * 4, skew: 0, sx: Math.max(0, k), sy: Math.max(0, k), opacity: 1 };
}

/** an outline `a` px wide around everything drawn so far, as a chain of four hard drop-shadows (right, left, down, up) */
const ring = (a: number, c: string) => [[a, 0], [-a, 0], [0, a], [0, -a]].map(([x, y]) => `drop-shadow(${x.toFixed(1)}px ${y.toFixed(1)}px 0 ${c})`).join(' ');

export const onomatopoeia: ItemType<P, S> = {
  type: 'common.onomatopoeia', label: '狀聲詞', category: 'text', kind: 'overlay',
  doc: '漫畫的狀聲詞（哈哈哈！、嗅嗅、SNIFF、Zzz…）：一個字一個字出現的大字，放在畫面任何地方、斜斜的；look 選這個聲音的畫法；rise 讓字一個比一個高（往上爬的笑聲），vertical 直排（日漫的直排狀聲詞，rise 變成左右錯開）；color 主色、color2 第二色、ink 墨色；英文換 font（Bangers）並把 spacing 調大一點；一個畫面可以放一大一小兩個（中文大字＋英文小字）；配 common.comic 漫畫頁、common.speedlines、common.pop 音效',
  variants: { param: 'look', list: [
    { value: 'pop', label: '彈出', doc: '彩色填色、粗黑描邊的字一個一個彈出，每個字往左右各歪一點，停著時輕輕抖（depth 加一層黑色立體陰影）；笑聲、嗅嗅、一般的狀聲詞' },
    { value: 'shout', label: '吶喊', doc: '字一個比一個大、從很大砸下來，黑描邊外再一圈 color2 的白邊和立體陰影，一直用力抖；大叫、轟、啊啊啊、嚇一跳' },
    { value: 'tremble', label: '發抖', doc: 'color2 色的細邊字左右各拖一道 color 色的殘影，每個字不停地抖、歪來歪去；好冷、害怕、緊張、手機震動' },
    { value: 'whisper', label: '悄悄', doc: '沒有描邊的細字、字距拉開、周圍一圈柔柔的暗影，一個字一個字慢慢浮出來再往上飄；靜…、Zzz、沉默、尷尬、心裡的話' },
    { value: 'zoom', label: '咻', doc: '往前傾的斜字從左邊射進來，後面拖著 color 色的殘影和幾道 color2 的速度線；咻、唰、衝、快轉、飛過去' },
    { value: 'rumble', label: '轟隆', doc: 'ink 色的黑字、color 色的細邊和光暈，從上面掉下來壓扁再彈回，之後沉沉地隆隆震動；轟隆、咚、地震、壓迫感、不妙的預感' },
    { value: 'sparkle', label: '閃亮', doc: '由上到下從 color2 漸層到 color 的字、白邊加柔光，轉著彈開，周圍幾顆四角星一閃一閃；閃亮亮、登場、完成、好漂亮' },
    { value: 'bubble', label: '軟 Q', doc: '圓體字、厚厚一圈 color2 的白邊，像果凍一樣一個接一個跳，往上拉長、落下壓扁；啾、噗、蹦蹦、咬咬、軟綿綿、可愛的東西' },
    { value: 'halftone', label: '網點', doc: '美式漫畫的字：color 色上面一層 color2 的網點、粗黑描邊、往右下錯開的硬陰影，整個字一起彈出來；砰、POW、BAM、打中、撞上' },
  ] },
  params: [
    { key: 'text', label: '字', type: 'string', default: '哈哈哈！' },
    { key: 'look', label: '樣子', type: 'enum', options: ['pop', 'shout', 'tremble', 'whisper', 'zoom', 'rumble', 'sparkle', 'bubble', 'halftone'], default: 'pop' },
    { key: 'x', label: '中心 x（畫面寬比例）', type: 'number', min: 0, max: 1, step: 0.01, default: 0.5 },
    { key: 'y', label: '中心 y（畫面高比例）', type: 'number', min: 0, max: 1, step: 0.01, default: 0.3 },
    { key: 'size', label: '字高（畫面短邊 %）', type: 'number', min: 3, max: 40, step: 0.5, default: 16 },
    { key: 'color', label: '主色（填色；rumble 是邊和光暈）', type: 'color', default: '#ff7a1a', theme: 'palette.accent' },
    { key: 'color2', label: '第二色（白邊、亮點、網點、速度線；pop、whisper、rumble 不用）', type: 'color', default: '#ffffff' },
    { key: 'ink', label: '墨色（描邊、陰影；rumble 是字的顏色）', type: 'color', default: '#111111', theme: 'palette.ink' },
    { key: 'stroke', label: '描邊粗細（px，短邊 1080）', type: 'number', min: 0, max: 40, step: 1, default: 14 },
    { key: 'depth', label: '立體陰影（px，0＝不要；shout、halftone 的 0 是它自己的預設）', type: 'number', min: 0, max: 40, step: 1, default: 0 },
    { key: 'tilt', label: '傾斜（度）', type: 'number', min: -45, max: 45, step: 1, default: -8 },
    { key: 'rise', label: '每個字往上爬（字高比例，負的往下；直排時是往右）', type: 'number', min: -0.5, max: 0.5, step: 0.01, default: 0 },
    { key: 'spacing', label: '字距（字寬倍數；英文約 1.1）', type: 'number', min: 0.6, max: 1.6, step: 0.02, default: 0.96 },
    { key: 'gap', label: '逐字間隔（秒）', type: 'number', min: 0, max: 0.5, step: 0.01, default: 0.07 },
    { key: 'shake', label: '抖動（px）', type: 'number', min: 0, max: 20, step: 0.5, default: 3 },
    { key: 'font', label: '字型', type: 'string', default: 'Noto Sans TC', theme: 'fonts.display' },
    { key: 'weight', label: '字重', type: 'number', min: 100, max: 900, step: 100, default: 900 },
    { key: 'vertical', label: '直排', type: 'bool', default: false },
    { key: 'outDur', label: '出場（秒，放大淡出）', type: 'number', min: 0, max: 1, step: 0.05, default: 0.15 },
  ],
  build(ctx) {
    const box = h('div', null, null, ctx.root);
    cssCamel(box, { position: 'absolute', left: '0', top: '0', display: 'flex', alignItems: 'center', whiteSpace: 'pre', lineHeight: '1', pointerEvents: 'none' });
    // the glints (sparkle) and speed streaks (zoom): out of the row, placed against the word's box
    const extras = Array.from({ length: EXTRAS }, () => { const el = document.createElement('div'); cssCamel(el, { position: 'absolute', display: 'none' }); return el; });
    return { box, chars: [], extras, text: '' };
  },
  draw(ctx, s) {
    const p = ctx.params, { W, H, local, dur, motion } = ctx, S = Math.min(W, H), u = S / 1080, px = (p.size / 100) * S, look = p.look ?? 'pop';
    if (s.text !== p.text) {
      s.box.replaceChildren();
      s.chars = graphemes(p.text).map((ch) => { const el = h('span', null, null, s.box); el.textContent = ch; cssCamel(el, { display: 'inline-block', paintOrder: 'stroke fill' }); return el; });
      s.text = p.text;
    }
    if (s.extras[0].parentElement !== s.box) s.box.append(...s.extras);
    const out = p.outDur > 0 ? clamp((dur - local) / p.outDur) : 1, n = s.chars.length;
    const spring = motion.spring(look === 'bubble' ? { duration: 0.5, bounce: 0.7 } : { duration: 0.38, bounce: 0.55 });
    const d = (p.depth || (look === 'shout' ? 10 : look === 'halftone' ? 12 : 0)) * u, sw = p.stroke * 2 * u;
    const fonts = `'${p.font}', 'Noto Sans TC', sans-serif`;
    // what the whole word wears: the font, and the filters that draw around every letter at once (an outer outline, a hard shadow, a glow)
    const filter = look === 'shout' ? `${ring(p.stroke * 0.7 * u, p.color2)} drop-shadow(${d.toFixed(1)}px ${d.toFixed(1)}px 0 ${p.ink})`
      : look === 'halftone' ? `${ring(p.stroke * 0.6 * u, p.ink)} drop-shadow(${d.toFixed(1)}px ${d.toFixed(1)}px 0 ${p.ink})`
      : look === 'bubble' ? `${ring(3 * u, p.ink)} drop-shadow(0 ${(8 * u).toFixed(1)}px 0 ${withAlpha(p.ink, 0.3)})`
      : look === 'sparkle' ? `${ring(p.stroke * 0.3 * u, p.color2)} drop-shadow(0 0 ${(3 * u).toFixed(1)}px ${p.ink}) drop-shadow(0 0 ${(18 * u).toFixed(1)}px ${withAlpha(p.color2, 0.7)})` : 'none';
    cssCamel(s.box, { fontFamily: look === 'bubble' ? `'Huninn', ${fonts}` : fonts, fontWeight: String(look === 'whisper' ? Math.min(p.weight, 400) : p.weight), fontSize: `${px.toFixed(1)}px`, opacity: String(out),
      flexDirection: p.vertical ? 'column' : 'row', filter,
      transform: `translate(${(p.x * W).toFixed(1)}px, ${(p.y * H).toFixed(1)}px) translate(-50%, -50%) rotate(${p.tilt}deg) scale(${(1 + (1 - out) * 0.15).toFixed(4)})` });
    const side = ((p.spacing - 1 + (look === 'whisper' ? 0.5 : 0)) / 2) * px;
    s.chars.forEach((el, i) => {
      const l = letterAt(look, i, n, local, { gap: p.gap, shake: p.shake * u, px, W, spring }), climb = -(i - (n - 1) / 2) * p.rise * px;
      // the letter's own paint: fill, outline, shadows, and for the looks whose fill is a picture, the picture cut to the letter
      const clip = look === 'sparkle' || look === 'halftone', dot = 0.085 * px, ghost = (0.05 + 0.03 * Math.sin(local * TAU * 10 + i)) * px;
      const trail = (0.14 + 1.0 * (1 - clamp((local - i * p.gap * 0.6) / 0.22))) * px;
      cssCamel(el, {
        color: clip ? 'transparent' : look === 'tremble' ? p.color2 : look === 'rumble' ? p.ink : p.color,
        margin: p.vertical ? `${side.toFixed(1)}px 0` : `0 ${side.toFixed(1)}px`,
        webkitTextStroke: look === 'whisper' || clip ? '0' : look === 'tremble' ? `${(sw * 0.45).toFixed(1)}px ${p.ink}` : look === 'rumble' ? `${(sw * 0.4).toFixed(1)}px ${p.color}`
          : look === 'bubble' ? `${sw.toFixed(1)}px ${p.color2}` : `${sw.toFixed(1)}px ${p.ink}`,
        textShadow: look === 'pop' ? (d > 0 ? `${d.toFixed(1)}px ${d.toFixed(1)}px 0 ${p.ink}` : 'none')
          : look === 'tremble' ? `${ghost.toFixed(1)}px 0 0 ${withAlpha(p.color, 0.6)}, ${(-ghost).toFixed(1)}px 0 0 ${withAlpha(p.color, 0.6)}`
          : look === 'whisper' ? `0 0 ${(0.06 * px).toFixed(1)}px ${p.ink}, 0 0 ${(0.14 * px).toFixed(1)}px ${withAlpha(p.ink, 0.9)}, 0 0 ${(0.34 * px).toFixed(1)}px ${withAlpha(p.ink, 0.6)}`
          : look === 'zoom' ? [0.5, 0.35, 0.22, 0.12].map((a, j) => `${((-trail * (j + 1)) / 4).toFixed(1)}px 0 0 ${withAlpha(p.color, a)}`).join(', ')
          : look === 'rumble' ? `0 0 ${(0.18 * px).toFixed(1)}px ${p.color}, 0 0 ${(0.4 * px).toFixed(1)}px ${withAlpha(p.color, 0.6)}` : 'none',
        backgroundColor: look === 'halftone' ? p.color : 'transparent',
        backgroundImage: look === 'sparkle' ? `linear-gradient(180deg, ${p.color2} 12%, ${p.color} 62%)` : look === 'halftone' ? `radial-gradient(circle, ${p.color2} 0, ${p.color2} 26%, transparent 31%)` : 'none',
        backgroundSize: look === 'halftone' ? `${dot.toFixed(1)}px ${dot.toFixed(1)}px` : 'auto',
        webkitBackgroundClip: clip ? 'text' : 'border-box', backgroundClip: clip ? 'text' : 'border-box',
        visibility: l.show ? 'visible' : 'hidden', opacity: String(l.opacity),
        transform: `translate(${(l.x + (p.vertical ? -climb : 0)).toFixed(1)}px, ${(l.y + (p.vertical ? 0 : climb)).toFixed(1)}px) rotate(${l.rot.toFixed(2)}deg) skewX(${l.skew}deg) scale(${l.sx.toFixed(4)}, ${l.sy.toFixed(4)})`,
      });
    });
    s.extras.forEach((el, j) => {
      if (look === 'sparkle') {   // four-pointed glints around the word, each twinkling on its own beat once the letters are out
        const [gx, gy, size] = GLINTS[j], tw = Math.max(0, Math.sin(local * TAU * 0.9 + j * 1.7)) * clamp((local - 0.1 - j * 0.08) / 0.15);
        cssCamel(el, { display: 'block', left: `${gx * 100}%`, top: `${gy * 100}%`, right: 'auto', width: `${(size * px).toFixed(1)}px`, height: `${(size * px).toFixed(1)}px`, background: p.color2, clipPath: STAR, opacity: '1', borderRadius: '0',
          transform: `translate(-50%, -50%) rotate(${(local * 40 + j * 20).toFixed(1)}deg) scale(${Math.pow(tw, 0.6).toFixed(4)})` });
      } else if (look === 'zoom' && j < 3 && !p.vertical) {   // speed streaks trailing off to the left, long at the start and settling shorter
        const long = (1.5 - 0.7 * clamp(local / 0.5)) * px * [1, 0.65, 0.85][j], thick = 0.07 * px;
        cssCamel(el, { display: 'block', left: 'auto', right: '100%', top: `${[20, 52, 82][j]}%`, width: `${long.toFixed(1)}px`, height: `${thick.toFixed(1)}px`, clipPath: 'none', borderRadius: `${thick.toFixed(1)}px`,
          background: `linear-gradient(to left, ${p.color2}, ${withAlpha(p.color2, 0)})`, opacity: String(clamp(local / 0.1) * (0.9 - 0.4 * clamp((local - 0.4) / 0.6))), transform: `translate(${(-0.25 * px).toFixed(1)}px, -50%)` });
      } else cssCamel(el, { display: 'none' });
    });
  },
};
