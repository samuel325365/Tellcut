// My caption templates: saved as a look (never a caption's words), listed, removed.
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { captionsDir, listCaptions, removeCaption, saveCaption } from './captions.ts';

test('a caption saved keeps its look, not its words, timing or speaker; names give slugs, taken ones a number', () => {
  const root = mkdtempSync(join(tmpdir(), 'lib-'));
  const a = saveCaption(root, { name: 'Pink neon', params: { style: 'neon', hl: '#ff3db8', text: 'hi', words: [[0, 2]], speaker: 2, template: 'neon-fill' } });
  expect(a).toMatchObject({ slug: 'pink-neon', name: 'Pink neon', params: { style: 'neon', hl: '#ff3db8' } });
  expect(Object.keys(a.params).sort()).toEqual(['hl', 'style']);
  expect(saveCaption(root, { name: 'Pink neon', params: { style: 'neon' } }).slug).toBe('pink-neon-2');
  expect(saveCaption(root, { name: '粉紅霓虹', params: { style: 'neon' } }).slug).toBe('caption');
  expect(listCaptions(root).map((e) => e.slug)).toEqual(['caption', 'pink-neon', 'pink-neon-2']);
  removeCaption(root, 'pink-neon-2');
  expect(listCaptions(root).map((e) => e.slug)).toEqual(['caption', 'pink-neon']);
  expect(() => removeCaption(root, 'pink-neon-2')).toThrow();
  expect(() => saveCaption(root, { name: ' ', params: { style: 'neon' } })).toThrow();
  expect(() => saveCaption(root, { name: 'empty', params: { text: 'only words' } })).toThrow();
  // a file that is not an entry is left out
  mkdirSync(captionsDir(root), { recursive: true });
  writeFileSync(join(captionsDir(root), 'broken.json'), '{');
  expect(listCaptions(root).length).toBe(2);
});
