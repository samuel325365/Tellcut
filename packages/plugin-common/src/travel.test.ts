// The blocks promoted from the uk-beat and uk-postcard shorts (2026-10-19): the rail-ticket beat edit kit and the postcard kit.
import { DEFAULT_THEME, defaultSafe, withDefaults } from '@tellcut/engine';
import { arcPt, boundsOf, EUROPE_TRIP, labelSide, parseCities, projector } from './geo.ts';
import { boardAt, parseStops, routeboard } from './routeboard.ts';
import { legAt, mapLayout } from './mapjump.ts';
import { ticketBox } from './ticket.ts';
import { stationsLayout } from './stations.ts';
import { cardFromParams, cardState, finalFace, postcard, postcardStills, postcardWindow, type Card } from './postcard.ts';
import { frame, frameBox, framePose, frameWindow } from './frame.ts';
import { markSize, stampTint } from './postmark.ts';
import { asFrame } from './window.ts';
import { list } from './list.ts';
import { slam } from './slam.ts';
import { tag } from './tag.ts';

const def = (t: { params: Array<{ key: string; default: unknown }> }, key: string) => t.params.find((p) => p.key === key)!.default;

test('geo: cities parsed with their coordinates, padded bounds, a projection that puts north up, arcs that end where asked', () => {
  const c = parseCities(EUROPE_TRIP);
  expect(c.map((x) => x.zh)).toEqual(['巴黎', '克拉科夫', '塔林']);
  expect(parseCities('甲|A|x|1, 乙|B|10|20')).toEqual([{ zh: '乙', en: 'B', lon: 10, lat: 20 }]);
  const b = boundsOf(c);
  expect(b.lon0).toBeLessThan(2.35); expect(b.lat1).toBeGreaterThan(59.44);
  const P = projector([0, 0, 100, 50], b);
  expect(P(b.lon0, b.lat1)).toEqual([0, 0]);
  expect(P(b.lon1, b.lat0)).toEqual([100, 50]);
  expect(P(24.75, 59.44)[1]).toBeLessThan(P(2.35, 48.86)[1]);   // Tallinn is north of Paris: higher up
  expect(arcPt([0, 0], [100, 0], 0, 20)).toEqual([0, 0]);
  expect(arcPt([0, 0], [100, 0], 1, 20)).toEqual([100, 0]);
  expect(labelSide(5, [0, 0, 100, 100])).toBe('left');
  expect(labelSide(80, [0, 0, 100, 100])).toBe('below');
});

test('routeboard: stops from text or from the list cut.ts writes (3+ = all, -1 on the road); legs light when their far end is reached', () => {
  expect(parseStops('0|0|05.26, 2|-|06.10, 1|1|06.06, 3|all|全程', 3)).toEqual([
    { t: 0, city: 0, date: '05.26' }, { t: 1, city: 1, date: '06.06' }, { t: 2, city: -1, date: '06.10' }, { t: 3, city: 'all', date: '全程' }]);
  expect(parseStops([[0, 0, 'a'], [5, 3, 'b'], [6, -1, 'c']], 3).map((s) => s.city)).toEqual([0, 'all', -1]);
  const stops = parseStops('0|0|a, 12|1|b, 15|-1|c, 16|2|d', 3);
  const at = (t: number) => boardAt(stops, 3, t);
  expect(at(11).cur.city).toBe(0);
  expect(at(15.5).cur.city).toBe(-1);
  expect([...at(15.5).visited]).toEqual([0, 1]);
  expect(at(11).done).toEqual([false, false]);
  expect(at(12).done).toEqual([true, false]);
  expect(at(16).done).toEqual([true, true]);
  expect(boardAt(stops, 3, 13, [14, 20]).done).toEqual([false, false]);   // times given win
  // the default stops light every city inside the 3 s gallery preview
  const d = parseStops(def(routeboard, 'stops'), 3);
  expect(boardAt(d, 3, 2.9).cur.city).toBe('all');
});

test('mapjump: the map keeps its shape inside the safe area with the heading above and the dates below, on 9:16 and 16:9', () => {
  for (const [W, H] of [[1080, 1920], [1920, 1080]]) {
    const safe = defaultSafe(W, H), L = mapLayout(W, H, safe), [x, y, w, h] = L.box;
    expect(w / h).toBeCloseTo(820 / 690, 5);
    expect(x).toBeGreaterThanOrEqual(safe.side * W - 1e-6);
    expect(x + w).toBeLessThanOrEqual(W * (1 - safe.side) + 1e-6);
    expect(y).toBeGreaterThan(L.top + 250 * L.u);
    expect(y + h + 100 * L.u).toBeLessThan(L.datesTop);   // room for the names under the dots
  }
  expect(legAt(0, 0.46)).toEqual({ f: 0, landed: false });
  expect(legAt(0.46, 0.46)).toEqual({ f: 1, landed: true });
});

test('ticket and stations sit above the bottom safe line on any frame shape', () => {
  for (const [W, H] of [[1080, 1920], [1920, 1080], [1080, 1080]]) {
    const safe = defaultSafe(W, H), b = ticketBox({ y: -1, w: 0.74 }, W, H, safe);
    expect(b.y + b.h).toBeLessThanOrEqual((1 - safe.bottom) * H);
    expect(b.x).toBeGreaterThanOrEqual(safe.side * W - 1e-6);
    const s = stationsLayout(3, W, H, safe);
    expect(s.top).toBeGreaterThan(safe.top * H);
    expect(s.bottom).toBe((1 - safe.bottom) * H);
  }
});

