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
  expect(() => removeCaption(root, 'pink-neon-2')).toThrow(expect.objectContaining({ code: 'library.noCaption' }));
  expect(() => saveCaption(root, { name: ' ', params: { style: 'neon' } })).toThrow(expect.objectContaining({ code: 'library.noName' }));
  expect(() => saveCaption(root, { name: 'empty', params: { text: 'only words' } })).toThrow(expect.objectContaining({ code: 'library.emptyCaption' }));
  // a file that is not an entry is left out
  mkdirSync(captionsDir(root), { recursive: true });
  writeFileSync(join(captionsDir(root), 'broken.json'), '{');
  expect(listCaptions(root).length).toBe(2);
});

test('My title templates live on their own shelf: a title keeps its look, never its words, kicker or sub', () => {
  const root = mkdtempSync(join(tmpdir(), 'lib-'));
  const a = saveCaption(root, { name: 'Gold doc', params: { style: 'gold', backing: 'rules', text: '七百年', kicker: '第一章', sub: '西恩納', template: 'doc-rules' } }, 'titles');
  expect(Object.keys(a.params).sort()).toEqual(['backing', 'style']);
  expect(listCaptions(root, 'titles').map((e) => e.slug)).toEqual(['gold-doc']);
  expect(listCaptions(root)).toEqual([]);   // not a caption template
  expect(() => removeCaption(root, 'gold-doc')).toThrow(expect.objectContaining({ code: 'library.noCaption' }));
  // a title's refusals are worded for titles
  expect(() => saveCaption(root, { name: ' ', params: { style: 'gold' } }, 'titles')).toThrow(expect.objectContaining({ code: 'library.noTitleName' }));
  expect(() => saveCaption(root, { name: 'words', params: { text: 'only words', kicker: 'k' } }, 'titles')).toThrow(expect.objectContaining({ code: 'library.emptyTitle' }));
  removeCaption(root, 'gold-doc', 'titles');
  expect(listCaptions(root, 'titles')).toEqual([]);
  expect(() => removeCaption(root, 'gold-doc', 'titles')).toThrow(expect.objectContaining({ code: 'library.noTitle' }));
});
