// The points of the save dialog as they go to the server (spec 2026-10-29-my-library §4.5): a point the user left alone keeps
// the agent's English line; one they changed or added is sent in their own words; one they deleted is gone.
import { pointsOut } from './save.ts';

test('unchanged points keep their prompt, changed and new ones go in the user’s words, empty ones are dropped', () => {
  const rows = [
    { text: '前 2 秒放最好看的一口', orig: '前 2 秒放最好看的一口', prompt: 'Open on the best bite.' },
    { text: '字幕放中間偏下', orig: '字幕放中間', prompt: 'Captions in the middle.' },
    { text: '  不放價格  ' },
    { text: '   ' },
  ];
  expect(pointsOut(rows)).toEqual([
    { text: '前 2 秒放最好看的一口', prompt: 'Open on the best bite.' },
    { text: '字幕放中間偏下', prompt: '字幕放中間偏下' },
    { text: '不放價格', prompt: '不放價格' },
  ]);
});

test('a point from a saved preset (its prompt stays on the server) is sent with what it was', () => {
  expect(pointsOut([{ text: '慢一點', orig: '慢一點' }, { text: '快一點', orig: '慢慢來' }])).toEqual([{ text: '慢一點', orig: '慢一點' }, { text: '快一點', prompt: '快一點' }]);
});
