// Tellcut server API (apps/server). Every failure becomes an ApiError with the server's message and issues.
import type { Transcript } from '@tellcut/engine';
import type { ChatTask, GalleryIndex, JobInfo, Lang, LibraryIndex, LibrarySavePreview, LibraryUsage, PresetChoice, ProjectLibraryInfo, PresetInfo, SourceInfo } from '@tellcut/protocol';
import type { PeakInfo, ThumbInfo } from './store.ts';

export class ApiError extends Error {
  /** code, params: what the server's words mean, for the page to word in its language (errText) */
  constructor(public status: number, message: string, public issues: string[] = [], public code?: string, public params?: Record<string, string | number>) { super(message); }
}
export { isTerminal, type JobStatus } from '@tellcut/protocol';
/** the part of a job the export panel shows; an export's result is its file */
export type JobView = Pick<JobInfo, 'id' | 'label' | 'status' | 'progress' | 'message' | 'log' | 'error'> & { result?: { file: string; log: string; seconds: number } };
export interface ExportEntry { file: string; url: string; size: number; mtime: number; log: string | null }
/** A file inside the project folder, e.g. exports/<name>.mp4 (each path segment encoded). */
/** one import's answer: entries for project.json, the files left out (code + params for errText) and those already in the project */
export interface ImportResult { sources: Record<string, any>; media: Record<string, { path: string }>; skipped: Array<{ path: string; code: string; params?: Record<string, string>; message: string }>; same: Array<{ path: string; id: string }> }
export const fileUrl = (id: string, rel: string) => `/api/projects/${encodeURIComponent(id)}/files/${rel.split('/').map(encodeURIComponent).join('/')}`;

const enc = encodeURIComponent;
const jsonPost = (b: unknown): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });

/** this page's id: its saves name it (X-Tellcut-Client) and so does its live stream, so the server tells every other tab
 *  on the project of a save (changed-on-disk) and not this one */
