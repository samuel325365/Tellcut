// avoidBurned's fallback: our captions over a clip it could not crop clear of the footage's own caption row move to the top.
import { createRegistry } from '@tellcut/engine';
import { plugins } from '@tellcut/plugins';
import { burnedZone, planCaptionsTop, sitsAtTop, TOP_PUSH, type GaveUpClip, type TimedCaption } from './burned-captions.ts';
import { fresh, items } from './cut-test-kit.ts';

/** a 1280×720 source in the 1920×1080 film: avoidBurned may zoom it 1.25× only, too little for a row from 0.75 down */
const capped = (spans: Array<[number, number]> = [[0, 10]]) => {
  const c = fresh();
  c.p.sources.v.width = 1280; c.p.sources.v.height = 720;
  c.inv.sources[0].burned = { version: 1, step: 1, frames: 10, caption: { share: 0.5, rect: [0.08, 0.75, 0.84, 0.2], spans } };
  return c;
};
const item = (c: ReturnType<typeof fresh>, id: string) => c.p.tracks.flatMap((t) => t.items as any[]).find((i) => i.id === id);

test('a caption over a clip avoidBurned could not zoom enough moves to the top; one over another clip, or placed by its author, does not', async () => {
  const c = capped();
  const clip = c.clip('v', { from: 1, len: 2, avoidBurned: true });
  c.clip('v', { from: 5, len: 2 });                                         // not asked: its row is the script's own business
  const over = c.caption('在上面', { at: 0.5, len: 1 });
  const later = c.caption('別的鏡頭', { at: 2.5, len: 1 });                 // film 2.5–3.5: the second clip
  const mine = c.caption('自己放的', { at: 1.6, len: 0.3, position: 'bottom' });
  await c.save();
  expect(item(c, over).params.position).toBe('top');
  expect(item(c, later).params.position).toBeUndefined();
  expect(item(c, mine).params.position).toBe('bottom');
  const note = c.notes.find((n) => n.includes('才避得開燒進去的字幕'))!;
  expect(note).toContain(`${clip}（素材 0:01.0–0:03.0）`);
  expect(note).toContain('疊在原片字幕上的 1 張字幕自動移到畫面上方');
  expect(note).toContain(`1 張是自己給了位置（y、position 或 transform）：${mine}，沒有移`);
  expect(note).not.toContain('字幕改放畫面上方或換鏡頭');
  expect(c.notes.filter((n) => n.startsWith('avoidBurned：v ')).length).toBe(1);   // once for the source
});

test('nothing moves where avoidBurned has no detected row to go by (unseen), nor for a clip the script removed again', async () => {
  const c = capped([[0, 1]]);
  c.clip('v', { from: 7, len: 2, avoidBurned: true });                      // source 7–9: no span within 3 s
  const cap = c.caption('沒偵測到', { at: 0.5, len: 1 });
  await c.save();
  expect(item(c, cap).params.position).toBeUndefined();
  expect(c.notes.join('\n')).toContain('沒偵測到原片字幕');

  const d = capped();
  const gone = d.clip('v', { from: 1, len: 2, sound: false, avoidBurned: true });
  d.clip('v', { from: 5, len: 2 });
  const v1 = items(d, 'v1');
  v1.splice(v1.findIndex((i) => i.id === gone), 1);
  const over = d.caption('原本在它上面', { at: 2.2, len: 1 });              // over the clip left, which was not asked
  await d.save();
  expect(item(d, over).params.position).toBeUndefined();
  expect(d.notes.filter((n) => n.includes('avoidBurned'))).toEqual([]);
});

test('the top taken (a title laid out at the top, the hook\'s tags) keeps the caption where it was, and the note says so', async () => {
  const c = capped();
  c.clip('v', { from: 1, len: 3, avoidBurned: true });
  const a = c.caption('標題下面', { at: 0.2, len: 1 });
  const b = c.caption('標籤下面', { at: 1.5, len: 1 });
  const free = c.caption('上面空著', { at: 2.6, len: 0.3 });
  c.title('章節', { at: 0, len: 1.3, layout: 'top' });
  c.effect('common.tag', { at: 1.4, len: 1, tags: '小吃' });                // default y 0.14: up there
  c.effect('common.slam', { at: 2.5, len: 0.5, text: '砰' });               // y 0.42: the middle, not the top
  await c.save();
  expect([item(c, a).params.position, item(c, b).params.position, item(c, free).params.position]).toEqual([undefined, undefined, 'top']);
  const note = c.notes.find((n) => n.startsWith('avoidBurned：v '))!;
  expect(note).toContain('1 張字幕自動移到畫面上方');
  expect(note).toContain(`2 張上方同時已經有別的東西（標題、標籤…）或原片的字也在上方：${a}、${b}，沒有移`);
});

