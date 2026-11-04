import { fixture } from '../../../../packages/engine/src/commands/test-fixture.ts';
import { applyCaptionTemplate, captionLook, captionLookParams, setCaptionTemplate, useMyCaptionTemplate } from './captions.ts';

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

test('with no speech captions in the film (a title is not one), common.caption lighting up word by word', () => {
  const p: any = fixture();
  p.tracks.push({ id: 'text', kind: 'overlay', items: [{ id: 'title', type: 'core.caption', start: 0, end: 2, params: { text: 'Hello' } }] });
  expect(captionLook(p, 'c1')).toEqual({ type: 'common.caption', params: {}, options: { karaoke: true } });
});

test('the clip\'s own old captions are not the model (they are being replaced), and without word times there is no karaoke', () => {
  const p: any = fixture();
  p.tracks.push({ id: 'cap', kind: 'overlay', items: [
    { id: 'old', type: 'common.caption', start: 0, end: 1, parent: 'c1', params: { text: 'old', style: 'strip' } },
    { id: 'other', type: 'core.caption', start: 0, end: 1, parent: 'c2', params: { text: 'a plain one', size: 5 } },
  ] });
  expect(captionLook(p, 'c1')).toEqual({ track: 'cap', type: 'core.caption', params: { size: 5 }, options: { maxChars: 11 } });
});

test('a template put on a track: its common.captions keep their words, timing and speaker, lose their look; others are left alone', () => {
  const p: any = withCaptions();
  p.tracks.at(-1).items[0].params.speaker = 2;
  expect(applyCaptionTemplate(p, 'text', 'neon')).toBe(2);
  const items = p.tracks.at(-1).items;
  expect(items[0].params).toEqual({ text: 'take the train to', words: [[0, 4], [0.5, 9]], speaker: 2, template: 'neon' });
  expect(items[2].params).toEqual({ text: 'A very long title that is not speech at all' });   // core.caption: not a template's
  // '' : back to the project's default, no template of their own
  applyCaptionTemplate(p, 'text', '');
  expect(items[1].params).toEqual({ text: 'Rome', words: [[0, 4]] });
  expect(applyCaptionTemplate(p, 'nope', 'neon')).toBe(0);
});

test('the project default template is set and cleared on meta', () => {
  const p: any = fixture();
  setCaptionTemplate(p, 'clean');
  expect(p.meta.captionTemplate).toBe('clean');
  setCaptionTemplate(p, '');
  expect('captionTemplate' in p.meta).toBe(false);
});

test('a template on one caption leaves the others on its track as they were', () => {
  const p: any = withCaptions();
  expect(applyCaptionTemplate(p, 'text', 'neon', ['say2'])).toBe(1);
  expect(p.tracks.at(-1).items[0].params.style).toBe('bubble');
  expect(p.tracks.at(-1).items[1].params).toEqual({ text: 'Rome', words: [[0, 4]], template: 'neon' });
});

test('a caption’s look as parameters: its template’s under its own look, words left out; one of my templates is copied into the project', () => {
  const p: any = withCaptions(), say = p.tracks.at(-1).items[0];
  say.params.template = 'neon';
  expect(captionLookParams(p, say, (id) => (id === 'neon' ? { style: 'neon', hl: '#f0f' } : undefined))).toEqual({ style: 'bubble', hl: '#f0f', font: 'Inter' });
  useMyCaptionTemplate(p, 'text', 'say', { slug: 'pink', params: { style: 'neon', hl: '#ff3db8' } });
  // keyed by its settings too: another template saved later under the same slug never restyles this film's captions
  const [key] = Object.keys(p.meta.captionTemplates);
  expect(key).toMatch(/^my-pink-[0-9a-z]+$/);
  expect(p.meta.captionTemplates[key]).toEqual({ style: 'neon', hl: '#ff3db8' });
  expect(say.params).toEqual({ text: 'take the train to', words: [[0, 4], [0.5, 9]], template: key });
  useMyCaptionTemplate(p, 'text', 'say2', { slug: 'pink', params: { style: 'box' } });
  expect(Object.keys(p.meta.captionTemplates).length).toBe(2);
});
