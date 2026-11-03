// Ctrl in the UI's words is ⌘ on a Mac (the shortcuts take either key; Ctrl+click is a right-click there).
import { isMac, keyWords } from './platform.ts';
import { SHORTCUTS } from './help.ts';

test('a Mac is told by userAgentData, else navigator.platform', () => {
  expect([isMac({ platform: 'MacIntel' }), isMac({ userAgentData: { platform: 'macOS' }, platform: '' }), isMac({ platform: 'Win32' }), isMac({ platform: 'Linux x86_64' }), isMac(undefined)])
    .toEqual([true, true, false, false, false]);
});

test('on a Mac the key words say ⌘, elsewhere they stay Ctrl', () => {
  expect(keyWords('Undo (Ctrl+Z)', true)).toBe('Undo (⌘+Z)');
  expect(keyWords('請按 Ctrl+C 複製', true)).toBe('請按 ⌘+C 複製');
  expect(keyWords('Ctrl＋拖曳影片的邊緣；按住 Ctrl 暫時不吸附', true)).toBe('⌘＋拖曳影片的邊緣；按住 ⌘ 暫時不吸附');
  expect(keyWords('Undo (Ctrl+Z)', false)).toBe('Undo (Ctrl+Z)');
  expect(SHORTCUTS.map((k) => keyWords(k.label, true)).filter((l) => l.includes('Ctrl'))).toEqual([]);
});
