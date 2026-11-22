// common.progress runner (spec 2026-11-22, progress characters): a thin track along the safe edge, filled up to a runner (an emoji,
// 🐕 by default, or a picture of the project's) that hops along it — one hop every `thickness × 6`, squashed a little as it lands —
// towards a goal at the right end (🏁 by default; `none` for none), which bounces once the runner is there. Both are DOM, so check
// measures them. Most emoji face left (Windows' and Apple's alike), so the runner is mirrored to run right unless it is one of the few
// that face right already (FACES_RIGHT); `flip` turns either way round. A picture is never mirrored unless `flip` says so.
import { abs, clamp, cssCamel, graphemes, prog } from '@tellcut/engine';
import { EMOJI_STACK } from '../text.ts';
import { arrived, band, tail, travel, type Draw, type More } from './shared.ts';

const RUNNER = '🐕', GOAL = '🏁';
/** the runner's height, in thicknesses (times iconSize): 72 px at the default 12 on a 1080 short side; 4.5 left the dog a speck */
const RUNNER_SIZE = 6;

/** emoji that already face right (or up, or are symmetric) as Segoe UI Emoji draws them, without their variation selector: looked at
 *  on Windows — its 🚁, 🚤 and 🏃 face left, unlike their usual description. Any "facing right" ZWJ sequence (🏃‍➡️) counts too. */
export const FACES_RIGHT: ReadonlySet<string> = new Set(['🚀', '✈', '🛩', '🛸', '🎈', '🛼']);

/** a path or a file name (has a slash or an extension), not an emoji */
export const isPicture = (v: string): boolean => {
  const s = String(v ?? '').trim();
  return /[\\/]/.test(s) || /\.[a-z0-9]{2,5}$/i.test(s);
};

/** the first grapheme of `v`, or `fallback` when empty */
export const glyphOf = (v: string, fallback: string): string => graphemes(String(v ?? '').trim())[0] ?? fallback;

/** an emoji without its variation selector and skin tone: what FACES_RIGHT lists */
const bare = (g: string) => g.replace(/[\uFE0F\u{1F3FB}-\u{1F3FF}]/gu, '');
const facesRight = (v: string) => {
  if (isPicture(v)) return true;
  const g = bare(glyphOf(v, RUNNER));
  return FACES_RIGHT.has(g) || g.includes('\u200D\u27A1');
};

/** whether the runner is drawn mirrored: emoji mirror unless in FACES_RIGHT, pictures never; `flip` reverses either */
export function mirrored(v: string, flip: boolean): boolean {
  const right = facesRight(v);
  return flip ? right : !right;
}

/** the hop at `dist` px travelled, one step every `stride` px: lift 0…1 (0 on the ground), squash 0…1 (1 at landing) */
export function hopAt(dist: number, stride: number): { lift: number; squash: number } {
  if (!(stride > 0) || !Number.isFinite(dist)) return { lift: 0, squash: 0 };
  const f = (((dist / stride) % 1) + 1) % 1, lift = Math.sin(Math.PI * f);
  return { lift, squash: Math.pow(1 - lift, 4) };
}

/** a character or a goal (runner's, fuse's): a box `m.el[name]` standing on its bottom centre, holding the emoji `m.el[name + 'Text']`
 *  (for a picture, the default emoji to fall back on) and the picture's <img> `m.el[name + 'Img']`, which starts loading here so
 *  ready() can wait for it (picturesReady). `pole`: an element `m.el[name + 'Pole']` too, hidden until the mode shows it. */
export function piece(m: More, name: string, value: string, fallback: string, fileUrl: (p: string) => string, pole = false) {
  const box = abs(m.root, { transformOrigin: '50% 100%' }), v = String(value ?? '').trim(), pic = isPicture(v);
  box.dataset.part = name;
  if (pic) {
    const img = abs(box, { left: '0', top: '0', width: '100%', height: '100%', objectFit: 'contain', objectPosition: '50% 100%', display: 'none' }, 'img');
    img.alt = '';
    img.src = fileUrl(v);
    m.el[`${name}Img`] = img;
  }
  if (pole) m.el[`${name}Pole`] = abs(box, { left: '0', bottom: '0', display: 'none' });
  const text = abs(box, { left: '0', whiteSpace: 'pre', lineHeight: '1', fontFamily: `${EMOJI_STACK}, sans-serif` }, 'span');
  text.textContent = pic ? fallback : glyphOf(v, fallback);
  m.el[name] = box; m.el[`${name}Text`] = text;
}

/** ItemType.ready for the pictures under `root`: waits for each to load; one that fails loses its src, so the player's strict check
 *  of an export's pictures passes it by and the mode draws its default emoji in its place (showPiece) */
export const picturesReady = (root: HTMLElement | null | undefined): Promise<void> =>
  Promise.all([...(root?.querySelectorAll('img') ?? [])].filter((i) => i.getAttribute('src'))
    .map((i) => (typeof i.decode === 'function' ? i.decode() : Promise.resolve()).catch(() => i.removeAttribute('src')))).then(() => {});

/** shows the picture once it has loaded, the emoji when there is none or it failed (nothing while it is still loading); whether the
 *  emoji shows, and whether that is because a picture failed */
export function showPiece(m: More, name: string): { emoji: boolean; failed: boolean } {
  const img = m.el[`${name}Img`] as HTMLImageElement | undefined;
  const ok = !!img && img.complete && img.naturalWidth > 0, failed = !!img && img.complete && !ok, emoji = !img || failed;
  if (img) cssCamel(img, { display: ok ? 'block' : 'none' });
  cssCamel(m.el[`${name}Text`], { display: emoji ? 'block' : 'none' });
  return { emoji, failed };
}

