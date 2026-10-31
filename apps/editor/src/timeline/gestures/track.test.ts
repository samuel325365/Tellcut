// @vitest-environment jsdom
// The track-order and scrollbar drags end like the other timeline drags: a release outside the window (no mouseup seen) ends
// them, so the next release over the timeline is not taken as their drop.
import { fixture } from '../../../../../packages/engine/src/commands/test-fixture.ts';
import { startScrollbarDrag } from './scrollbar.ts';
import { startTrackDrag } from './track.ts';

const mouse = (type: string, o: MouseEventInit = {}) => dispatchEvent(new MouseEvent(type, { bubbles: true, ...o }));

test('a track drag released outside the window moves no track on the next release', () => {
  const p = fixture(), moves: unknown[] = [];
  const rowsEl = document.createElement('div');
  const rows = () => p.tracks.map((track, i) => ({ track, y: i * 40, h: 40, laneH: 40, lanes: new Map() }));
  const g: any = { editor: { moveTrack: (...a: unknown[]) => moves.push(a) }, p, rows, rowsEl };
  const drops: Array<number | null> = [];
  startTrackDrag(new MouseEvent('mousedown', { button: 0, clientY: 0 }), g, p.tracks[0], (y) => drops.push(y));
  dispatchEvent(new Event('blur'));
  mouse('mouseup', { clientY: 85 });   // over the third track (v2), a picture track like sc
  expect(moves).toEqual([]);
  expect(drops.at(-1)).toBeNull();
  // a drag released over another track of its group still moves it
  startTrackDrag(new MouseEvent('mousedown', { button: 0, clientY: 0 }), g, p.tracks[0], () => {});
  mouse('mousemove', { clientY: 85, buttons: 1 });
  mouse('mouseup', { clientY: 85 });
  expect(moves).toEqual([['sc', 2]]);
});

test('a scrollbar drag stops following once the button is found up', () => {
  const views: unknown[] = [];
  const editor: any = { setView: (v: unknown) => views.push(v) };
  const bar = document.createElement('div'), thumb = document.createElement('div');
  thumb.setAttribute('data-hthumb', '');
  bar.appendChild(thumb);
  const down = new MouseEvent('mousedown', { button: 0, clientX: 10 });
  Object.defineProperty(down, 'target', { value: thumb });
  startScrollbarDrag(down, editor, { thumb: { left: 0, width: 50 }, width: 500, span: 100, scroll: 0, pps: 5 });
  mouse('mousemove', { clientX: 60, buttons: 1 });
  expect(views).toEqual([{ scroll: 10 }]);
  mouse('mousemove', { clientX: 110, buttons: 0 });   // released outside the window
  mouse('mousemove', { clientX: 160, buttons: 0 });
  expect(views).toEqual([{ scroll: 10 }]);
});