test('postcard: the settled window is the one uk-postcard framed its clips with; on a wide frame it stays inside', () => {
  expect(postcardWindow('portrait')).toEqual([0.09259, 0.09375, 0.81481, 0.52083]);
  expect(postcardWindow('landscape')).toEqual([0.06481, 0.28646, 0.87037, 0.27552]);
  const [x, y, w, h] = postcardWindow('portrait', 1920, 1080);
  expect(x).toBeGreaterThan(0); expect(x + w).toBeLessThan(1); expect(y + h).toBeLessThan(1);
  expect(asFrame([10, 20, 30, 40], 100, 100)).toEqual([0.1, 0.2, 0.3, 0.4]);
});

test('postcard: the window is a hole only once the card has settled and opened; a flip turns the face half way through', () => {
  const card: Card = { index: 1, orient: 'portrait', show: 'front', enter: { from: [1250, 160, 9], dur: 1.2 }, front: { open: 1.2, stamp: { label: 'FRANCE' } } };
  expect(cardState(card, 0.5).hole).toBe(false);
  expect(cardState(card, 0.5).pose.cx).toBeGreaterThan(540);
  const open = cardState(card, 1.3);
  expect(open.hole).toBe(true);
  expect(open.stillAlpha).toBeCloseTo(2 / 3, 5);
  expect(cardState(card, 2).stillAlpha).toBe(0);
  const flip: Card = { ...card, enter: undefined, show: 'back', flip: { at: 1, dur: 1 }, back: {} };
  expect(cardState(flip, 1.2).face).toBe('back');
  expect(cardState(flip, 1.6).face).toBe('front');
  expect(cardState(flip, 1.5).hole).toBe(false);
  expect(finalFace(flip)).toBe('front');
  // spreading out: the card leaves its place, never a hole
  expect(cardState(card, 3, { at: 2.5, dur: 1, slots: [] }).hole).toBe(false);
});

test('postcard: the simple params make one card; without footage it is written on but never opens; stills listed once, files left to the project', () => {
  const p = withDefaults(postcard.params, {}, DEFAULT_THEME);
  const c = cardFromParams(p);
  expect(c.front!.lines!.map((l) => l.text)).toEqual(['到了巴黎', '先好好吃一頓']);
  expect(c.front!.lines![1]).toMatchObject({ t0: 1.9, t1: 2.8 });   // written inside the 3 s preview
  expect(cardState(c, 2.9).hole).toBe(false);
  const live = cardFromParams({ ...p, source: 'eiffel', t: 2 });
  expect(cardState(live, 1).hole).toBe(true);
  expect(postcardStills({ ...p, source: 'eiffel', t: 2 })).toHaveLength(1);
  const pile: Card[] = [{ index: 0, orient: 'portrait', front: { exit: { source: 'a', t: 1 }, stamp: { label: '' } } }, { index: 1, orient: 'portrait', front: { exit: { source: 'b', t: 0, file: 'media/b.jpg' }, stamp: { label: '' } } }];
  expect(postcardStills({ card: live, pile }).map((s) => s.source)).toEqual(['eiffel', 'a']);
});

test('frame: the window inside the body, the pose settled only between the entrance and the exit or a flip', () => {
  const p = withDefaults(frame.params, {}, DEFAULT_THEME) as any;
  const b = frameBox(p, 1080, 1920);
  expect(b.win[0]).toBeGreaterThan(b.x0); expect(b.win[1]).toBeGreaterThan(b.y0);
  expect(b.win[2] / b.win[3]).toBeCloseTo(p.aspect, 5);
  expect(frameWindow({}, 1080, 1920)).toEqual(asFrame(b.win, 1080, 1920));
  const pose = (q: Record<string, unknown>, t: number) => framePose({ ...p, ...q }, t, 4, 1080, 1920);
  expect(pose({}, 0.3).settled).toBe(false);
  expect(pose({}, 1).settled).toBe(true);
  expect(pose({ exit: 'left' }, 3.8).settled).toBe(false);
  expect(pose({ exit: 'left' }, 3.8).dx).toBeLessThan(0);
  expect(pose({ flipAt: 2 }, 2.5).settled).toBe(false);
  expect(pose({ flipAt: 2 }, 2.5).back).toBe(true);
  expect(pose({ enter: 'none' }, 0).settled).toBe(true);
});

test('postmark: the country colours, one picked from the label otherwise; its size follows the ring', () => {
  expect(stampTint('FRANCE')).toBe('#2f4f86');
  expect(stampTint('NIPPON')).toBe(stampTint('NIPPON'));
  expect(stampTint('X', '#123456')).toBe('#123456');
  expect(markSize(74)).toEqual({ w: 279, h: 168, cx: 84, cy: 84 });
});

test('the new looks are opt-in: tag, slam and list keep their old defaults', () => {
  expect(def(tag, 'look')).toBe('pill');
  expect(def(list, 'look')).toBe('card');
  expect(def(slam, 'bar')).toBe('#00000000');
  expect(def(slam, 'drift')).toBe(0);
});
