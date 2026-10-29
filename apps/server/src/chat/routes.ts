// Chat routes (spec 2026-10-16-in-editor-chat §3.3): a turn's reply streams back as NDJSON chat events.
import type { ServerResponse } from 'node:http';
import { HttpError, readJson, sendJson, type Router } from '../http.ts';
import type { ProjectStore } from '../projects.ts';
import { chatFile, closeDangling, freshThread, isHome, readThread, writeThread } from './store.ts';
import { withRecovered } from './recover.ts';
import type { ChatRunner } from './runner.ts';
import { taskBlock } from './tasks.ts';
import type { JobInfo, JobQueue } from '../jobs.ts';
import { analysisState, analysisStatus, type AnalysisState } from '@tellcut/protocol';
import type { ChatEvent } from './stream.ts';
import { cleanFields, fieldsNote, findPreset, missingPresetBlock, presetBlock, type PresetDirs } from '@tellcut/media-node';
import type { Lang, PresetChoice } from '@tellcut/protocol';
import { ADAPTERS } from '@tellcut/media-node';

function ndjson(res: ServerResponse) {
  res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' });
  return (e: ChatEvent) => { if (res.writableEnded) return; res.write(JSON.stringify(e) + '\n'); if (e.type === 'done') res.end(); };
}

/** the message the server sends when a project's analysis is done and its chat was waiting for it */
export const ANALYSIS_DONE = '(Automatic message) The footage analysis is done, transcripts included. Carry on from where you stopped.';
const JOB_NAMES: Record<string, string> = { analyze: 'basic analysis', extras: 'contact sheets and transcript', beats: 'music beats' };
/** the same message when part of the analysis did not finish: which parts and why, so the agent goes on with what there is */
export const analysisPartly = (missed: JobInfo[]) => `(Automatic message) The footage analysis is over, but part of it did not finish: ${missed
  .map((j) => `${JOB_NAMES[j.kind] ?? j.kind} of "${j.label}" (${j.status === 'cancelled' ? 'cancelled' : (j.error ?? 'failed').slice(0, 300)})`).join('; ')}. `
  + 'Carry on from where you stopped with what there is, and tell the user what is missing.';

// the page's language, told to Claude at the head of every message; anything but the three languages adds nothing
const LANG_NAMES: Record<Lang, string> = { zh: 'Traditional Chinese (繁體中文)', en: 'English', ja: 'Japanese (日本語)' };
const isLang = (x: unknown): x is Lang => typeof x === 'string' && Object.hasOwn(LANG_NAMES, x);
const langLine = (x: unknown): string | null => isLang(x) ? `(UI language: ${LANG_NAMES[x]})` : null;

