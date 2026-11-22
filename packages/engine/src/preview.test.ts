import { blockPreviewProject, BLOCK_PREVIEW_LEN, PREVIEW_GROUND } from './preview.ts';
import { parseProject } from './schema.ts';

test('a block alone: one track of it over the plain ground, no sources', () => {
  const p = blockPreviewProject({ type: 'common.slam', kind: 'overlay', plugins: ['common'], params: { text: 'x' } });
  expect(p.sources).toEqual({});
  expect(p.tracks).toEqual([{ id: 'g', kind: 'overlay', items: [{ id: 'block', type: 'common.slam', start: 0, end: BLOCK_PREVIEW_LEN, params: { text: 'x' } }] }]);
  expect(() => parseProject(p)).not.toThrow();
});

test('with a ground, the gallery street plays on a video track under the block for the whole film', () => {
  const p = blockPreviewProject({ type: 'common.grade', kind: 'overlay', plugins: ['common'], ground: true, theme: { palette: { accent: '#ff0000' } } });
  // the photo source the gallery player asks the server for (/api/projects/_gallery/media/image/street), full frame
  expect(p.sources).toEqual({ [PREVIEW_GROUND]: expect.objectContaining({ kind: 'image', width: 1080, height: 1920, duration: BLOCK_PREVIEW_LEN }) });
  expect(p.tracks.map((t) => t.kind)).toEqual(['video', 'overlay']);
  expect(p.tracks[0].items).toEqual([expect.objectContaining({ source: PREVIEW_GROUND, start: 0, end: BLOCK_PREVIEW_LEN, in: 0, speed: 1 })]);
  expect(p.tracks[1].items[0]).toMatchObject({ type: 'common.grade', start: 0, end: BLOCK_PREVIEW_LEN });
  // the rest is the plain film's: the theme, the size, the length
  expect(p.meta).toMatchObject({ width: 1080, height: 1920, duration: BLOCK_PREVIEW_LEN, theme: { palette: { accent: '#ff0000' } } });
  const parsed = parseProject(p);
  expect(parsed.sources[PREVIEW_GROUND].kind).toBe('image');
});
