// The blocks promoted from the uk-beat and uk-postcard shorts (2026-10-19): the rail-ticket beat edit kit and the postcard kit.
import { DEFAULT_THEME, defaultSafe, withDefaults } from '@tellcut/engine';
import { arcPt, boundsOf, EUROPE_TRIP, labelSide, parseCities, projector } from './geo.ts';
import { boardAt, boardBounds, boardLabel, parseStops, routeboard } from './routeboard.ts';
import { legAt, mapLayout } from './mapjump.ts';
import { ticketBox, ticketTitle } from './ticket.ts';
import { nameRoom, reachAt, route, routeSpan, stopName } from './route.ts';
import { stationsLayout } from './stations.ts';
import { cardFromParams, cardState, dropsOf, finalFace, postcard, postcardStills, postcardWindow, pushAmount, pushRect, type Card } from './postcard.ts';
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

// ── 2026-11-01: what the acceptance films T1 (Rome), T2 (Morocco) and F2 (food route) ran into ──────────────────────────────────

test('routeboard: the sights of one city spread over the map (they met in one point); many cities keep the padded bounds', () => {
  const rome = parseCities('梵蒂岡|VATICANO|12.4534|41.9029, 特雷維|TREVI|12.4833|41.9009, 競技場|COLOSSEO|12.4922|41.8902, 特米尼|TERMINI|12.5014|41.9010');
  const box: [number, number, number, number] = [34, 22, 500, 150], P = projector(box, boardBounds(rome)), xs = rome.map((c) => P(c.lon, c.lat)[0]);
  expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0.6 * 500);   // was about 6 px with boundsOf's degree of padding
  const ys = rome.map((c) => P(c.lon, c.lat)[1]);
  for (const y of ys) { expect(y).toBeGreaterThan(22); expect(y).toBeLessThan(172); }
  const trip = parseCities(EUROPE_TRIP);
  expect(boardBounds(trip)).toEqual(boundsOf(trip));
  expect(boardBounds(trip.slice(0, 1))).toEqual(boundsOf(trip.slice(0, 1)));
});

test('routeboard: a name never runs off the panel: the westernmost high dot puts it on its right, a low one is moved in', () => {
  const box: [number, number, number, number] = [34, 22, 500, 150];
  const west = boardLabel(53, 30, '梵蒂岡', 1, box);   // high in the box, near the left edge
  expect(west.transform).toBe('translate(0, -50%)');
  expect(west.left).toBeGreaterThan(53);
  expect(boardLabel(400, 30, '塔林', 1, box)).toEqual({ left: 378, top: 30, transform: 'translate(-100%, -50%)' });   // as before
  const low = boardLabel(40, 150, '聖彼得堡', 1, box);
  expect(low.left - (4 * 26) / 2).toBeGreaterThanOrEqual(18);
  expect(boardLabel(200, 150, '巴黎', 1, box).left).toBe(200);   // as before
});

test('ticket: a long city name stays left of the stamp, the stamp moves onto the stub only when the name would get too small', () => {
  expect(ticketTitle('巴黎', true)).toEqual({ px: 136, long: false, stampX: 400 });
  expect(ticketTitle('梵蒂岡', true)).toEqual({ px: 92, long: true, stampX: 400 });
  const six = ticketTitle('聖彼得大教堂', true);   // 6 × 92 = 552 px ran under the stamp at 400
  expect(34 + 6 * six.px).toBeLessThanOrEqual(390.001); expect(six.stampX).toBe(400);
  expect(ticketTitle('克拉科夫', true).px).toBe(92);   // four characters end 2 px into the stamp's box: kept as they were
  const long = ticketTitle('聖母大殿聖母大殿館', true);
  expect(long.px).toBeCloseTo(0.6 * 92, 5);
  expect(long.stampX).toBeGreaterThanOrEqual(34 + 9 * long.px + 10);
  expect(ticketTitle('聖彼得大教堂', false).px).toBeCloseTo(500 / 6, 5);   // no stamp: as before
});

test('route card: upto stops the line at stop k, already starts it lit up to there; names can be bigger, long ones in two lines', () => {
  const all = routeSpan(6, 0, 0);
  expect([1, 3, 6].map((n) => all.reach(n, 1, 3))).toEqual([1, 3, 6].map((n) => reachAt(n, 6, 1, 3)));
  const next = routeSpan(6, 3, 2);   // the card comes back to light stop 3
  expect(next.reach(1, 0.1, 0.9)).toBe(-Infinity); expect(next.reach(2, 0.1, 0.9)).toBe(-Infinity);
  expect(next.reach(3, 0.1, 0.9)).toBeCloseTo(0.85, 5);
  expect(next.reach(4, 0.1, 0.9)).toBe(Infinity);
  expect(routeSpan(4, 9, 7)).toMatchObject({ a: 4, e: 4 });
  expect(def(route, 'upto')).toBe(0); expect(def(route, 'already')).toBe(0); expect(def(route, 'nameSize')).toBe(30);
  expect(stopName('新珍香', 44, 200)).toEqual({ text: '新珍香', lines: 1, px: 44 });
  expect(stopName('驚嘆號臭豆腐', 44, 200)).toEqual({ text: '驚嘆號\n臭豆腐', lines: 2, px: 44 });
  const P: Array<[number, number]> = [[100, 300], [400, 310], [700, 300], [600, 700]];
  expect(nameRoom(P, 1, 1000, 40)).toBeCloseTo(270, 5);   // 0.9 of the way to the nearest stop in its row
  expect(nameRoom(P, 3, 1000, 40)).toBe(400);              // alone in its row: 0.4 of the card
});

test('postcard: the push grows from the window to the whole frame and back; drop cards need a number at', () => {
  const p = { pushAt: 1, pushDur: 0.5, pushBack: 3 };
  expect([0.5, 1, 1.5, 2, 3, 3.5].map((t) => pushAmount(p, t))).toEqual([0, 0, 1, 1, 1, 0]);
  expect(pushAmount(p, 1.25)).toBeCloseTo(0.5, 5);
  expect(pushAmount({ ...p, pushBack: -1 }, 9)).toBe(1);
  expect(pushAmount({ ...p, pushAt: -1 }, 2)).toBe(0);
  expect(pushRect([100, 200, 800, 1000], 1080, 1920, 0)).toEqual([100, 200, 800, 1000]);
  expect(pushRect([100, 200, 800, 1000], 1080, 1920, 1)).toEqual([0, 0, 1080, 1920]);
  expect(dropsOf([{ index: 4, orient: 'portrait', at: '6.9' }, { index: 5, orient: 'portrait' }, null])).toEqual([{ index: 4, orient: 'portrait', at: 6.9 }]);
  expect(def(postcard, 'pushAt')).toBe(-1); expect(def(postcard, 'drop')).toEqual([]);
});