test('a thin bar or a one-line header at the top does not take it: the caption goes just under it; a big look still does', async () => {
  const c = capped();
  c.clip('v', { from: 1, len: 6, avoidBurned: true });
  const underBar = c.caption('進度條下面', { at: 1.2, len: 1 });
  const underHeader = c.caption('標頭下面', { at: 3.2, len: 1 });
  const stays = c.caption('大編號', { at: 5.2, len: 1 });
  c.effect('common.progress', { at: 0, len: 2.5 });                        // bar on the top margin
  c.effect('common.header', { at: 3, len: 1.5, no: '01', text: '開場' });  // chip under the top lane
  c.effect('common.header', { at: 5, len: 1.5, look: 'big', no: '02', text: '下一站' });
  await c.save();
  const y = (id: string) => item(c, id).params.y as number, safeTop = 0.06;
  // under the bar (12 px of 1080, on the margin), and under the header (lane + one line of 3 % type), both near the top
  expect(y(underBar)).toBeGreaterThan(safeTop + 12 / 1080);
  expect(y(underHeader)).toBeGreaterThan(y(underBar));
  expect(y(underHeader) - safeTop).toBeLessThan(0.3);
  expect(item(c, stays).params.y).toBeUndefined();
  expect(item(c, stays).params.position).toBeUndefined();
});

test('planCaptionsTop: pushed under what sits at the top by its lower edge, as far as TOP_PUSH; unknown things take the top', () => {
  const clip: GaveUpClip = { id: 'c', start: 0, end: 5, zone: { x: [0.1, 0.9], y: [0.78, 0.95] }, move: true };
  const cap: TimedCaption = { id: 'a', type: 'common.caption', params: {}, start: 1, end: 2, eff: { position: 'bottom' } };
  const safe = { top: 0.06, bottom: 0.12, side: 0.05 }, heightOf = () => 0.1;
  const bar = { id: 'p', type: 'common.progress', start: 0, end: 5, eff: { position: 'top', y: -1 }, defs: [] };
  const plan = (roomOf: (x: any) => number | null) => planCaptionsTop([cap], { clips: [clip], others: [bar], safe, heightOf, hung: new Set(), roomOf });
  expect(plan(() => 0.075).moves).toEqual([{ id: 'a', clip: 'c', params: { y: 0.185 } }]);    // 0.075 + gap 0.01 + 0.1
  expect(plan(() => 0.06 + TOP_PUSH + 0.01).stays).toEqual([{ id: 'a', why: 'taken', clip: 'c' }]);
  expect(plan(() => null).stays).toEqual([{ id: 'a', why: 'taken', clip: 'c' }]);
});

test("avoidBurned: 'crop' only crops: our captions stay, and the note names them", async () => {
  const c = capped();
  c.clip('v', { from: 1, len: 2, avoidBurned: 'crop' });
  const cap = c.caption('留著', { at: 0.5, len: 1 });
  await c.save();
  expect(item(c, cap).params.position).toBeUndefined();
  expect(c.notes.find((n) => n.startsWith('avoidBurned：v '))).toContain(`1 張在 avoidBurned: 'crop' 的片段上：${cap}，沒有移`);
  expect(() => fresh().clip('v', { from: 0, len: 1, avoidBurned: 'yes' as never })).toThrow(/avoidBurned 只能是/);
});

test('a caption with a name chip goes by its lower edge (the chip stays inside the top margin); core.caption by a transform', async () => {
  const c = capped();
  c.clip('v', { from: 1, len: 3, avoidBurned: true });
  const named = c.caption('有名字', { at: 0.2, len: 1, name: '阿明' });
  const old = c.effect('core.caption', { at: 1.5, len: 1, text: '舊字幕' });
  await c.save();
  const y = item(c, named).params.y;
  expect(item(c, named).params.position).toBeUndefined();
  expect(y).toBeGreaterThan(0.06 + 0.1);                                    // the 16:9 top margin plus two lines and the chip
  expect(y).toBeLessThan(0.3);
  const t = item(c, old).transform;
  expect([t.x, t.scale, t.ox, t.oy]).toEqual([0, 1, 0.5, 0.5]);
  expect(t.y).toBeLessThan(-0.6);                                            // from the bottom margin (0.88) up to the top
  expect(c.notes.find((n) => n.startsWith('avoidBurned：v '))).toContain('2 張字幕自動移到畫面上方');
});

