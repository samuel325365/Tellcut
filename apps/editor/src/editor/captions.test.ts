import { fixture } from '../../../../packages/engine/src/commands/test-fixture.ts';
import { captionLook } from './captions.ts';

/** the fixture with a Text track: a bubble caption said in c2, a title on the scene block, an effect */
function withCaptions() {
  const p: any = fixture();
  p.tracks.push({ id: 'text', kind: 'overlay', items: [
    { id: 'say', type: 'common.caption', start: 0, end: 2, parent: 'c2', params: { text: 'take the train to', style: 'bubble', font: 'Inter', words: [[0, 4], [0.5, 9]] } },
    { id: 'say2', type: 'common.caption', start: 2, end: 3, parent: 'c2', params: { text: 'Rome', style: 'bubble', font: 'Inter', words: [[0, 4]] } },
    { id: 'title', type: 'core.caption', start: 0, end: 2, params: { text: 'A very long title that is not speech at all' } },
    { id: 'tag', type: 'common.ticket', start: 0, end: 2, parent: 'c2', params: { title: 'Rome' } },
  ] });
  return p;
}

test('new speech captions look like the film\'s own: their block and settings (not their words), karaoke, no longer than the longest', () => {
  expect(captionLook(withCaptions(), 'c1')).toEqual({ track: 'text', type: 'common.caption', params: { style: 'bubble', font: 'Inter' }, options: { maxChars: 17, karaoke: true } });
});

test('with no speech captions in the film (a title is not one), plain core.caption sentences', () => {
  const p: any = fixture();
  p.tracks.push({ id: 'text', kind: 'overlay', items: [{ id: 'title', type: 'core.caption', start: 0, end: 2, params: { text: 'Hello' } }] });
  expect(captionLook(p, 'c1')).toEqual({ type: 'core.caption', params: {}, options: {} });
});

test('the clip\'s own old captions are not the model (they are being replaced), and without word times there is no karaoke', () => {
  const p: any = fixture();
  p.tracks.push({ id: 'cap', kind: 'overlay', items: [
    { id: 'old', type: 'common.caption', start: 0, end: 1, parent: 'c1', params: { text: 'old', style: 'strip' } },
    { id: 'other', type: 'core.caption', start: 0, end: 1, parent: 'c2', params: { text: 'a plain one', size: 5 } },
  ] });
  expect(captionLook(p, 'c1')).toEqual({ track: 'cap', type: 'core.caption', params: { size: 5 }, options: { maxChars: 11 } });
});
