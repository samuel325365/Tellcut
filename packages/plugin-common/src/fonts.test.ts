import { TEXT_FONTS } from '@tellcut/engine';
import { commonPlugin } from './index.ts';

test('Japanese has its own face: Noto Sans TC draws Japanese kanji in their Chinese forms', () => {
  // the weights the blocks draw at (captions 500, titles 700 and 900, body 400)
  expect(commonPlugin.fonts).toContain('Noto Sans JP:wght@400;500;700;900');
  expect(TEXT_FONTS).toContain('Noto Sans JP');   // core.caption's font menu
});
