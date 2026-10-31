// The Editor: exporting (saving first, following the job, refusals, a lost server).
import { moveItems } from '@tellcut/engine';
import { ApiError } from './api.ts';
import { Editor } from './editor.ts';
import { fakes } from './editor-test-kit.ts';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

test('export saves pending edits first, follows the job to the end and refreshes the history', async () => {
  const order: string[] = [];
  const states: any[] = [{ status: 'running', progress: 0.5, message: 'frame 5/10' }, { status: 'done', progress: 1, result: { file: 'exports/a.mp4', log: 'exports/a.log', seconds: 3 } }];
  const { api, bridge } = fakes({
    save: async () => { order.push('save'); },
    exportStart: async () => { order.push('export'); return { id: 'e1', label: 'x', status: 'queued', progress: 0, message: '', log: [] }; },
    job: async () => ({ id: 'e1', label: 'x', message: '', log: [], ...states.shift() }),
    exports: async () => [{ file: 'exports/a.mp4', url: '/x', size: 1, mtime: 1, log: null }],
  });
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  ed.apply((d) => moveItems(d, { ids: ['c1'], dt: 1 }));   // not saved yet (1 s debounce)
  const done = ed.exportVideo();
  await vi.advanceTimersByTimeAsync(0);
  expect(order).toEqual(['save', 'export']);
  expect(ed.store.get().exportOpen).toBe(true);
  await vi.advanceTimersByTimeAsync(2000);
  await done;
  expect(ed.store.get().exportJob!.status).toBe('done');
  expect(ed.store.get().exports.length).toBe(1);
});

test('a refused export (one already running) and a failed save show why, and nothing is started', async () => {
  const { api, bridge } = fakes({ exportStart: async () => { throw new ApiError(409, 'An export is already queued or running'); } });
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  await ed.exportVideo();
  expect([ed.store.get().exportJob, ed.store.get().exportError]).toEqual([null, '無法開始輸出：An export is already queued or running']);
  const started: string[] = [];
  const f = fakes({ save: async () => { throw new Error('disk full'); }, exportStart: async () => { started.push('x'); return {} as any; } });
  const ed2 = new Editor('demo', { api: f.api, bridge: f.bridge });
  await ed2.open();
  ed2.apply((d) => moveItems(d, { ids: ['c1'], dt: 1 }));
  await ed2.exportVideo();
  expect(started).toEqual([]);
  expect(ed2.store.get().exportError).toMatch(/^存檔失敗，無法輸出/);
});

test('reopening the editor picks up an export that is still running', async () => {
  const { api, bridge } = fakes({
    jobs: async () => [{ id: 'e7', kind: 'export', project: 'demo', label: 'x', status: 'running', progress: 0.3, message: 'frame 3/10', log: [] }],
    job: async () => ({ id: 'e7', label: 'x', status: 'running', progress: 0.4, message: 'frame 4/10', log: [] }),
  });
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  await vi.advanceTimersByTimeAsync(0);
  expect(ed.store.get().exportJob!.id).toBe('e7');
  await vi.advanceTimersByTimeAsync(1000);
  expect(ed.store.get().exportJob!.progress).toBe(0.4);
});

test('pressing export twice while it is starting starts one export and shows no error', async () => {
  let starts = 0;
  const { api, bridge } = fakes({
    exportStart: async () => { if (++starts > 1) throw new ApiError(409, 'An export is already queued or running'); return { id: 'e1', label: 'x', status: 'queued', progress: 0, message: '', log: [] }; },
    job: async () => ({ id: 'e1', label: 'x', status: 'running', progress: 0.2, message: '', log: [] }),
  });
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  void ed.exportVideo();
  void ed.exportVideo();
  await vi.advanceTimersByTimeAsync(0);
  expect(starts).toBe(1);
  expect(ed.store.get().exportError).toBe('');
  expect(ed.store.get().exportJob!.id).toBe('e1');
});

test('a new export clears the last result; a job lost mid-way says so', async () => {
  const f = fakes({ save: async () => { throw new Error('disk full'); } });
  const ed = new Editor('demo', { api: f.api, bridge: f.bridge });
  await ed.open();
  ed.store.set({ exportJob: { id: 'old', label: 'x', status: 'done', progress: 1, message: '', log: [], result: { file: 'exports/a.mp4', log: 'exports/a.log', seconds: 1 } } });
  ed.apply((d) => moveItems(d, { ids: ['c1'], dt: 1 }));
  await ed.exportVideo();
  expect(ed.store.get().exportJob).toBeNull();
  const g = fakes({ job: async () => { throw new ApiError(404, 'No job "e1"'); } });
  const ed2 = new Editor('demo', { api: g.api, bridge: g.bridge });
  await ed2.open();
  const done = ed2.exportVideo();
  await vi.advanceTimersByTimeAsync(1000);
  await done;
  expect(ed2.store.get().exportError).toBe('輸出中斷：伺服器找不到這個工作（可能已重新啟動）');
});

test('an export being followed when the server goes away stops asking after a while and says so', async () => {
  let asked = 0;
  const { api, bridge } = fakes({ job: async () => { asked++; throw new TypeError('Failed to fetch'); } });
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  void ed.exportVideo();
  await vi.advanceTimersByTimeAsync(15000);
  expect(ed.store.get().exportError).toMatch(/連不上伺服器/);
  const n = asked;
  await vi.advanceTimersByTimeAsync(30000);
  expect(asked).toBe(n);
});
