// @vitest-environment jsdom
// common.duo's header and text (acceptance films P1–P3, 2026-11-01): the default header put its chip and topic above the 9:16 safe
// area (under the platform's account name); a long question lost its last character, the "？", to the strip's edge (overflow
// hidden), and check did not see it; the small text had no size.
import { createRegistry, defaultSafe, Stage, textEm } from '@tellcut/engine';
import { duo, topicFit } from './duo.ts';

// jsdom has no 2D context (it says so on stderr): lines are measured by the estimate
const realGetContext = HTMLCanvasElement.prototype.getContext;
beforeAll(() => { (HTMLCanvasElement.prototype as any).getContext = () => null; });
afterAll(() => { HTMLCanvasElement.prototype.getContext = realGetContext; });

const media: any = { begin() {}, video: () => document.createElement('video'), place() {}, stillUrl: () => '', fileUrl: () => '', sync: async () => {}, image() {} };
const W = 1080, H = 1920;
const project = (params: Record<string, unknown>): any => ({
  version: 1, meta: { width: W, height: H, fps: 30, duration: 6, background: '#000', plugins: [] }, sources: {}, media: {}, grids: [],
  tracks: [{ id: 'o', kind: 'overlay', items: [{ id: 'd', type: 'common.duo', start: 0, end: 5, params }] }],
});
function draw(params: Record<string, unknown>, t = 0.6) {
  const root = document.createElement('div');
  const st = new Stage(root, createRegistry([{ id: 'common', items: [duo] } as any]), media);
  st.load(project(params));
  st.draw(t);
  const divs = [...root.querySelectorAll('div')] as HTMLElement[];
  const byText = (s: string) => divs.find((d) => d.children.length === 0 && d.textContent === s)!;
  return { divs, byText };
}
const px = (v: string) => parseFloat(v);

test('duo: the default header sits inside the 9:16 safe area (it began at 118 px, above the 221 px the account name takes)', () => {
  const { byText } = draw({});
  const head = byText('ROUND 1').parentElement!;
  expect(px(head.style.top)).toBeGreaterThanOrEqual(defaultSafe(W, H).top * H);
  // and still inside its strip, the panels starting below it
  expect(px(head.style.top) + px(head.style.height)).toBeLessThanOrEqual(0.16 * H);
});

test('duo: a long topic shrinks, then takes two lines, never wider than its room and never cut', () => {
  const est = (s: string, size: number) => textEm(s) * size;
  expect(topicFit('早起真的比較有效率？', 40, 700, est)).toEqual({ lines: ['早起真的比較有效率？'], px: 40 });   // fits: as it was
  const a = topicFit('早起真的比較有效率嗎還是更累呢？', 40, 560, est);              // 16 em: shrunk on one line
  expect(a.lines).toHaveLength(1);
  expect(a.px).toBeCloseTo(35, 6);
  const long = '他只是在 TikTok 放了自家養的雞，他們就把他的帳號封了？';
  const b = topicFit(long, 40, 560, est);
  expect(b.lines).toHaveLength(2);
  expect(b.lines.join('').replace(/\s/g, '')).toBe(long.replace(/\s/g, ''));        // every character kept, the ？ too
  for (const l of b.lines) expect(est(l, b.px)).toBeLessThanOrEqual(560 + 1e-6);
  expect(b.px).toBeLessThanOrEqual(30);
  // far too long for two lines at 3/4: still two lines, smaller
  const c = topicFit(long.repeat(3), 40, 560, est);
  expect(c.lines).toHaveLength(2);
  for (const l of c.lines) expect(est(l, c.px)).toBeLessThanOrEqual(560 + 1e-6);
  // in the block: no overflow hidden, the whole question in the topic, inside the strip's room
  const q = '你只是在 TikTok 放了自家養的雞，他們就把你的帳號封了？';
  const { divs } = draw({ topic: q });
  const topic = divs.find((d) => d.textContent?.replace(/\s/g, '') === q.replace(/\s/g, '') && d.children.length === 0)!;
  expect(topic).toBeTruthy();
  expect(topic.style.overflow).not.toBe('hidden');
  expect(topic.textContent!.endsWith('？')).toBe(true);
  const room = W - 54 - 130 - (textEm('ROUND 1') * 34 + 7 * 2 + 36 + 18);
  for (const l of topic.textContent!.split('\n')) expect(textEm(l) * px(topic.style.fontSize)).toBeLessThanOrEqual(room + 1);
});

test('duo: size scales the header and the name chips (default 1 = today\'s 40 / 36 px)', () => {
  const def = draw({});
  expect(def.byText('早起真的比較有效率？').style.fontSize).toBe('40px');
  expect(def.byText('阿明').style.fontSize).toBe('36px');
  expect(duo.params.find((p) => p.key === 'size')!.default).toBe(1);
  const big = draw({ size: 1.5, top: 0.2, topic: '早起有用？' });
  expect(big.byText('早起有用？').style.fontSize).toBe('60px');
  expect(big.byText('阿明').style.fontSize).toBe('54px');
  expect(big.byText('ROUND 1').style.fontSize).toBe('51px');
  expect(px(big.byText('阿明').parentElement!.style.height)).toBeCloseTo(93, 6);
  // solo's chips too
  const solo = draw({ mode: 'solo', size: 1.5, segs: '0-3|a' }, 1.2);
  expect(solo.byText('阿明').style.fontSize).toBe('54px');
});