const CLIENT = (() => { try { return globalThis.crypto.randomUUID(); } catch { return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`; } })();

/** the version (ETag) of each project as this page last read or wrote it: a save from an older one is refused (409) */
const versions = new Map<string, string>();

async function req<T>(url: string, init?: RequestInit, version?: string): Promise<T> {
  const r = await fetch(url, init);
  if (version !== undefined && r.ok) { const tag = r.headers.get('etag'); if (tag) versions.set(version, tag); }
  const json = (r.headers.get('content-type') ?? '').includes('json');
  const body: any = json ? await r.json() : await r.text();
  if (!r.ok) throw new ApiError(r.status, json ? body.error : String(body), json ? body.issues ?? [] : [], json ? body.code : undefined, json ? body.params : undefined);
  return body as T;
}

/** Reads a newline-delimited JSON response, one event per line, until it ends. */
async function ndjson(url: string, init: RequestInit | undefined, on: (e: any) => void): Promise<void> {
  const r = await fetch(url, init);
  if (!r.ok) { const b: any = await r.json().catch(() => ({})); throw new ApiError(r.status, b.error ?? `HTTP ${r.status}`, b.issues ?? [], b.code, b.params); }
  const reader = r.body!.getReader(), dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); if (line.trim()) on(JSON.parse(line)); }
  }
  if (buf.trim()) on(JSON.parse(buf));
}

export const api = {
  clientId: CLIENT as string | undefined,
  gallery: () => req<GalleryIndex>('/api/gallery'),
  projects: () => req<Array<{ id: string; name?: string; error?: string }>>('/api/projects'),
  project: (id: string) => req<unknown>(`/api/projects/${enc(id)}`, undefined, id),
  /** what deleting a project takes with it, and why it cannot go now (null when it can) */
  deletePreview: (id: string) => req<{ videos: number; fx: number; busy: string | null }>(`/api/projects/${enc(id)}/delete-preview`),
  deleteProject: (id: string) => req<{ ok: true }>(`/api/projects/${enc(id)}`, { method: 'DELETE' }),
  save: (id: string, p: unknown) => {
    const base = versions.get(id);
    return req<{ ok: true }>(`/api/projects/${enc(id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Tellcut-Client': CLIENT, ...(base ? { 'If-Match': base } : {}) }, body: JSON.stringify(p) }, id);
  },
  /** the next save writes over whatever is on disk (the user chose to keep this version: 忽略) */
  forgetVersion: (id: string) => { versions.delete(id); },
  history: (id: string) => req<string[]>(`/api/projects/${enc(id)}/history`),
  historyVersion: (id: string, name: string) => req<unknown>(`/api/projects/${enc(id)}/history/${enc(name)}`),
  analyze: (id: string) => req<{ jobs: Array<{ id: string; label: string }>; missing: string[]; extras?: Array<{ id: string; kind: string; label: string }> }>(`/api/projects/${enc(id)}/analyze`, { method: 'POST' }),
  thumbs: (id: string, source: string) => req<ThumbInfo>(`/api/projects/${enc(id)}/media/thumbs/${enc(source)}`),
  peaks: (id: string, source: string) => req<PeakInfo>(`/api/projects/${enc(id)}/media/peaks/${enc(source)}`),
  cuts: (id: string, source: string) => req<number[]>(`/api/projects/${enc(id)}/media/cuts/${enc(source)}`),
  musicPeaks: (id: string, media: string) => req<PeakInfo>(`/api/projects/${enc(id)}/media/music-peaks/${enc(media)}`),
  transcript: (id: string, source: string) => req<Transcript>(`/api/projects/${enc(id)}/media/transcript/${enc(source)}`),
  beats: (id: string, media: string) => req<{ bpm: number; offset: number; beats: number[] }>(`/api/projects/${enc(id)}/media/beats/${enc(media)}`),
  exportStart: (id: string) => req<JobView>(`/api/projects/${enc(id)}/export`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }),
  exports: (id: string) => req<ExportEntry[]>(`/api/projects/${enc(id)}/exports`),
  job: (jobId: string) => req<JobView>(`/api/jobs/${enc(jobId)}`),
  jobs: () => req<Array<JobView & { kind: string; project: string }>>('/api/jobs'),
  cancelJob: (jobId: string) => req<{ ok: true }>(`/api/jobs/${enc(jobId)}`, { method: 'DELETE' }),
  /** The live link (spec 2026-10-15-proposals-magnetic §5): one SSE stream per open project; returns the closer. */
  events: (id: string, on: (m: any) => void) => {
    const es = new EventSource(`/api/projects/${enc(id)}/events?client=${enc(CLIENT)}`);
    es.onmessage = (e) => { try { on(JSON.parse(e.data)); } catch { /* a garbled message is skipped */ } };
    return () => es.close();
  },
  proposal: (id: string) => req<unknown>(`/api/projects/${enc(id)}/proposal`),
  proposalResult: (id: string, b: { id: string; outcome: 'accepted' | 'rejected' | 'stale'; reason?: string }) =>
    req<unknown>(`/api/projects/${enc(id)}/proposal/result`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }),
  /** the media panel's Import (spec 2026-10-29-media-import): files looked at and named by the server, NDJSON progress then the result;
   *  project.json is not written (the editor adds them as an edit) */
  importMedia: async (id: string, b: { paths: string[]; taken: string[]; have: Array<{ id: string; path: string }> }, onProgress?: (done: number, total: number) => void): Promise<ImportResult> => {
    let out: ImportResult | null = null, err: { error: string; code?: string; params?: Record<string, string> } | null = null;
    await ndjson(`/api/projects/${enc(id)}/import`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }, (e) => {
      if (e.progress !== undefined) onProgress?.(e.progress, e.total); else if (e.done) out = e; else if (e.error) err = e;
    });
    if (err) { const x = err as { error: string; code?: string; params?: Record<string, string> }; throw new ApiError(500, x.error, [], x.code, x.params); }
    if (!out) throw new ApiError(500, 'The import ended without a result');
    return out;
  },
  /** the import browser (home page, editor chat): places and folder listings from the server (paths only) */
  places: () => req<{ places: import('./ImportDialog.tsx').Place[] }>('/api/fs/places'),
  fsList: (path: string) => req<{ path: string; parent: string | null; entries: any[] }>(`/api/fs/list?path=${enc(path)}`),
  /** Chat (spec 2026-10-16-in-editor-chat §3.3): a thread, and its turns streamed back as NDJSON chat events. */
  chat: (thread: string) => req<{ thread: { messages: any[]; sessionId: string; started: boolean }; running: { text: string; tools: any[] } | null }>(`/api/chat/${enc(thread)}`),
  /** from: 'editor' in the project's editor, 'home' when its chat is used from the home page (its editor is not open);
   *  sources: the APIs ticked in the menu, which go with the message (the page keeps none) */
  chatSend: (thread: string, text: string, on: (e: any) => void, from: 'home' | 'editor', preset?: PresetChoice, lang?: Lang, sources?: string[], task?: ChatTask) =>
    ndjson(`/api/chat/${enc(thread)}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, from, preset: preset?.id, styles: preset?.styles, fields: preset?.fields, lang, sources, task }) }, on),
  /** My blocks (spec 2026-10-29-my-library §4.2–4.4): the library, a project's copies from it, saving into it, copying an entry in */
  library: () => req<LibraryIndex>('/api/library'),
  projectLibrary: (id: string) => req<ProjectLibraryInfo>(`/api/projects/${enc(id)}/library`),
  saveBlockPreview: (b: { project: string; type: string }) => req<LibrarySavePreview>('/api/library/blocks?dry=1', jsonPost(b)),
  saveBlock: (b: { project: string; type: string; name?: string; desc?: string; category?: string; onConflict?: 'replace' | 'keep-both' }) => req<{ entry: { slug: string }; skipped: string[] }>('/api/library/blocks', jsonPost(b)),
  saveStyle: (b: { project: string; id: string; name?: string; desc?: string; onConflict?: 'replace' | 'keep-both' }) => req<{ entry: { slug: string } }>('/api/library/styles', jsonPost(b)),
  useLibrary: (id: string, b: { slug: string } | { style: string }) => req<{ file: string; types?: string[]; id?: string; copied?: string[] }>(`/api/projects/${enc(id)}/library/use`, jsonPost(b)),
  renameLibraryBlock: (slug: string, type: string, b: { name?: string; desc?: string; category?: string }) => req<unknown>(`/api/library/blocks/${enc(slug)}/types/${enc(type)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }),
  renameLibraryStyle: (slug: string, b: { name?: string; desc?: string }) => req<unknown>(`/api/library/styles/${enc(slug)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }),
  libraryUsage: (kind: 'blocks' | 'styles', slug: string) => req<LibraryUsage>(`/api/library/${kind}/${enc(slug)}/usage`),
  deleteLibrary: (kind: 'blocks' | 'styles', slug: string) => req<{ ok: true }>(`/api/library/${kind}/${enc(slug)}`, { method: 'DELETE' }),
  /** the agent's draft of a preset of the user's own (404 until it is written) */
  presetDraft: (id: string) => req<unknown>(`/api/projects/${enc(id)}/preset-draft`),
  deletePresetDraft: (id: string) => req<{ ok: true }>(`/api/projects/${enc(id)}/preset-draft`, { method: 'DELETE' }),
  /** presets of the user's own (spec 2026-10-29-my-library §3.5–3.7): saved from a film or the custom form, edited, given a poster, deleted */
  savePreset: (b: Record<string, unknown>) => req<PresetInfo>('/api/presets', jsonPost(b)),
  updatePreset: (id: string, b: Record<string, unknown>) => req<PresetInfo>(`/api/presets/${enc(id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }),
  deletePreset: (id: string) => req<{ ok: true }>(`/api/presets/${enc(id)}`, { method: 'DELETE' }),
  presetPoster: (id: string, file: Blob) => req<PresetInfo>(`/api/presets/${enc(id)}/poster`, { method: 'POST', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file }),
  /** the home page's presets (spec 2026-10-23-presets-and-languages §3.3) */
  presets: () => req<{ presets: PresetInfo[] }>('/api/presets'),
  chatAttach: (thread: string, on: (e: any) => void, signal?: AbortSignal) => ndjson(`/api/chat/${enc(thread)}/stream`, signal ? { signal } : undefined, on),
  chatStop: (thread: string) => req<{ stopped: boolean }>(`/api/chat/${enc(thread)}/stop`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }),
  chatClear: (thread: string) => req<{ ok: true }>(`/api/chat/${enc(thread)}`, { method: 'DELETE' }),
  /** the API menu (spec 2026-10-24-api-picker §3): every outside source */
  sources: () => req<{ sources: SourceInfo[] }>('/api/sources'),
  /** "Ask Agent…": stores the request; the server adds its time range (spec 2026-10-16-right-click-claude §3) */
  request: (id: string, b: { text: string; selection: string[]; playhead: number }) =>
    req<{ id: string; range: [number, number] | null }>(`/api/projects/${enc(id)}/requests`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }),
  editorState: (id: string, b: { selection: string[]; playhead: number }) =>
    req<{ ok: true }>(`/api/projects/${enc(id)}/editor-state`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }),
  /** Resolves with the job's final status (done | failed | cancelled). One SSE stream per source would use up the browser's
   *  six connections to the server and stall saves, and one poll per job was dozens of requests a second for a big
   *  project: every waiting job is answered by one shared list request a second. */
  waitJob: (jobId: string, interval = 1000): Promise<string> => waitJobs.wait(jobId, interval),
};

