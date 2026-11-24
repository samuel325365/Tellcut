// @vitest-environment jsdom
// common.outro: the dashed line between the numbered dots is drawn the same on a page's first draw as after frames that drew the
// arrow (whose pen leaves the context's caps round): draw(t) is a pure function of t.
import { createRegistry, Stage, type ItemType } from '@tellcut/engine';
import { outro } from './outro.ts';

function recorder() {
  const log: Array<{ op: string; lineCap: unknown; lineJoin: unknown; dash: unknown }> = [];
  const st: Record<string, unknown> = { globalAlpha: 1, lineWidth: 1, lineCap: 'butt', lineJoin: 'miter', dash: [] };
  const g: any = new Proxy({}, {
    get: (_t, k) => (typeof k === 'symbol' ? undefined : k in st ? st[k as string]
      : (...args: unknown[]) => {
        if (k === 'setLineDash') st.dash = args[0];
        log.push({ op: String(k), lineCap: st.lineCap, lineJoin: st.lineJoin, dash: st.dash });
        return k === 'measureText' ? { width: 10 } : /^create\w*Gradient$/.test(String(k)) ? { addColorStop() {} } : undefined;
      }),
    set: (_t, k, v) => { st[k as string] = v; return true; },
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => g);
  return log;
}
afterEach(() => vi.restoreAllMocks());

const media: any = { begin() {}, place() {}, sync: async () => {}, image: () => document.createElement('img'), video: () => document.createElement('video'), stillUrl: () => '', fileUrl: (p: string) => p };
const stage = () => {
  const st = new Stage(document.createElement('div'), createRegistry([{ id: 'common', items: [outro as ItemType] }]), media, { onError: (_i, m) => { throw new Error(m); } });
  st.load({ version: 1, meta: { width: 1080, height: 1920, fps: 30, duration: 4, background: '#000', plugins: [] }, sources: {}, media: {}, grids: [],
    tracks: [{ id: 'o', kind: 'overlay', items: [{ id: 'x', type: 'common.outro', start: 0, end: 4, params: {} }] }] } as any);
  return st;
};
const dashes = (log: ReturnType<typeof recorder>) => log.filter((c) => c.op === 'stroke' && Array.isArray(c.dash) && (c.dash as number[]).length > 0).map((c) => [c.lineCap, c.lineJoin]);

test('the dashes between the dots have round caps on a fresh page and after frames that drew the arrow', () => {
  const log = recorder();
  stage().draw(2.95);
  const fresh = dashes(log);
  expect(fresh.length).toBeGreaterThan(0);
  expect(fresh.every(([cap, join]) => cap === 'round' && join === 'round')).toBe(true);
  const st = stage();
  st.draw(3.5);   // the arrow is drawn here, its pen leaving the caps round
  log.length = 0;
  st.draw(2.95);
  expect(dashes(log)).toEqual(fresh);
});
