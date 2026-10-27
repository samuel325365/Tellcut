// common.outro — an end card that sends viewers on: a paper page, a few big lines stamped down one per beat (【word】 on an
// accent chip), a row of numbered dots (the last ones still ?), and a hand-drawn arrow drawn to the link that bounces on
// the beat. Promoted from the zhongli-food short's fx.outro; for any short that points to the full video, a profile or a link.
// look 'credits' (the katie-sweet16 short's fx.keepsake): a celebration's closing credits — the lines fade up one a beat over a soft dark
// veil, plain lines bold, *lines in stars* italic in the highlight colour, _lines in underscores_ small and letter-spaced.
// look 'episode' (the amber-podcast short's fx.endCard): a show's end card — the show's name in big serif lines over an accent rule,
// a rounded 16:9 window with a play button (the clip on the track below plays through it: frame = outroWindow(params, W, H)), the
// episode line, a button and a small credit line, all on the ink colour.
import { clamp, cssCamel, defaultSafe, eBack, eOut3 as eOut, h, prog, withDefaults, type ItemType, type Theme } from '@tellcut/engine';
import { canvasAt, penPath, freeCanvas } from './inkline.ts';
import { emParts, fitPx, nl } from './text.ts';
import { withAlpha } from './color.ts';
import { asFrame, punch } from './window.ts';