test('in a panel layout a caption hung under the panel stays; one left on the bottom margin over the picture\'s row moves', async () => {
  const hungCut = capped();
  hungCut.panel({ frame: [0.1, 0.05, 0.8, 0.6] });                          // room under it: the caption hangs there
  hungCut.clip('v', { from: 1, len: 2, avoidBurned: true });
  const hung = hungCut.caption('面板下', { at: 0.5, len: 1 });
  await hungCut.save();
  expect(item(hungCut, hung).params.y).toBeGreaterThan(0.65);
  expect(item(hungCut, hung).params.position).toBeUndefined();

  const tall = capped();
  tall.panel({ frame: [0.05, 0.05, 0.9, 0.85] });                           // no room under it: the caption stays on the margin, over the row
  tall.clip('v', { from: 1, len: 2, avoidBurned: true });
  const margin = tall.caption('下緣', { at: 0.5, len: 1 });
  await tall.save();
  expect(item(tall, margin).params.position).toBe('top');
});

test('planCaptionsTop leaves a caption the panel hung, and one not on the row; burnedZone follows the frame and the crop', () => {
  const zone = burnedZone({ srcW: 1920, srcH: 1080, W: 1920, H: 1080, frame: [0, 0, 1, 1], crops: [{ x: 0.5, y: 0.5, zoom: 1 }], rect: [0.08, 0.75, 0.84, 0.2] })!;
  expect(zone.y[0]).toBeCloseTo(0.75, 5); expect(zone.y[1]).toBeCloseTo(0.95, 5);
  // the same row in a window on the top half (its lower part shown) lands up there
  const up = burnedZone({ srcW: 1920, srcH: 1080, W: 1920, H: 1080, frame: [0, 0, 1, 0.5], crops: [{ x: 0.5, y: 1, zoom: 1 }], rect: [0.08, 0.75, 0.84, 0.2] })!;
  expect(up.y[1]).toBeLessThanOrEqual(0.5);
  const clip: GaveUpClip = { id: 'c', start: 0, end: 4, zone, move: true };
  const cap = (id: string, params: Record<string, unknown> = {}): TimedCaption => ({ id, type: 'common.caption', params, start: 1, end: 2, eff: { position: 'bottom', style: 'outline', ...params } });
  const safe = { top: 0.06, bottom: 0.12, side: 0.05 }, heightOf = () => 0.115;
  expect(planCaptionsTop([cap('a'), cap('b', { y: 0.8 })], { clips: [clip], others: [], safe, heightOf, hung: new Set(['b']) })).toEqual({ moves: [{ id: 'a', clip: 'c', params: { position: 'top' } }], stays: [] });
  // a clip in a top window: a bottom caption is not on its row; nothing to do
  expect(planCaptionsTop([cap('a')], { clips: [{ ...clip, zone: up }], others: [], safe, heightOf, hung: new Set() })).toEqual({ moves: [], stays: [] });
});

test('sitsAtTop reads the blocks\' own places: -1 on the top margin, position, a heading layout, an explicit y', () => {
  const reg = createRegistry(plugins), defs = (t: string) => reg.item(t)!.params;
  const drawn = (t: string, own: Record<string, unknown> = {}) => ({ ...Object.fromEntries(defs(t).map((d) => [d.key, d.default])), ...own });
  expect(sitsAtTop(drawn('common.badge'), defs('common.badge'), 0.2)).toBe(true);          // -1: its top on the top margin
  expect(sitsAtTop(drawn('common.header'), defs('common.header'), 0.2)).toBe(true);
  expect(sitsAtTop(drawn('common.progress', { position: 'bottom' }), defs('common.progress'), 0.2)).toBe(false);
  expect(sitsAtTop(drawn('common.progress'), defs('common.progress'), 0.2)).toBe(true);    // position top by default
  expect(sitsAtTop(drawn('common.heading'), defs('common.heading'), 0.2)).toBe(false);     // centre
  expect(sitsAtTop(drawn('common.heading', { layout: 'corner' }), defs('common.heading'), 0.2)).toBe(true);
  expect(sitsAtTop(drawn('common.slam'), defs('common.slam'), 0.2)).toBe(false);
  expect(sitsAtTop(drawn('common.gauge'), defs('common.gauge'), 0.2)).toBe(false);         // -1: on the bottom margin
});
