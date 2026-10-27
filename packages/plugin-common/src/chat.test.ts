// common.chat (group C1): the message lines, the bubble sizes, the conversation's place at t, the video window and the tap point.
import { chat, chatPlace, chatPoint, chatWindow, aspectOf, inputAt, msgBox, parseChat, wallAt, wrapText, FS, GAP, LH, PADV, LEFT, RIGHT } from './chat.ts';

const ITEMS = '-1|sys|今天\n0.2|them|晚安\n0.5|me|好/明天見\n1|them||typing\n1.6|them|等等\n2|阿哲|我也要|avatar=🌸\n2.2|me||video|src=a|t=3|t2=9|play=2.6-3.4|ratio=4:5|w=0.5|mute|dur=0:08';

test('lines: time, who (me / them / sys / ch or a member name), the words and the extras; the dots stop at the next message on that side', () => {
  const M = parseChat(ITEMS);
  expect(M.map((m) => [m.who, m.kind, m.name])).toEqual([['sys', 'text', ''], ['them', 'text', ''], ['me', 'text', ''], ['them', 'typing', ''], ['them', 'text', ''], ['them', 'text', '阿哲'], ['me', 'video', '']]);
  expect(M[3].end).toBe(1.6);
  expect(M.map((m) => m.head)).toEqual([false, true, false, true, true, true, false]);
  const v = M[6];
  expect([v.src, v.t, v.t2, v.play, v.aspect, v.w, v.mute, v.dur]).toEqual(['a', 3, 9, [2.6, 3.4], 0.8, 0.5, true, '0:08']);
  expect(M[5].avatar).toBe('🌸');
  expect(parseChat('x|me|no time\n1-2|them||typing\n3|me|a|unread|read=4')[0].end).toBe(2);
  expect(parseChat('3|me|a|unread')[0].read).toBe(-1);
  expect(parseChat('a\\n1|ch|🛵 出發|icon=1')[0]).toMatchObject({ who: 'ch', kind: 'text', icon: '1' });
  expect([aspectOf('4:5'), aspectOf('16x9'), aspectOf('1.5'), aspectOf('')]).toEqual([0.8, 16 / 9, 1.5, NaN]);
});

test('bubbles: text height is its lines, media keep their ratio, the right side ends at RIGHT, a member name and a chapter take room', () => {
  const M = parseChat(ITEMS);
  const t = msgBox(M[2]);
  expect(t.lines).toEqual(['好', '明天見']);
  expect(t.h).toBe(2 * PADV + 2 * LH);
  expect(t.x + t.w).toBe(RIGHT);
  expect(t.w).toBeCloseTo(3 * FS + 64);
  const v = msgBox(M[6]);
  expect([v.w, v.h, v.x]).toEqual([540, 675, RIGHT - 540]);
  expect(msgBox(M[5]).off).toBeGreaterThan(0);
  expect(msgBox(M[4]).x).toBe(LEFT);
  const ch = msgBox(parseChat('1|ch|出發')[0]);
  expect(ch.slot).toBe(ch.h + 36);
  // a long line wraps; "/" breaks
  expect(wrapText('這是一段很長很長很長的訊息，會自己換行到第二行', 12).length).toBe(2);
  expect(wrapText('a/b', 12)).toEqual(['a', 'b']);
});

test('place: stacked from the top in arrival order, the dots give way to the message, the conversation scrolls once it passes the bottom', () => {
  const M = parseChat(ITEMS), slots = M.map((m) => msgBox(m).slot);
  const at = (t: number, areaH = 5000) => chatPlace(M, slots, t, areaH);
  expect(at(0).pos.map((q) => q.i)).toEqual([0]);
  expect(at(0).pos[0].enter).toBe(1);                                     // a negative time: there from the start
  const q1 = at(1.3).pos;
  expect(q1.map((q) => q.i)).toEqual([0, 1, 2, 3]);
  expect(q1[1].y).toBe(q1[0].y + slots[0] + GAP);
  const q2 = at(2).pos;                                                     // the dots gone, the message in their place
  expect(q2.map((q) => q.i)).toEqual([0, 1, 2, 4, 5]);
  expect(q2[3].y).toBeCloseTo(q1[3].y);
  // a short area: the newest bubble's bottom lands on the area's bottom once the scroll settles
  const areaH = 600, end = chatPlace(M, slots, 5, areaH), last = end.pos[end.pos.length - 1];
  expect(end.scroll).toBeGreaterThan(0);
  expect(last.y + slots[last.i] + 14).toBeCloseTo(areaH);
  // mid-move the scroll is between the two
  const mid = chatPlace(M, slots, 2.3, areaH).scroll, before = chatPlace(M, slots, 2.19, areaH).scroll, after = chatPlace(M, slots, 3, areaH).scroll;
  expect(mid).toBeGreaterThan(before);
  expect(mid).toBeLessThan(after);
});

test('the video window and the tap point: on 9:16 the bubble itself, on 16:9 inside the phone; same times, same answers', () => {
  const p = { items: ITEMS };
  const f = chatWindow(p, 6)!;
  expect(f[2]).toBeCloseTo(540 / 1080, 3);
  expect(f[3]).toBeCloseTo(675 / 1920, 3);
  expect(f[0] + f[2]).toBeCloseTo(RIGHT / 1080, 3);
  const pt = chatPoint(p, 6, 2.6)!;
  expect(pt.x).toBeCloseTo(f[0] + f[2] / 2, 3);
  expect(pt.y).toBeCloseTo(f[1] + f[3] / 2, 3);
  const w = chatWindow(p, 6, 1920, 1080)!;
  expect(w[2]).toBeLessThan(0.2);
  expect(w[0]).toBeGreaterThan(0.4);
  expect(chatWindow(p, 99)).toBeNull();
  expect(chatPoint(p, 6, 0)).toBeNull();                                    // not sent yet
});

test('wallpaper keys ease from one to the next; the input field types and deletes', () => {
  expect(wallAt('0|#000000|#ffffff\n2|#ffffff|#000000', -1)).toEqual(['#000000', '#ffffff']);
  expect(wallAt('0|#000000|#ffffff\n2|#ffffff|#000000', 1)).toEqual(['#808080', '#808080']);
  expect(wallAt('0|#123456', 9)).toEqual(['#123456', '#123456']);
  const IN = '1-2|abcd|type\n2.1-2.5|abcd|delete';
  expect(inputAt(IN, 0.5)).toBeNull();
  expect(inputAt(IN, 1.5)).toBe('ab');
  expect(inputAt(IN, 2.05)).toBe('abcd');
  expect(inputAt(IN, 2.3)).toBe('ab');
  expect(inputAt(IN, 3)).toBeNull();
});

test('media: the stills of every photo, video (and its after-play poster), album picture and link', () => {
  const item = { params: { items: ITEMS + '\n3|me||album|pics=b@1,-,b@2\n4|me|看|link|src=c|t=5' } } as never;
  const st = chat.media!(item, {} as never).stills.map((s) => `${s.source}@${s.t}`);
  expect(st).toEqual(['a@3', 'a@9', 'b@1', 'b@2', 'c@5']);
});
