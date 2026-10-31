// What the Editor's unit tests share (editor*.test.ts): a fake API and player bridge, a proposal and a live event stream, small
// project fixtures and lookups.
import { fixture } from '../../../packages/engine/src/commands/test-fixture.ts';
import { ApiError } from './api.ts';
import { Editor } from './editor.ts';

export function fakes(over: Record<string, any> = {}) {
  const saved: unknown[] = [], bridge: any = { calls: [] as any[] };
  for (const k of ['load', 'patch', 'seek', 'play', 'pause', 'cropMode', 'quality', 'select']) bridge[k] = (...a: any[]) => bridge.calls.push([k, ...a]);
  const api: any = { project: async () => fixture(), save: async (_: string, p: unknown) => { saved.push(p); }, history: async () => ['h1.json'],
    analyze: async () => ({ jobs: [], missing: [] }), thumbs: async () => { throw new ApiError(409, 'x'); }, peaks: async () => { throw new ApiError(409, 'x'); },
    musicPeaks: async () => ({ rate: 100, peaks: [] }), cuts: async () => [], waitJob: async () => 'done',
    exportStart: async () => ({ id: 'e1', label: 'x', status: 'queued', progress: 0, message: '', log: [] }), job: async () => ({ id: 'e1', label: 'x', status: 'done', progress: 1, message: '', log: [] }),
    jobs: async () => [], cancelJob: async () => ({ ok: true }), exports: async () => [],
    beats: async () => { throw new ApiError(409, 'x'); }, transcript: async () => { throw new ApiError(409, 'x'); }, ...over };
  return { api, bridge, saved };
}

export const tracksOf = (p: any, kind: string) => p.tracks.filter((t: any) => t.kind === kind);

/** what the preview plays: an audition goes to the player only, the timeline keeps showing the real project */
export const shown = (bridge: any): any => bridge.calls.filter((c: any) => c[0] === 'patch').at(-1)[1];

export const withPhoto = () => { const p: any = fixture(); p.sources.ph = { path: 'p.jpg', duration: 3600, width: 900, height: 1200, kind: 'image' }; return p; };

export function live() {
  const results: any[] = [], states: any[] = [];
  let on: (m: any) => void = () => {};
  const over = { events: (_id: string, f: (m: any) => void) => { on = f; return () => {}; }, proposal: async () => null,
    proposalResult: async (_id: string, b: any) => { results.push(b); return {}; }, editorState: async (_id: string, b: any) => { states.push(b); return {}; } };
  return { over, results, states, send: (m: any) => on(m) };
}

export const prop = (ops: any[]) => ({ id: 'p1', label: '剪短', ops, status: 'pending' });

export const magneticFixture = () => { const p: any = fixture(); p.tracks.find((t: any) => t.id === 'v').magnetic = true; return p; };

export const ids = (ed: Editor, track: string) => (ed.store.get().project!.tracks.find((t) => t.id === track)!.items as any[]).map((i) => i.id);