export function chatRoutes(r: Router, store: ProjectStore, runner: ChatRunner, queue?: JobQueue, presetDirs?: PresetDirs) {
  /** home, or an existing project (with the line telling Claude which one it is, and whether its editor is the page talking) */
  const threadOf = (id: string, from?: unknown): { context: string | null } => {
    if (isHome(id)) return { context: null };
    const p = store.read(id), pre = p.meta.preset, found = pre && presetDirs ? findPreset(presetDirs, pre.id) : null;
    // a project made from a preset: its name and where Claude can read it again (the full prompt went with the first message)
    const opts = found && pre ? fieldsNote(found, pre.fields) : '';
    const note = !pre ? '' : found ? ` Preset: ${found.name.en ?? found.name.zh ?? found.id} (${found.file}; read it again when needed).${opts ? ` ${opts}` : ''}` : ` Preset: ${pre.id}.`;
    const line = (s: string) => (note ? s.replace(/\)$/, `${note})`) : s);
    return { context: line(from === 'home'
      ? `(Current project: ${p.meta.name} (${id}). The user is talking to you from the home page's chat box and the editor is not open: for a proposal, ask them to click the project on the left to preview it in the editor.)`
      : from === 'auto' ? `(Current project: ${p.meta.name} (${id}). The server sent this message by itself; the user may not be watching.)`
      : from === 'editor' ? `(Current project: ${p.meta.name} (${id}). The editor is open.)`
      // a client that does not say (a script, curl): nothing about the editor rather than a guess
      : `(Current project: ${p.meta.name} (${id}).)`) };
  };
  const file = (id: string) => chatFile(store.root, id);
  /** the project's material is being analysed (the page shows it, and waits for the automatic message) */
  const analyzing = (id: string): string | null => (isHome(id) || !queue ? null : analysisStatus([...queue.active('analyze', id), ...queue.active('extras', id)]));

  const analysis = (id: string): AnalysisState | null => (isHome(id) || !queue ? null : analysisState([...queue.active('analyze', id), ...queue.active('extras', id)]));

  r.get('/api/chat/:thread', (_req, res, { thread }) => {
    threadOf(thread);
    const running = runner.running(thread), elsewhere = runner.elsewhere(thread);
    let t = readThread(file(thread));
    // a reply that finished while the server was down is put back from Claude's own log (and kept); one another server
    // runs is that server's to save (put back here too, it appeared twice)
    const back = running || elsewhere ? null : withRecovered(t);
    if (back) { writeThread(file(thread), back); t = back; }
    // a turn another server runs is not over either: its last message is not "interrupted"
    sendJson(res, 200, { thread: running || elsewhere ? t : closeDangling(t), running, analyzing: analyzing(thread), analysis: analysis(thread) });
  });

  r.post('/api/chat/:thread/messages', async (req, res, { thread }) => {
    const b: any = await readJson(req), { context } = threadOf(thread, b?.from);
    const text = typeof b?.text === 'string' ? b.text.trim() : '';
    // a preset picked on the home page: its prompt goes to Claude with the message; the thread keeps only which one it was
    const asked = typeof b?.preset === 'string' && b.preset ? b.preset : null;
    if (!text && !asked) throw new HttpError(400, '訊息是空的', { code: 'chat.empty' });
    if (runner.running(thread) || runner.elsewhere(thread)) throw new HttpError(409, '還在回覆中', { code: 'chat.busy' });
    const found = asked && presetDirs ? findPreset(presetDirs, asked) : null;
    const styles = Array.isArray(b?.styles) ? b.styles.filter((x: unknown): x is string => typeof x === 'string') : [];
    const fields = found ? cleanFields(found, b?.fields) : {}, anyField = Object.keys(fields).length > 0;
    const preset: PresetChoice | undefined = found ? { id: found.id, styles: styles.filter((x: string) => found.styles.some((s) => s.id === x)), ...(anyField ? { fields } : {}) } : undefined;
    const block = asked ? (found ? presetBlock(found, styles, fields) : missingPresetBlock(asked)) : null;
    // a button's task (save to My blocks, save as my preset…): words for the agent, not kept in the thread
    const task = taskBlock(b?.task, isHome(thread) ? null : thread);
    // the sources ticked in the API menu come with each message (the page keeps no ticks): this turn and the automatic one after
    // its analysis use them; ids Tellcut has no adapter for are dropped. A client that sends none (a script) keeps the last ones.
    const sources = Array.isArray(b?.sources) ? [...new Set<string>(b.sources.filter((x: unknown): x is string => typeof x === 'string' && Object.hasOwn(ADAPTERS, x)))] : undefined;
    const send = ndjson(res);
    if (!runner.send(thread, text, [langLine(b?.lang), context, block, task].filter(Boolean).join('\n\n') || null, send, { preset, lang: isLang(b?.lang) ? b.lang : undefined, sources })) { send({ type: 'done', status: 'error', text: '', error: '還在回覆中', code: 'chat.busy' }); return; }
    // the page may leave: the turn goes on and is saved; it can attach again
    res.on('close', () => {});
  });

  r.get('/api/chat/:thread/stream', (_req, res, { thread }) => {
    threadOf(thread);
    const send = ndjson(res), off = runner.attach(thread, send);
    if (!off) { send({ type: 'done', status: 'done', text: '' }); return; }
    res.on('close', off);
  });

  r.post('/api/chat/:thread/stop', (_req, res, { thread }) => {
    threadOf(thread);
    sendJson(res, 200, { stopped: runner.stop(thread) });
  });

  r.del('/api/chat/:thread', (_req, res, { thread }) => {
    threadOf(thread);
    // another server on the same projects/ answering it would append its reply to the emptied conversation
    if (runner.running(thread) || runner.elsewhere(thread)) throw new HttpError(409, '還在回覆中', { code: 'chat.busy' });
    writeThread(file(thread), freshThread());
    sendJson(res, 200, { ok: true });
  });

  return {
    /**
     * A project's analysis started at `since` is done. If its chat ended a turn while it ran (Claude said it would go on once
     * the transcript is there) and nobody has written since, the chat is told to go on — the page that shows it picks it up.
     * jobs: how each of them ended. Nothing done (all failed or cancelled, a failure run again): no automatic (paid) turn, it has
     * nothing new to go on with; some of it failed: the message says which.
     */
    afterAnalysis(id: string, since: number, jobs: JobInfo[]) {
      if (runner.running(id) || analyzing(id)) return;
      if (!jobs.some((j) => j.status === 'done')) return;
      const missed = jobs.filter((j) => j.status !== 'done');
      let th;
      try { th = readThread(file(id)); store.read(id); } catch { return; }   // a project deleted meanwhile
      const last = th.messages.at(-1);
      if (!last || last.role !== 'assistant' || last.status !== 'done' || Date.parse(last.time) < since) return;
      // in the language the user last wrote from: without it the agent would answer in the language of this English line
      runner.send(id, missed.length ? analysisPartly(missed) : ANALYSIS_DONE, [langLine(th.lang), threadOf(id, 'auto').context].filter(Boolean).join('\n\n'), () => {},
        { auto: missed.length ? 'analysis-partial' : 'analysis' });
    },
  };
}
