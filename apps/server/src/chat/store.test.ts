import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chatFile, readThread, writeThread } from './store.ts';

test('threads live in .history/chat.json (home in _home), start fresh, and a reply cut off by a restart reads as interrupted', () => {
  const root = mkdtempSync(join(tmpdir(), 'chat-'));
  expect(chatFile(root, 'home')).toBe(join(root, '_home', 'chat.json'));
  expect(chatFile(root, 'seattle')).toBe(join(root, 'seattle', '.history', 'chat', 'chat.json'));   // a folder: not among the versions
  const f = chatFile(root, 'seattle'), t = readThread(f);
  expect([t.started, t.messages, t.sessionId]).toEqual([false, [], expect.stringMatching(/^[0-9a-f-]{36}$/)]);
  writeThread(f, { ...t, started: true, messages: [{ role: 'user', text: 'x', time: 'a' }, { role: 'assistant', text: '一', time: 'b' }] });
  expect(readThread(f).messages[1].status).toBe('interrupted');
  expect(() => chatFile(root, '../evil')).toThrow();
});

test('a chat file that parses but is not a thread starts a fresh one instead of breaking the chat', () => {
  const root = mkdtempSync(join(tmpdir(), 'chat-')), f = chatFile(root, 'p');
  writeThread(f, {} as any);
  expect(readThread(f).messages).toEqual([]);
  writeThread(f, null as any);
  expect(readThread(f).messages).toEqual([]);
});
