import { trackLabel } from './trackNames.ts';

test('old default track names map to English, other names stay as they are', () => {
  expect(['主軌', '文字', '音樂', '原音', '背景效果', '最上層', '音效', '模糊底', '背景', '面板外框', '旁白', '字幕'].map(trackLabel)).toEqual(
    ['Main', 'Text', 'Music', 'Source', 'Background FX', 'Top', 'SFX', 'Blurred fill', 'Background', 'Panel frame', 'Narration', 'Captions']);
  expect(trackLabel('我的軌道')).toBe('我的軌道');
  expect(trackLabel('Main')).toBe('Main');
  expect(trackLabel('Original audio')).toBe('Source');
  expect(trackLabel('toString')).toBe('toString');
});

test('the old numbered layer names map to English', () => {
  expect(['第 1 條', '第 12 條'].map(trackLabel)).toEqual(['Layer 1', 'Layer 12']);
  expect(trackLabel('第 x 條')).toBe('第 x 條');
});
