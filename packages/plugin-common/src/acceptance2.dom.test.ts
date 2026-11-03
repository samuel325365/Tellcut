// @vitest-environment jsdom
// 2026-11-02, second round of the preset-acceptance films' own fx, promoted: common.tabletop (fx.steeltable), common.bounce (fx.words),
// common.header's shade (fx.topshade) and common.headline's roll entrance and strike (fx.rollLine / fx.strikeLine). jsdom has no
// layout and no 2D context: the tests read what cssCamel last wrote (`_c`) and the canvas is a stand-in.
import { motion, resolveTheme, withDefaults, type ItemType } from '@tellcut/engine';
import { tableColor, tabletop } from './tabletop.ts';
import { bounce, charPose, parseBounce, sinkAt } from './bounce.ts';
import { header, topShade } from './header.ts';
import { faceWeight } from './text.ts';
import { headline, rollChar, strikeChar } from './headline.ts';

const anything: any = new Proxy(function () {}, {
  get: (_t, k) => (k === Symbol.toPrimitive ? () => 0 : k === 'then' ? undefined : k === 'width' ? 10 : anything),
  apply: () => anything, construct: () => anything, set: () => true,
});
const real = { getContext: HTMLCanvasElement.prototype.getContext };
beforeAll(() => { (HTMLCanvasElement.prototype as any).getContext = function () { return new Proxy(anything, { get: (t, k) => (k === 'canvas' ? this : t[k]) }); }; });
afterAll(() => Object.assign(HTMLCanvasElement.prototype, real));

/** build and draw a block alone on a W×H frame at `local`; the words it reported drawing on a canvas */
function run<S>(type: ItemType<any, S>, params: Record<string, unknown>, local: number, W = 1080, H = 1920, dur = 4) {
  const theme = resolveTheme(undefined, { width: W, height: H }), root = document.createElement('div'), said: string[] = [];
  const item: any = { id: 'x', type: type.type, start: 0, end: dur, params };
  const project: any = { version: 1, meta: { width: W, height: H, fps: 30, duration: dur, background: '#000', plugins: [] }, sources: {}, media: {}, grids: [], tracks: [] };
  const ctx: any = { t: local, local, dur, item, params: withDefaults(type.params, params, theme), root, top: document.createElement('div'), project, media: {}, W, H, fps: 30, theme, grades: {}, motion,
    reportText: (a: { text?: string }, text?: string) => said.push(typeof text === 'string' ? text : a.text!) };
  const s = type.build(ctx);
  type.draw(ctx, s);
  return { s: s as any, ctx, said, root };
}
const css = (el: Element) => (el as any)._c as Record<string, string>;

describe('common.tabletop', () => {
  test('a static scene: steel by default, the grill off, each look its own colour unless one is given', () => {
    expect([tabletop.kind, tabletop.category]).toEqual(['scene', 'look']);
    const d = withDefaults(tabletop.params, {}, resolveTheme(undefined, { width: 1080, height: 1920 }));
    expect([d.look, d.grill]).toEqual(['steel', false]);
    expect(tableColor({ look: 'steel', color: '' })).toBe('#7c838b');
    expect(tableColor({ look: 'wood', color: '' })).toBe('#86603f');
    expect(tableColor({ look: 'wood', color: '#334455' })).toBe('#334455');
  });
  test('painted once: a later frame with the same params does not repaint, a changed param does', () => {
    const { s, ctx } = run(tabletop, { grill: true }, 0);
    const key = s.key;
    expect(key).not.toBe('');
    tabletop.draw({ ...ctx, local: 3, t: 3 }, s);
    expect(s.key).toBe(key);
    tabletop.draw({ ...ctx, params: { ...ctx.params, look: 'wood' } }, s);
    expect(s.key).not.toBe(key);
  });
});

