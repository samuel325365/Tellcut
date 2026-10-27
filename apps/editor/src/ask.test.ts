import { fixture } from '../../../packages/engine/src/commands/test-fixture.ts';
import { askLines, askMessage } from './ask.ts';

test('the copied message names the project, the instruction, the selection and the command to read it', () => {
  expect(askMessage({ name: '西雅圖', id: 'seattle', text: '換一個更亮的鏡頭', selection: ['clip-3', 'fx-7'], playhead: 8, range: [7.687, 10.651] }))
    .toBe('請改 Tellcut 專案「西雅圖」（seattle）：換一個更亮的鏡頭\n（選取 clip-3、fx-7，7.69–10.65 秒；詳細：npm run tellcut -- request seattle）');
  expect(askMessage({ name: 'x', id: 'x', text: '加字幕', selection: [], playhead: 12.3, range: null }))
    .toBe('請改 Tellcut 專案「x」（x）：加字幕\n（播放頭 12.30 秒附近；詳細：npm run tellcut -- request x）');
  expect(askMessage({ name: 'x', id: 'x', text: 'y', selection: ['a', 'b', 'c', 'd', 'e', 'f', 'g'], playhead: 0, range: [0, 1] }))
    .toContain('選取 a、b、c、d、e 等 7 個');
});

test('the dialog lists what is selected with times, or the playhead', () => {
  expect(askLines(fixture(), ['c2'], 0)).toEqual(['s（c2）4.00–8.00 秒']);   // a clip shows its source
  expect(askLines(fixture(), [], 3.5)).toEqual(['播放頭 3.50 秒附近']);
});
