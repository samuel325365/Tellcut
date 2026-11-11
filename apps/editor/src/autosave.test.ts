import { Autosave } from './autosave.ts';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

test('saves the latest version once, 1 s after the last edit', async () => {
  const saved: unknown[] = [], statuses: string[] = [];
  const a = new Autosave({ save: async (p) => { saved.push(p); }, onStatus: (s) => statuses.push(s) });
  a.schedule('v1');
  await vi.advanceTimersByTimeAsync(500);
  a.schedule('v2');
  await vi.advanceTimersByTimeAsync(999);
  expect(saved).toEqual([]);
  await vi.advanceTimersByTimeAsync(1);
  expect(saved).toEqual(['v2']);
  expect(statuses).toEqual(['pending', 'pending', 'saving', 'saved']);
});

test('a failed save shows the error and retries with the newest version', async () => {
  let fail = true;
  const saved: unknown[] = [], statuses: string[] = [];
  const a = new Autosave({ save: async (p) => { if (fail) throw new Error('disk busy'); saved.push(p); }, onStatus: (s, e) => statuses.push(e ? `${s}:${e}` : s) });
  a.schedule('v1');
  await vi.advanceTimersByTimeAsync(1000);
  expect(statuses.at(-1)).toBe('error:disk busy');
  a.schedule('v2');
  fail = false;
  await vi.advanceTimersByTimeAsync(3000);
  expect(saved).toEqual(['v2']);
  expect(a.status).toBe('saved');
});

test('an edit made while saving is saved right after', async () => {
  const saved: unknown[] = [];
  let release!: () => void;
  const a = new Autosave({ save: (p) => { saved.push(p); return p === 'v1' ? new Promise<void>((r) => (release = r)) : Promise.resolve(); } });
  a.schedule('v1');
  await vi.advanceTimersByTimeAsync(1000);
  a.schedule('v2');
  release();
  await vi.advanceTimersByTimeAsync(1000);
  expect(saved).toEqual(['v1', 'v2']);
  expect(a.dirty).toBe(false);
});

test('settle() saves a pending edit at once and waits until everything is on disk', async () => {
  const saved: unknown[] = [];
  let release!: () => void;
  const a = new Autosave({ save: (p) => new Promise<void>((r) => { saved.push(p); release = r; }) });
  a.schedule('v1');
  const settled = a.settle();
  await vi.advanceTimersByTimeAsync(0);
  expect(saved).toEqual(['v1']);              // no 1 s wait
  a.schedule('v2');                           // an edit while v1 is being written
  release(); await vi.advanceTimersByTimeAsync(0);
  release(); await vi.advanceTimersByTimeAsync(0);
  expect(await settled).toBe(true);
  expect(saved).toEqual(['v1', 'v2']);
});

test('settle() reports a failed save', async () => {
  const a = new Autosave({ save: async () => { throw new Error('disk full'); } });
  a.schedule('v1');
  expect(await a.settle()).toBe(false);
});

test('settle() waits for a write in flight even when writes get held meanwhile, and says false when it then fails', async () => {
  let answer!: (ok: boolean) => void;
  const a = new Autosave({ save: () => new Promise<void>((r, no) => { answer = (ok) => (ok ? r() : no(new Error('409'))); }), delay: 5 });
  a.schedule('v1');
  await vi.advanceTimersByTimeAsync(10);      // the write is in the air
  a.hold(true);                               // a changed-on-disk arrives
  let settled: boolean | undefined;
  void a.settle().then((v) => { settled = v; });
  await vi.advanceTimersByTimeAsync(0);
  expect(settled).toBeUndefined();            // not "on disk" before the write has answered
  answer(false);
  await vi.advanceTimersByTimeAsync(0);
  expect([settled, a.dirty, a.status]).toEqual([false, true, 'error']);
  a.hold(false);
  const ok = a.settle();
  await vi.advanceTimersByTimeAsync(0);
  answer(true);
  expect(await ok).toBe(true);
});

test('settle says false while writes are held with an edit waiting (it is not on disk)', async () => {
  const a = new Autosave({ save: async () => {} });
  a.hold(true);
  expect(await a.settle()).toBe(true);           // nothing waiting: nothing lost
  a.schedule('v1');
  expect(await a.settle()).toBe(false);
  a.hold(false);
  expect(await a.settle()).toBe(true);
});