describe('common.bounce', () => {
  test('a line is "seconds|text|size|colour|x|y|mode|options"; 【】 marks stressed characters; blank fields take defaults', () => {
    const [a, b] = parseBounce('0.2|要【快】|180|hl|0.3|0.7|sway|jump=1/2；out=3\n1|走\n\nx|不算');
    expect(a).toMatchObject({ at: 0.2, text: '要快', size: 180, color: 'hl', x: 0.3, y: 0.7, mode: 'sway', kv: { jump: '1/2', out: '3' } });
    expect(a.chars).toEqual([{ ch: '要', em: false }, { ch: '快', em: true }]);
    expect(b).toMatchObject({ at: 1, text: '走', size: 200, color: '', x: 0.5, y: 0.5, mode: 'drop', kv: {} });
    expect(parseBounce('0|字|100||||spin')[0].mode).toBe('drop');
  });
  test('each mode enters from its own pose and lands; out pops it away; jump hops; sink drops the stressed ones', () => {
    const it = (mode: string, extra = '') => parseBounce(`1|字字|200||0.5|0.5|${mode}|${extra}`)[0];
    expect(charPose(it('drop'), 0, 0.9, motion)).toBeNull();
    expect(charPose(it('drop'), 0, 1.02, motion)!.dy).toBeLessThan(-100);
    expect(Math.abs(charPose(it('drop'), 0, 3, motion)!.dy)).toBeLessThan(2);
    expect(charPose(it('pop'), 0, 1.0, motion)!.sx).toBeCloseTo(0, 1);
    expect(charPose(it('pop'), 0, 3, motion)!.sx).toBeCloseTo(1, 1);
    expect(charPose(it('slam'), 0, 1.01, motion)!.sx).toBeGreaterThan(1.5);
    expect(charPose(it('float'), 0, 1.05, motion)!.dy).toBeGreaterThan(50);
    expect(charPose(it('knock'), 1, 1.0, motion)).toBeNull();   // the second character waits for the stagger
    expect(charPose(it('pop', 'out=2'), 0, 2.5, motion)!.sx).toBe(0);
    expect(charPose(it('pop', 'jump=2'), 0, 2.27, motion)!.dy).toBeLessThan(-100);
    expect(sinkAt(1, 0, 0.9).dy).toBe(0);
    expect(sinkAt(1, 0, 1.5).dy).toBeGreaterThan(sinkAt(1, 0, 1.2).dy);
  });
  test('draw(t) is the same at the same t, and each phrase on screen is reported for check (one box a phrase)', () => {
    expect(run(bounce, {}, 0.05).said).toEqual([]);
    expect(run(bounce, {}, 1.5).said).toEqual(['出發！', '就是現在']);
    expect(run(bounce, { items: '0|挖空|300||0.5|0.5|knock' }, 1).said).toEqual(['挖空']);
    // sunk characters gone below the frame are not counted
    expect(run(bounce, { items: '0|【掉】|300||0.5|0.5|pop|sink=0.5' }, 3).said).toEqual([]);
  });
  test('knock phrases share one sheet with all their holes, drawn before the other phrases (2026-11-03)', () => {
    // the canvas calls in order: the sheet is a fillRect in the sheet colour, a letter a fillText
    const { s, ctx } = run(bounce, { items: '0|上面|200||0.5|0.25|pop\n0|挖空|300||0.5|0.5|knock\n0|再挖|300||0.5|0.75|knock', sheet: '#123456' }, 2);
    const log: string[] = [], own: Record<string, unknown> = { fillRect: () => log.push('rect ' + own.fillStyle), fillText: (ch: string) => log.push(ch + ' ' + own.globalCompositeOperation) };
    own.globalCompositeOperation = 'source-over';
    const g = new Proxy(anything, { get: (t, k) => (k in own ? own[k as string] : t[k]), set: (_t, k, v) => { own[k as string] = v; return true; } });
    s.cv.getContext = () => g;
    bounce.draw(ctx, s);
    expect(log.filter((x) => x === 'rect #123456')).toHaveLength(1);
    const sheet = log.indexOf('rect #123456');
    expect(['挖 destination-out', '空 destination-out', '再 destination-out'].map((x) => log.indexOf(x)).every((i) => i > sheet)).toBe(true);
    expect(log.indexOf('上 source-over')).toBeGreaterThan(log.indexOf('再 destination-out'));
  });
  test('ready loads the weight draw uses for its own font and the Noto Sans TC fallback alike', async () => {
    const loads: string[] = [], was = Object.getOwnPropertyDescriptor(document, 'fonts');
    Object.defineProperty(document, 'fonts', { configurable: true, value: { load: async (f: string) => { loads.push(f); return []; }, [Symbol.iterator]: function* () { yield { family: 'Inter', weight: '100 700' }; } } });
    try { await bounce.ready!({ cv: null as any, words: '字', font: 'Inter' }); } finally { was ? Object.defineProperty(document, 'fonts', was) : delete (document as any).fonts; }
    expect(loads).toEqual(['700 120px "Inter"', '700 120px "Noto Sans TC"']);
  });
  test('a family without 900 is drawn at the heaviest weight it has, not the fake bold that rings knock holes', () => {
    const faces = [{ family: 'Huninn', weight: '400' }, { family: '"Noto Sans TC"', weight: '500' }, { family: 'Noto Sans TC', weight: '900' }, { family: 'Inter', weight: '100 900' }];
    expect(faceWeight('Huninn', 900, faces)).toBe(400);
    expect(faceWeight('Noto Sans TC', 900, faces)).toBe(900);
    expect(faceWeight('Noto Sans TC', 700, faces)).toBe(500);
    expect(faceWeight('Noto Sans TC', 300, faces)).toBe(500);
    expect(faceWeight('Inter', 900, faces)).toBe(900);
    expect(faceWeight('Arial', 900, faces)).toBe(900);
  });
});

