import { withAttachments } from './attachments.ts';

test('attached material goes after the words as one full path per line; material alone asks for a new project', () => {
  const a = [{ path: 'D:\\旅遊\\京都', name: '京都', kind: 'dir' as const }, { path: 'C:\\x\\song.mp3', name: 'song.mp3', kind: 'audio' as const }];
  expect(withAttachments('剪一支直式短片', a)).toBe('剪一支直式短片\n\n素材：\n- D:\\旅遊\\京都\n- C:\\x\\song.mp3');
  expect(withAttachments('  ', a)).toBe('用這些素材建一個新專案\n\n素材：\n- D:\\旅遊\\京都\n- C:\\x\\song.mp3');
  expect(withAttachments('只有字', [])).toBe('只有字');
});

test('in the editor, material alone asks to use it in this film, not for a new project', () => {
  const a = [{ path: 'D:\\x\\menu.jpg', name: 'menu.jpg', kind: 'image' as const }];
  expect(withAttachments('', a, 'editor')).toBe('看看這些素材，用在這支片裡\n\n素材：\n- D:\\x\\menu.jpg');
  expect(withAttachments('換成這張', a, 'editor')).toBe('換成這張\n\n素材：\n- D:\\x\\menu.jpg');
});

test('the default words and the header follow the UI language', async () => {
  const { setLang } = await import('./i18n/lang.ts');
  const a = [{ path: '/mnt/x', name: 'x', kind: 'dir' as const }];
  setLang('en');
  try { expect(withAttachments(' ', a)).toBe('Make a new project from this material\n\nMaterial:\n- /mnt/x'); }
  finally { setLang('zh'); }
});
