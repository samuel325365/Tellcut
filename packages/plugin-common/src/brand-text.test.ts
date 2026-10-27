// The brand film's canvas text: the faces it draws with are loaded before the first frame, Noto Sans TC too when the text has
// Chinese or Japanese (a canvas draws a face that is not loaded yet in a system font).
import { CJK_FACE, loadLineFaces } from './brand-text.ts';

const fakeFonts = () => { const calls: Array<[string, string]> = []; return { calls, set: { load: async (font: string, text: string) => { calls.push([font, text]); return []; } } as unknown as FontFaceSet }; };

test('Latin text loads only its own face; Chinese and Japanese add Noto Sans TC at the same weight', async () => {
  const f = fakeFonts();
  await loadLineFaces(f.set, [{ weight: 300, family: 'Inter', text: 'Tell it. It cuts.' }, { weight: 600, family: 'Inter', text: 'tellcut.app' }]);
  expect(f.calls).toEqual([['300 40px "Inter"', 'Tell it. It cuts.'], ['600 40px "Inter"', 'tellcut.app']]);
  const g = fakeFonts();
  await loadLineFaces(g.set, [{ weight: 300, family: 'Inter', text: '每天清晨四點揉麵' }, { weight: 600, family: 'Inter', text: 'パン屋.jp' }]);
  expect(g.calls).toEqual(expect.arrayContaining([['300 40px "Noto Sans TC"', '每天清晨四點揉麵'], ['600 40px "Noto Sans TC"', 'パン屋.jp']]));
  expect(g.calls).toHaveLength(4);
});

test('an empty line still loads its face once; Noto Sans TC as the family is not loaded twice; no font set, nothing to do', async () => {
  const f = fakeFonts();
  await loadLineFaces(f.set, [{ weight: 300, family: 'Inter', text: '' }, { weight: 300, family: 'Inter', text: '' }, { weight: 600, family: CJK_FACE, text: '台北' }]);
  expect(f.calls).toEqual([['300 40px "Inter"', 'A'], ['600 40px "Noto Sans TC"', '台北']]);
  await expect(loadLineFaces(undefined, [{ weight: 300, family: 'Inter', text: '台北' }])).resolves.toBeUndefined();
});

test('a face that fails to load does not stop the others', async () => {
  const calls: string[] = [];
  const set = { load: async (font: string) => { calls.push(font); if (font.includes('Inter')) throw new Error('offline'); return []; } } as unknown as FontFaceSet;
  await expect(loadLineFaces(set, [{ weight: 600, family: 'Inter', text: '台北' }])).resolves.toBeUndefined();
  expect(calls).toEqual(['600 40px "Inter"', '600 40px "Noto Sans TC"']);
});