interface P {
  lines: string; cta: string; tipX: number; tipY: number; dots: number; hidden: number; beat: number; x: number; cover: number;
  font: string; lineFont: string; paper: string; ink: string; accent: string; hl: string; look: 'cta' | 'credits' | 'episode'; y: number; ep: string; credit: string;
}
interface Ep { box: HTMLElement; show: HTMLElement; rule: HTMLElement; win: HTMLElement; play: HTMLElement; tri: HTMLElement; ep: HTMLElement; btn: HTMLElement; credit: HTMLElement }
interface S { bg: HTMLElement; cv: HTMLCanvasElement; lines: HTMLElement[]; dots: HTMLElement[]; cta: HTMLElement; key: string; cred: HTMLElement; ckey: string; veil: HTMLElement; epi: Ep }

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
  doc: '片尾導流卡：紙色底，幾行大字跟著拍子一行一行蓋下來（【詞】放進主色小牌），下面一排編號圓點（最後幾個打問號），手繪箭頭畫向連結並隨拍點彈跳；導去原片、主頁、留言、下一集；look credits 是慶生、婚禮、畢業的片尾感謝名單：lines 每行一拍淡入（*星號包住* 的行是高亮色斜體、_底線包住_ 的行是加寬字距的小字，其他是粗體名字），字後面一層暗色薄紗（cover 調濃淡），y 是名單中心的高度；片頭的名字用 common.headline 的 look name；look episode 是節目（Podcast、訪談、系列）的片尾卡：深色底（ink，cover 調濃淡）上 lines 是襯線大字節目名、主色短線，中間一個圓角 16:9 影片窗加播放鍵（洞，主軌片段 frame＝outroWindow(參數, W, H)），下面 ep 集數、cta 主色按鈕、credit 授權小字，一層一層浮上來；y 是整組的中心',
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
    { key: 'hl', label: '問號顏色（credits：*斜體行* 的顏色）', type: 'color', default: '#f0b429', theme: 'palette.hl' },
    { key: 'look', label: '樣子（cta 導流卡；credits 慶生、婚禮的片尾名單：每行一拍淡入，*星號包住* 的行是高亮色斜體、_底線包住_ 的行是加寬字距的小字，其他是粗體名字；cover 是字後面暗色薄紗的濃度；episode 節目片尾卡：lines 節目名、16:9 影片窗、ep 集數、cta 按鈕、credit 小字）', type: 'enum', options: ['cta', 'credits', 'episode'], default: 'cta' },
    { key: 'y', label: '名單／整組中心的高度（credits、episode；畫面高比例，-1＝安全區正中間）', type: 'number', min: -1, max: 1, step: 0.005, default: -1 },
    { key: 'ep', label: '集數（episode；影片窗下面一行主色字，空＝沒有）', type: 'string', default: 'Episode 12' },
    { key: 'credit', label: '授權小字（episode；最下面一行，空＝沒有）', type: 'string', default: '' },
  ],
  build(ctx) {
    const bg = h('div', null, null, ctx.root), cv = h('canvas', null, null, ctx.root), cta = h('div', null, null, ctx.root);
    cssCamel(bg, { position: 'absolute', inset: '0' });
    cssCamel(cv, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%' });
    cssCamel(cta, { position: 'absolute', whiteSpace: 'pre', lineHeight: '1', transformOrigin: '0 50%', fontWeight: '900' });
    const veil = h('div', null, null, ctx.root), cred = h('div', null, null, ctx.root);
    cssCamel(veil, { position: 'absolute', inset: '0', display: 'none', background: 'radial-gradient(ellipse at 50% 50%, rgba(8,6,14,0.75), rgba(8,6,14,0.35))' });
    cssCamel(cred, { position: 'absolute', left: '0', right: '0', display: 'none', flexDirection: 'column', alignItems: 'center', textAlign: 'center' });
    const box = h('div', null, null, ctx.root), show = h('div', null, null, box), rule = h('div', null, null, box), win = h('div', null, null, box), play = h('div', null, null, win);
    const tri = h('div', null, null, play), ep = h('div', null, null, box), btn = h('div', null, null, box), credit = h('div', null, null, box);
    cssCamel(box, { position: 'absolute', inset: '0', display: 'none' });
    for (const e of [show, rule, win, ep, btn, credit]) cssCamel(e, { position: 'absolute' });
    for (const e of [show, ep, btn, credit]) cssCamel(e, { left: '0', right: '0', textAlign: 'center', whiteSpace: 'pre' });
    cssCamel(show, { fontWeight: '900', lineHeight: '1.077' });
    cssCamel(win, { boxSizing: 'border-box' });
    cssCamel(play, { position: 'absolute', left: '50%', top: '50%', borderRadius: '50%', boxSizing: 'border-box', transform: 'translate(-50%, -50%)' });
    cssCamel(tri, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', clipPath: 'polygon(37% 27%, 76% 50%, 37% 73%)' });
    cssCamel(btn, { left: '50%', right: 'auto', transform: 'translateX(-50%)', fontWeight: '700', lineHeight: '1', display: 'flex', alignItems: 'center', justifyContent: 'center' });
    return { bg, cv, lines: [], dots: [], cta, key: '', cred, ckey: '', veil, epi: { box, show, rule, win, play, tri, ep, btn, credit } };
  },
  hide(s) { freeCanvas(s.cv); },
  draw(ctx, s) {
    const credits = ctx.params.look === 'credits', episode = ctx.params.look === 'episode';
    cssCamel(s.cred, { display: credits ? 'flex' : 'none' });
    cssCamel(s.veil, { display: credits ? 'block' : 'none' });
    cssCamel(s.epi.box, { display: episode ? 'block' : 'none' });
    if (!episode && s.bg.style.maskImage && s.bg.style.maskImage !== 'none') punch(s.bg, null);
    if (credits) { drawCredits(ctx, s); return; }
    if (episode) { drawEpisode(ctx, s); return; }
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
    cssCamel(s.bg, { display: 'block', background: p.paper, opacity: String(prog(local, 0, 0.2) * clamp(p.cover)),
      backgroundImage: `radial-gradient(${withAlpha(p.ink, 0.08)} ${2.2 * u}px, transparent ${2.6 * u}px)`, backgroundSize: `${34 * u}px ${34 * u}px` });
    // the lines land one a beat: big and tilted first, then settled
    const room = W * (1 - 2 * theme.safe.side);
    s.lines.forEach((d, i) => {
      const q = prog(local, 0.15 + i * p.beat, 0.15 + i * p.beat + 0.22), plain = texts[i].replace(/[【】]/g, ''), big = texts[i].includes('【');
      cssCamel(d, { display: 'block', left: `${cx}px`, top: `${L.top + i * LINE * u}px`, color: p.ink, fontFamily: `'${p.lineFont}', 'Noto Serif TC', serif`,
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

// ---- look credits ------------------------------------------------------------------------------------------------------------------
export type CreditKind = 'name' | 'italic' | 'small';
/** one credits line: "*with love*" italic, "_Music: …_" small, anything else a name */
export function creditLine(line: string): { kind: CreditKind; text: string } {
  const t = line.trim();
  if (t.length > 2 && t.startsWith('*') && t.endsWith('*')) return { kind: 'italic', text: t.slice(1, -1).trim() };
  if (t.length > 2 && t.startsWith('_') && t.endsWith('_')) return { kind: 'small', text: t.slice(1, -1).trim() };
  return { kind: 'name', text: t };
}
/** how far credits line i has faded up at `local`: 0.3 s in, one a beat, each over 0.9 s */
export const creditIn = (i: number, local: number, beat: number) => eOut(prog(local, 0.3 + i * beat, 1.2 + i * beat));

/** the credits' serif: Playfair Display unless the line font was changed from the default */
const creditFace = (font: string) => (font === 'Noto Serif TC' ? 'Playfair Display' : font);

function drawCredits(ctx: Parameters<typeof outro.draw>[0], s: S) {
  const p = ctx.params, { W, H, theme, local, dur } = ctx, u = Math.min(W, H) / 1080, room = W * (1 - 2 * theme.safe.side);
  for (const el of [...s.lines, ...s.dots]) cssCamel(el, { display: 'none' });
  cssCamel(s.cta, { display: 'none' });
  freeCanvas(s.cv);
  const lines = outroLines(p.lines).map(creditLine), out = 1 - prog(local, dur - 0.4, dur);
  // a soft dark veil so the words read on any picture: cover sets how dark
  cssCamel(s.bg, { display: 'none' });
  cssCamel(s.veil, { opacity: String(clamp(p.cover) * 0.75 * prog(local, 0, 0.6) * out) });
  const key = JSON.stringify(lines);
  if (s.ckey !== key) {   // one div a line, rebuilt only when the lines change
    s.ckey = key;
    s.cred.replaceChildren(...lines.map((l) => { const d = h('div'); d.textContent = l.text; cssCamel(d, { whiteSpace: 'pre', lineHeight: '1.2' }); return d; }));
  }
  const serif = `'${creditFace(p.lineFont)}', 'Noto Serif TC', serif`;
  ([...s.cred.children] as HTMLElement[]).forEach((d, i) => {
    const l = lines[i], q = creditIn(i, local, p.beat), base = l.kind === 'name' ? 54 : l.kind === 'italic' ? 50 : 46;
    cssCamel(d, { fontFamily: l.kind === 'small' ? `'Cormorant Garamond', ${serif}` : serif, fontWeight: l.kind === 'name' ? '700' : '500',
      fontStyle: l.kind === 'italic' ? 'italic' : 'normal', fontSize: `${fitPx(l.text, base * u, room).toFixed(2)}px`, color: l.kind === 'italic' ? p.hl : p.paper,
      letterSpacing: l.kind === 'small' ? `${(3 * u).toFixed(2)}px` : 'normal', marginTop: i ? `${((l.kind === 'small' ? 10 : 16) * u).toFixed(1)}px` : '0',
      textShadow: `0 0 ${(18 * u).toFixed(1)}px rgba(6,4,14,0.95), 0 ${(2 * u).toFixed(1)}px ${(6 * u).toFixed(1)}px rgba(6,4,14,0.8)`,
      opacity: String(q * (l.kind === 'small' ? 0.88 : 1)), transform: `translateY(${((1 - q) * 12 * u).toFixed(2)}px)` });
  });
  const cy = p.y >= 0 ? p.y * H : ((theme.safe.top + 1 - theme.safe.bottom) / 2) * H;
  cssCamel(s.cred, { top: `${cy.toFixed(1)}px`, transform: 'translateY(-50%)', opacity: String(out) });
}

// ---- look episode ------------------------------------------------------------------------------------------------------------------
/** episode: where everything goes, px — u (one pixel of the 1080-wide original, shrunk so the whole stack fits the safe height and the
 *  window the width), the show lines' top, the rule, the 16:9 window [x, y, w, h], the episode line, the button and the credit line;
 *  `y` the stack's centre (a share of the frame height, −1 the middle of the safe area) */
export function episodeLayout(o: { lines: number; ep: boolean; cta: boolean; credit: boolean; y: number }, W: number, H: number, safe: { top: number; bottom: number }) {
  const n = Math.max(0, o.lines), head = n ? n * 112 + 14 + 5 + 44 : 0;
  const below = (o.ep ? 98 : 0) + (o.cta ? (o.ep ? 30 : 40) + 96 : 0) + (o.credit ? 40 + 53 : 0), stack = head + 540 + below;
  const u0 = Math.min(W, H) / 1080, room = H * (1 - safe.top - safe.bottom), u = u0 * Math.min(1, room / (stack * u0), (0.9 * W) / (960 * u0));
  const cy = o.y >= 0 ? o.y * H : ((safe.top + 1 - safe.bottom) / 2) * H, top = cy - (stack * u) / 2, wy = top + head * u;
  const win: [number, number, number, number] = [(W - 960 * u) / 2, wy, 960 * u, 540 * u];
  let y = wy + 540 * u;
  const epY = o.ep ? y + 40 * u : y; if (o.ep) y += 98 * u;
  const btnY = o.cta ? y + (o.ep ? 30 : 40) * u : y; if (o.cta) y = btnY + 96 * u;
  return { u, top, ruleY: top + (n * 112 + 14) * u, win, epY, btnY, creditY: y + 40 * u };
}

/** the window of look episode as the clip's `frame` (fractions); `params` as given to the item (the rest are the defaults) */
export function outroWindow(params: Partial<P> = {}, W = 1080, H = 1920, safe?: Theme['safe']) {
  const p = withDefaults(outro.params, params as Record<string, unknown>) as P;
  return asFrame(episodeLayout(episodeOpts(p), W, H, safe ?? defaultSafe(W, H)).win, W, H);
}
const episodeOpts = (p: P) => ({ lines: outroLines(p.lines).length, ep: !!p.ep, cta: !!p.cta, credit: !!p.credit, y: p.y });

function drawEpisode(ctx: Parameters<typeof outro.draw>[0], s: S) {
  const p = ctx.params, { W, H, theme, local, dur } = ctx, e = s.epi, L = episodeLayout(episodeOpts(p), W, H, theme.safe), u = L.u, room = W * (1 - 2 * theme.safe.side);
  for (const el of [...s.lines, ...s.dots]) cssCamel(el, { display: 'none' });
  cssCamel(s.cta, { display: 'none' });
  freeCanvas(s.cv);
  const [wx, wy, ww, wh] = L.win, step = (d: number) => eOut(prog(local, d, d + 0.5)), out = 1 - prog(local, dur - 0.3, dur);
  // the card: ink with a soft glow of the accent from the top, a rounded hole for the window
  cssCamel(s.bg, { display: 'block', background: p.ink, backgroundImage: `radial-gradient(ellipse at 50% 0%, ${withAlpha(p.accent, 0.16)}, transparent 62%)`, backgroundSize: 'auto', opacity: String(prog(local, 0, 0.2) * clamp(p.cover) * out) });
  punch(s.bg, [wx, wy, ww, wh], 26 * u);
  cssCamel(e.box, { opacity: String(out) });
  // the window's edge and the play button
  const a0 = step(0);
  cssCamel(e.win, { left: `${wx}px`, top: `${wy}px`, width: `${ww}px`, height: `${wh}px`, borderRadius: `${26 * u}px`, border: `${3 * u}px solid ${withAlpha(p.paper, 0.85)}`, opacity: String(a0) });
  cssCamel(e.play, { width: `${132 * u}px`, height: `${132 * u}px`, background: withAlpha(p.ink, 0.55), border: `${3 * u}px solid ${withAlpha(p.paper, 0.9)}` });
  cssCamel(e.tri, { background: p.paper });
  // the show's name over the accent rule
  const lines = outroLines(p.lines).map((l) => l.replace(/[【】]/g, '')), serif = `'${creditFace(p.lineFont)}', 'Noto Serif TC', serif`, sans = `'${p.font}', 'Noto Sans TC', sans-serif`;
  const a1 = step(0.05), fs = Math.min(104 * u, ...lines.map((l) => fitPx(l, 104 * u, room)));
  e.show.textContent = lines.join('\n');
  cssCamel(e.show, { display: lines.length ? 'block' : 'none', top: `${L.top}px`, fontFamily: serif, fontSize: `${fs.toFixed(2)}px`, lineHeight: `${112 * u}px`, color: p.paper,
    opacity: String(a1), transform: `translateY(${((1 - a1) * 24 * u).toFixed(2)}px)` });
  cssCamel(e.rule, { display: lines.length ? 'block' : 'none', left: `${W / 2 - 60 * u}px`, top: `${L.ruleY}px`, width: `${120 * u}px`, height: `${5 * u}px`, background: p.accent,
    opacity: String(a1), transform: `translateY(${((1 - a1) * 24 * u).toFixed(2)}px)` });
  // the episode line, the button, the credit line
  const a2 = step(0.25), a3 = step(0.4), a4 = step(0.6);
  e.ep.textContent = p.ep;
  cssCamel(e.ep, { display: p.ep ? 'block' : 'none', top: `${L.epY}px`, fontFamily: sans, fontWeight: '600', fontSize: `${fitPx(p.ep, 48 * u, room).toFixed(2)}px`, lineHeight: '1.2', color: p.accent,
    opacity: String(a2), transform: `translateY(${((1 - a2) * 20 * u).toFixed(2)}px)` });
  e.btn.textContent = p.cta;
  const bs = fitPx(p.cta, 50 * u, room - 90 * u);
  cssCamel(e.btn, { display: p.cta ? 'flex' : 'none', top: `${L.btnY}px`, height: `${96 * u}px`, padding: `0 ${45 * u}px`, borderRadius: `${48 * u}px`, background: p.accent, color: p.ink,
    fontFamily: sans, fontSize: `${bs.toFixed(2)}px`, opacity: String(a3), transform: `translateX(-50%) translateY(${((1 - a3) * 20 * u).toFixed(2)}px)` });
  e.credit.textContent = p.credit;
  cssCamel(e.credit, { display: p.credit ? 'block' : 'none', top: `${L.creditY}px`, fontFamily: sans, fontWeight: '400', fontSize: `${fitPx(p.credit, 44 * u, room).toFixed(2)}px`, lineHeight: '1.2', color: p.paper,
    opacity: String(a4 * 0.8) });
}