describe('common.header shade', () => {
  test('off by default; when set, a dark gradient over the top that fades in and out with the item', () => {
    expect(topShade(0, 1, 4)).toBeNull();
    expect(topShade(0.8, 0, 4)).toBeNull();
    expect(topShade(0.8, 1, 4)).toContain('rgba(11,9,8,0.800)');
    expect(topShade(0.8, 0.15, 4)).toContain('rgba(11,9,8,0.400)');
    expect(css(run(header, {}, 1).s.shade).display).toBe('none');
    const on = run(header, { look: 'kicker', shade: 0.8, shadeH: 0.25 }, 1).s.shade;
    expect(css(on)).toMatchObject({ display: 'block', height: '480.0px' });
    expect(css(on).background).toContain('linear-gradient');
  });
});

describe('common.headline roll and strike', () => {
  test('roll: each character unrolls from narrow, one after another', () => {
    expect(rollChar(0, 0.2)).toEqual({ sx: 0.4, sy: 1.15, a: 0 });
    expect(rollChar(0, 1)).toEqual({ sx: 1, sy: expect.closeTo(1, 9), a: 1 });
    expect(rollChar(3, 0.6).a).toBe(0);   // the fourth starts at 0.64 s
  });
  test('strike: the line runs through the characters from `from` over a second, then they fade to 0.28', () => {
    expect(strikeChar(1, 2, 6, 1, 3)).toEqual({ line: 0, fade: 1 });
    expect(strikeChar(2, -1, 6, 1, 3)).toEqual({ line: 0, fade: 1 });
    expect(strikeChar(2, 2, 6, 1, 0.9)).toEqual({ line: 0, fade: 1 });
    expect(strikeChar(5, 2, 6, 1, 1.5).line).toBeLessThan(strikeChar(2, 2, 6, 1, 1.5).line);
    expect(strikeChar(5, 2, 6, 1, 3)).toEqual({ line: 1, fade: expect.closeTo(0.28, 5) });
  });
  test('the default card is one text node as before; roll and strike set the characters one span each', () => {
    expect(run(headline, { text: '一行字' }, 1).s.main.children.length).toBe(0);
    const rolled = run(headline, { text: '一行\n字', enter: 'roll' }, 0.5).s.main;
    expect(rolled.children.length).toBe(3);
    expect(css(rolled.children[0]).display).toBe('inline-block');
    const struck = run(headline, { text: '不加色素', strikeFrom: 2, strikeAt: 0.5 }, 3).s.main;
    expect([...struck.children].map((c) => css(c).backgroundSize.split(' ')[0])).toEqual(['0.00%', '0.00%', '100.00%', '100.00%']);
    expect(css(struck.children[3]).color).toMatch(/rgba\(.*0\.28/);
  });
});