/** The shared poller behind api.waitJob (exported for tests). */
export function jobWaiter(list: () => Promise<Array<{ id: string; status: string }>>) {
  const waiting = new Map<string, Array<(status: string) => void>>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  const tick = async (interval: number) => {
    timer = null;
    let jobs: Array<{ id: string; status: string }> | null = null;
    try { jobs = await list(); } catch { /* a transient network error: try again next time */ }
    if (jobs) {
      const byId = new Map(jobs.map((j) => [j.id, j.status]));
      for (const [id, resolvers] of [...waiting]) {
        const st = byId.get(id);
        // absent: finished long ago and pruned from the server's list
        const final = st === undefined ? 'failed' : ['done', 'failed', 'cancelled'].includes(st) ? st : null;
        if (final) { waiting.delete(id); for (const r of resolvers) r(final); }
      }
    }
    if (waiting.size) timer = setTimeout(() => void tick(interval), interval);
  };
  return {
    wait(jobId: string, interval = 1000): Promise<string> {
      return new Promise((resolve) => {
        waiting.set(jobId, [...(waiting.get(jobId) ?? []), resolve]);
        if (!timer) timer = setTimeout(() => void tick(interval), 0);
      });
    },
  };
}
const waitJobs = jobWaiter(() => req<Array<{ id: string; status: string }>>('/api/jobs'));
export type Api = typeof api;