/** an emoji standing in its `px` box: its foot on the box's bottom (Segoe UI Emoji's animals and cars reach the em box's bottom),
 *  centred across it. The line is twice the box wide: Segoe's advance is 1.37 em with the picture in its middle, and a line too
 *  narrow for it is not centred but starts at the left, which put the emoji 0.09 em right of the box (past the right margin). */
export const standing = (text: HTMLElement, px: number) =>
  cssCamel(text, { top: 'auto', bottom: '0', left: '-50%', width: '200%', textAlign: 'center', fontSize: `${(px * 0.9).toFixed(2)}px` });

export const drawRunner: Draw = (ctx, p, m) => {
  const { W, H, local, dur } = ctx, k = Math.min(W, H) / 1080, th = Math.max(1, p.thickness * k);
  if (!m.el.track) {
    const track = abs(m.root, { overflow: 'hidden' });
    abs(track, { left: '0', top: '0', height: '100%' });
    m.el.track = track; m.el.fill = track.firstElementChild as HTMLElement;
    const goal = String(p.goal ?? '').trim();
    // the default flag (or a picture's fallback to it) gets a pole: Segoe UI Emoji's 🏁 is a chequered banner with none, which
    // would hang in the air at the end of the track
    if (goal.toLowerCase() !== 'none') piece(m, 'goal', goal, GOAL, (f) => ctx.media.fileUrl(f), !goal || isPicture(goal));
    piece(m, 'runner', String(p.runner ?? ''), RUNNER, (f) => ctx.media.fileUrl(f));
  }
  // the runner's size, and the room above it for its highest hop
  const ch = p.thickness * RUNNER_SIZE * Math.max(0.1, p.iconSize) * k, air = 0.35 * ch, gw = ch;
  const { x, w, top } = band(ctx, p, air + ch + th), ground = top + air + ch;
  // the runner's centre goes from the start to its nose at the goal (or to the end), kept clear of the side margins even squashed
  const x0 = x + ch * 0.56, gx = x + w - 0.625 * gw, end = m.el.goal ? gx - 0.5 * gw - 0.3 * ch : x + w - ch * 0.56, x1 = Math.max(x0, end);
  const u = travel(p.step, p.dots, local, dur), cx = x0 + (x1 - x0) * u, since = arrived(p.step, p.dots, local, dur);
  cssCamel(m.el.track, { left: `${x}px`, top: `${ground}px`, width: `${w}px`, height: `${th}px`, borderRadius: `${th / 2}px`, background: p.track });
  cssCamel(m.el.fill, { width: `${Math.max(0, cx - x).toFixed(2)}px`, background: p.color });
  if (m.el.goal) {
    const { emoji } = showPiece(m, 'goal'), text = m.el.goalText, pole = m.el.goalPole;
    if (pole && emoji) {
      // the default flag on a pole: the banner's top left corner (Segoe's chequer starts 0.19 em in, 0.21 em down) at the pole's top
      const pw = Math.max(2, 0.06 * gw), fs = 0.7 * gw;
      cssCamel(pole, { display: 'block', bottom: `${(-th / 2).toFixed(2)}px`, left: `${(0.2 * gw).toFixed(2)}px`, width: `${pw.toFixed(2)}px`, height: `${(gw + th / 2).toFixed(2)}px`, borderRadius: `${(pw / 2).toFixed(2)}px`, background: p.paper });
      cssCamel(text, { top: `${(-0.21 * fs).toFixed(2)}px`, bottom: 'auto', left: `${(0.2 * gw + pw - 0.19 * fs).toFixed(2)}px`, width: 'auto', textAlign: 'left', fontSize: `${fs.toFixed(2)}px` });
    } else {
      if (pole) cssCamel(pole, { display: 'none' });
      standing(text, gw);
    }
    // the arrival: a bounce up to 1.25 and back within 0.4 s, grown from its foot so it stays inside the right margin (gx leaves room)
    const pop = since >= 0 ? 1 + 0.25 * Math.sin(Math.PI * clamp(since / 0.4)) : 1;
    cssCamel(m.el.goal, { left: `${(gx - gw / 2).toFixed(2)}px`, top: `${(ground - gw).toFixed(2)}px`, width: `${gw.toFixed(2)}px`, height: `${gw.toFixed(2)}px`,
      transform: `scale(${pop.toFixed(4)})` });
  }
  // the hop: by the distance travelled (so a chapter carries on where the last one stopped); it settles on the ground once the
  // runner stops, and does not start squashed
  const dist = u * (x1 - x0), stride = p.thickness * 6 * k, stop = Math.max(0, dur - tail(dur)), still = prog(local, stop, stop + 0.15);
  const hop = hopAt(dist, stride), f = stride > 0 ? (((dist / stride) % 1) + 1) % 1 : 0, go = (1 - still) * clamp(dist / (stride * 0.25 || 1));
  const lift = hop.lift * (1 - still) * air, sq = hop.squash * go, tilt = -8 * Math.sin(2 * Math.PI * f) * (1 - still);
  const { failed } = showPiece(m, 'runner'), flipX = mirrored(failed ? RUNNER : String(p.runner ?? ''), !!p.flip) ? -1 : 1;
  standing(m.el.runnerText, ch);
  cssCamel(m.el.runner, { left: `${(cx - ch / 2).toFixed(2)}px`, top: `${(ground - ch).toFixed(2)}px`, width: `${ch.toFixed(2)}px`, height: `${ch.toFixed(2)}px`,
    transform: `translateY(${(-lift).toFixed(2)}px) rotate(${tilt.toFixed(2)}deg) scale(${(flipX * (1 + 0.08 * sq)).toFixed(4)}, ${(1 - 0.14 * sq).toFixed(4)})` });
};
