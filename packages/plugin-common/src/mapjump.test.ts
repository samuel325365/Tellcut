// @vitest-environment jsdom
// common.mapjump with no city it can read (review 4, R4-C3): the paper and the heading, not an exception that aborts the export.
import { createRegistry, Stage, type ItemType } from '@tellcut/engine';
import { mapjump } from './mapjump.ts';

let calls: string[];
beforeEach(() => {
  calls = [];
  const g: any = new Proxy(function () {}, { get: (_t, k) => (typeof k === 'symbol' ? undefined : (...a: unknown[]) => { calls.push(String(k)); return k === 'measureText' ? { width: 10 } : g; }), set: () => true });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => g);
});
afterEach(() => vi.restoreAllMocks());

const media: any = { begin() {}, place() {}, sync: async () => {}, image: () => document.createElement('img'), video: () => document.createElement('video'), stillUrl: () => '', fileUrl: (p: string) => p };
function frameAt(params: Record<string, unknown>, t: number) {
  const root = document.createElement('div');
  const st = new Stage(root, createRegistry([{ id: 'common', items: [mapjump as ItemType] }]), media, { onError: (_i, m) => { throw new Error(m); } });
  st.load({ version: 1, meta: { width: 1080, height: 1920, fps: 30, duration: 4, background: '#000', plugins: [] }, sources: {}, media: {}, grids: [],
    tracks: [{ id: 'o', kind: 'overlay', items: [{ id: 'm', type: 'common.mapjump', start: 0, end: 2, params }] }] } as any);
  st.draw(t);
  return root;
}

test('no cities, or none readable (a typo in the numbers): the paper and the heading, nothing drawn on the map, no throw', () => {
  for (const cities of ['', '巴黎|PARIS|2.35', '巴黎|PARIS|2.35|4x8.85, 克拉科夫|KRAKÓW|abc|50.06'])
    for (const mode of ['leg', 'all']) {
      calls = [];
      const root = frameAt({ cities, mode, title: '克拉科夫' }, 0.6);
      expect(root.textContent).toContain('克拉科夫');
      expect(calls).not.toContain('stroke');
      expect(calls).not.toContain('fill');
    }
});

test('one readable city among typos still draws it', () => {
  frameAt({ cities: '巴黎|PARIS|2.35|48.85, 克拉科夫|KRAKÓW|abc|50.06', from: 0, to: 1 }, 0.6);
  expect(calls).toContain('fill');
});
