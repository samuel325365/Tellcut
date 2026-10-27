// Chat threads on disk (spec 2026-10-16-in-editor-chat §3.1): a project's in its .history/chat.json, the home chat in
// _home/chat.json (both ignored by git; `_home` is not a project).
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { PROJECT_ID, renameRetry } from '@tellcut/media-node';
import { HttpError } from '../http.ts';
import type { ChatMessage, ChatThread } from '@tellcut/protocol';

export type { ChatMessage, ChatThread };

const ID = PROJECT_ID;
/** a home-page conversation of its own (one per browser, a fresh one after it became a project): many people can start at once */
export const HOME_DRAFT = /^home-[a-z0-9]{6,24}$/;
/** 'home' (the old single home chat) or a home draft: a conversation not about a project yet */
export const isHome = (thread: string) => thread === 'home' || HOME_DRAFT.test(thread);
export function chatFile(projectsDir: string, thread: string): string {
  if (thread === 'home') return join(projectsDir, '_home', 'chat.json');
  if (HOME_DRAFT.test(thread)) return join(projectsDir, '_home', `${thread}.json`);
  if (!ID.test(thread)) throw new HttpError(400, `Invalid chat "${thread}"`);
  // in a folder of its own: .history/*.json are the project's versions
  return join(projectsDir, thread, '.history', 'chat', 'chat.json');
}

export const freshThread = (): ChatThread => ({ sessionId: randomUUID(), started: false, messages: [] });

export function readThread(file: string): ChatThread {
  let t: ChatThread;
  try { t = JSON.parse(readFileSync(file, 'utf8')); } catch { return freshThread(); }
  // a file that parses but is not a thread (hand-edited, cut short) would break every chat route of the project
  if (!t || typeof t !== 'object' || !Array.isArray(t.messages)) return freshThread();
  // a reply the server never finished (it was restarted) reads as interrupted
  const last = t.messages.at(-1);
  if (last?.role === 'assistant' && !last.status) last.status = 'interrupted';
  // the session id goes onto claude's command line: anything but a UUID starts a new conversation
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(t.sessionId))) { t.sessionId = randomUUID(); t.started = false; }
  return t;
}

/** A user message with no reply after it (the server stopped mid-turn) gets an interrupted reply. */
export function closeDangling(t: ChatThread): ChatThread {
  if (t.messages.at(-1)?.role === 'user') t.messages.push({ role: 'assistant', text: '', time: new Date().toISOString(), status: 'interrupted' });
  return t;
}

export function writeThread(file: string, t: ChatThread) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(t, null, 2) + '\n');
  renameRetry(tmp, file);
}
