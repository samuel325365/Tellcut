// The Editor: the agent’s proposals, the live stream from the server, and changes made outside (another tab, the agent, the disk).
import { corePlugin, createRegistry, moveItems } from '@tellcut/engine';
import { fixture } from '../../../packages/engine/src/commands/test-fixture.ts';
import { ApiError } from './api.ts';
import { Editor } from './editor.ts';
import { fakes, live, prop } from './editor-test-kit.ts';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

test('a proposal shows as a preview: not saved, not undoable, edits refused until it is decided', async () => {
  const L = live(), { api, bridge, saved } = fakes(L.over);
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  L.send({ type: 'proposal', proposal: prop([{ op: 'trimEnd', id: 'c1', dt: -1 }]) });
  expect((bridge.calls.at(-1)[1].tracks[1].items[0] as any).end).toBe(3);
  expect(ed.store.get().proposal).toMatchObject({ label: '剪短', changed: ['c1'] });
  expect(ed.store.get().canUndo).toBe(false);
  expect(ed.apply((d) => moveItems(d, { ids: ['c2'], dt: 1 }))).toBe(false);
  expect(ed.store.get().notice).toMatch(/提議待處理/);
  await vi.advanceTimersByTimeAsync(2000);
  expect(saved).toHaveLength(0);
});

test('accepting is one undo step, saved, and reported; undo brings back the project before it', async () => {
  const L = live(), { api, bridge, saved } = fakes(L.over);
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  L.send({ type: 'proposal', proposal: prop([{ op: 'trimEnd', id: 'c1', dt: -1 }, { op: 'moveItems', ids: ['c2'], dt: 1 }]) });
  expect(await ed.acceptProposal()).toBe(true);
  expect(L.results).toEqual([{ id: 'p1', outcome: 'accepted' }]);
  expect((saved.at(-1) as any).tracks[1].items[0].end).toBe(3);
  expect(ed.store.get().proposal).toBeNull();
  ed.undo();
  expect((ed.store.get().project!.tracks[1].items[0] as any).end).toBe(4);
  expect((ed.store.get().project!.tracks[1].items[1] as any).start).toBe(4);
});

test('an accept from the chat lands on top of an edit still waiting to be saved', async () => {
  const L = live(), { api, bridge, saved } = fakes(L.over);
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  ed.apply((d) => moveItems(d, { ids: ['a1'], dt: 1 }));                 // autosave pending
  L.send({ type: 'proposal', proposal: prop([{ op: 'trimEnd', id: 'c1', dt: -1 }]) });
  L.send({ type: 'accept-request', id: 'p1' });
  await vi.advanceTimersByTimeAsync(10);
  const last: any = saved.at(-1);
  expect([last.tracks[1].items[0].end, last.tracks.find((t: any) => t.id === 'au').items[0].start]).toEqual([3, 2]);
});

test('a proposal that no longer fits the project is reported stale and nothing changes', async () => {
  const L = live(), { api, bridge, saved } = fakes(L.over);
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  L.send({ type: 'proposal', proposal: prop([{ op: 'trimEnd', id: 'gone', dt: -1 }]) });
  await vi.advanceTimersByTimeAsync(10);
  expect(L.results).toEqual([{ id: 'p1', outcome: 'stale', reason: expect.stringContaining('gone') }]);
  expect(ed.store.get().proposal).toBeNull();
  expect(saved).toHaveLength(0);
});

test('rejecting puts the project back as it was', async () => {
  const L = live(), { api, bridge } = fakes(L.over);
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  L.send({ type: 'proposal', proposal: prop([{ op: 'trimEnd', id: 'c1', dt: -1 }]) });
  L.send({ type: 'reject-request', id: 'p1' });
  await vi.advanceTimersByTimeAsync(10);
  expect(L.results).toEqual([{ id: 'p1', outcome: 'rejected' }]);
  expect((bridge.calls.at(-1)[1].tracks[1].items[0] as any).end).toBe(4);
});

test('selection and playhead reach the server 300 ms after they settle; an outside change is announced', async () => {
  const L = live(), { api, bridge } = fakes(L.over);
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  ed.select(['c1']); ed.seek(2);
  await vi.advanceTimersByTimeAsync(299);
  expect(L.states).toHaveLength(0);
  await vi.advanceTimersByTimeAsync(1);
  expect(L.states).toEqual([{ selection: ['c1'], playhead: 2 }]);
  L.send({ type: 'changed-on-disk' });
  expect(ed.store.get().diskChanged).toBe(true);
});

test('an edited fx module loads the preview again with a new registry; nothing is held or marked changed', async () => {
  const L = live(), { api, bridge } = fakes(L.over);
  let registries = 0;
  const ed = new Editor('demo', { api, bridge, registryFor: async () => { registries++; return createRegistry([corePlugin]); } });
  await ed.open();
  const loads = bridge.calls.filter((c: any[]) => c[0] === 'load').length;
  L.send({ type: 'fx-changed' });
  await vi.advanceTimersByTimeAsync(0);
  expect(registries).toBe(2);
  expect(bridge.calls.filter((c: any[]) => c[0] === 'load').length).toBe(loads + 1);
  expect(ed.store.get().diskChanged).toBe(false);
});

test('Update loads the new copy once: the fx-changed it sets off, with the same stamp, is skipped, whichever comes first', async () => {
  const L = live(), lib = { links: [], savedFiles: [], savedStyles: [], styles: [] };
  let stamp = 'aaa';
  const { api, bridge } = fakes({ ...L.over, useLibrary: async () => ({ file: 'fx/lib/box/_entry.js', fx: stamp }), projectLibrary: async () => lib });
  let registries = 0;
  const ed = new Editor('demo', { api, bridge, registryFor: async () => { registries++; return createRegistry([corePlugin]); } });
  await ed.open();
  const start = registries;
  await ed.updateLibraryBlock('box');
  L.send({ type: 'fx-changed', fx: 'aaa' });
  await vi.advanceTimersByTimeAsync(0);
  expect(registries - start).toBe(1);
  // the event first this time, then the answer
  stamp = 'bbb';
  L.send({ type: 'fx-changed', fx: 'bbb' });
  await vi.advanceTimersByTimeAsync(0);
  await ed.updateLibraryBlock('box');
  expect(registries - start).toBe(2);
  // another edit (a new stamp) and an event from a server without stamps still load
  L.send({ type: 'fx-changed', fx: 'ccc' });
  L.send({ type: 'fx-changed' });
  await vi.advanceTimersByTimeAsync(0);
  expect(registries - start).toBe(4);
});

test('while a proposal waits, a timeline drag changes nothing and the proposal stays on screen', async () => {
  const L = live(), { api, bridge, saved } = fakes(L.over);
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  L.send({ type: 'proposal', proposal: prop([{ op: 'trimEnd', id: 'c1', dt: -1 }]) });
  ed.beginDrag({ grip: 'body', id: 'c2', mods: { alt: false, ctrl: true, shift: false }, selection: [] });
  ed.dragTo(200, { alt: false, ctrl: true, shift: false });
  ed.endDrag();
  const shown = bridge.calls.filter((c: any) => c[0] === 'patch').at(-1)[1];
  expect([shown.tracks[1].items[0].end, shown.tracks[1].items[1].start]).toEqual([3, 4]);
  await vi.advanceTimersByTimeAsync(2000);
  expect(saved).toHaveLength(0);
});

test('a proposal is applied once even when accept comes twice; a request for another proposal is ignored', async () => {
  const L = live(), { api, bridge, saved } = fakes(L.over);
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  L.send({ type: 'proposal', proposal: prop([{ op: 'trimEnd', id: 'c1', dt: -1 }]) });
  L.send({ type: 'accept-request', id: 'p9' });
  await vi.advanceTimersByTimeAsync(10);
  expect([L.results, ed.store.get().proposal?.id]).toEqual([[], 'p1']);
  const [a, b] = await Promise.all([ed.acceptProposal(), ed.acceptProposal()]);
  expect([a, b]).toEqual([true, false]);
  expect(L.results).toEqual([{ id: 'p1', outcome: 'accepted' }]);
  expect((saved.at(-1) as any).tracks[1].items[0].end).toBe(3);
});

test('a proposal accepted in another tab marks this one as changed outside', async () => {
  const L = live(), { api, bridge } = fakes(L.over);
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  L.send({ type: 'proposal', proposal: prop([{ op: 'trimEnd', id: 'c1', dt: -1 }]) });
  L.send({ type: 'proposal', proposal: null, outcome: 'accepted' });
  expect([ed.store.get().proposal, ed.store.get().diskChanged]).toEqual([null, true]);
});

test('reloading drops the old unsaved edit; while an outside change waits, edits are held until 忽略', async () => {
  const L = live(), { api, bridge, saved } = fakes(L.over);
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  ed.apply((d) => moveItems(d, { ids: ['c2'], dt: 1 }));
  await ed.open();
  await vi.advanceTimersByTimeAsync(3000);
  expect(saved).toHaveLength(0);
  L.send({ type: 'changed-on-disk' });
  ed.apply((d) => moveItems(d, { ids: ['c2'], dt: 1 }));
  await vi.advanceTimersByTimeAsync(3000);
  expect(saved).toHaveLength(0);
  ed.ignoreDisk();
  await vi.advanceTimersByTimeAsync(10);
  expect((saved.at(-1) as any).tracks[1].items[1].start).toBe(5);
});

test('Reload on the changed-on-disk bar asks first when edits made since are waiting, and keeps them when told no', async () => {
  const L = live(), { api, bridge } = fakes(L.over);
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  const asked: string[] = [];
  L.send({ type: 'changed-on-disk' });
  expect(await ed.reload((m) => { asked.push(m); return false; })).toBe(true);   // nothing held: reloads without asking
  expect(asked).toEqual([]);
  L.send({ type: 'changed-on-disk' });
  ed.apply((d) => moveItems(d, { ids: ['c2'], dt: 1 }));
  // it used to throw these away without a word
  expect(await ed.reload((m) => { asked.push(m); return false; })).toBe(false);
  expect([asked.length, ed.store.get().diskChanged, (ed.store.get().project!.tracks[1].items[1] as any).start]).toEqual([1, true, 5]);
  expect(await ed.reload(() => true)).toBe(true);
  expect([ed.store.get().diskChanged, (ed.store.get().project!.tracks[1].items[1] as any).start]).toEqual([false, 4]);
});

test('a save refused because another tab or Claude wrote first (409) holds the edits as changed outside; 忽略 writes over it', async () => {
  let refuse = true, forgot = 0;
  const L = live(), saved: unknown[] = [];
  const { api, bridge } = fakes({ ...L.over, forgetVersion: () => { forgot++; refuse = false; },
    save: async (_: string, p: unknown) => { if (refuse) throw new ApiError(409, '專案在別的地方被改過'); saved.push(p); } });
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  ed.apply((d) => moveItems(d, { ids: ['c2'], dt: 1 }));
  await vi.advanceTimersByTimeAsync(1100);
  expect(ed.store.get().diskChanged).toBe(true);
  await vi.advanceTimersByTimeAsync(10000);
  expect(saved).toHaveLength(0);                      // held: no retries over the other version
  ed.ignoreDisk();
  await vi.advanceTimersByTimeAsync(10);
  expect([forgot, (saved.at(-1) as any).tracks[1].items[1].start]).toEqual([1, 5]);
});

test('while the file was changed outside, accepting a proposal is refused (reported stale) and an export says why it cannot start', async () => {
  const L = live(), started: string[] = [];
  const { api, bridge, saved } = fakes({ ...L.over, exportStart: async () => { started.push('x'); return {} as any; } });
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  ed.apply((d) => moveItems(d, { ids: ['c2'], dt: 1 }));
  L.send({ type: 'changed-on-disk' });
  L.send({ type: 'proposal', proposal: prop([{ op: 'trimEnd', id: 'c1', dt: -1 }]) });
  expect(await ed.acceptProposal()).toBe(false);
  expect(L.results).toEqual([{ id: 'p1', outcome: 'stale', reason: expect.stringMatching(/重新載入/) }]);
  expect(ed.store.get().notice).toMatch(/重新載入/);
  await ed.exportVideo();
  expect(started).toEqual([]);
  expect(ed.store.get().exportError).toMatch(/外面被改過/);
  expect(saved).toHaveLength(0);
});

test('restoring a history version after an outside break writes over what is on disk (no If-Match) and shows a failure', async () => {
  const calls: string[] = [];
  let fail = false;
  const { api, bridge } = fakes({ project: async () => { throw new ApiError(422, 'Invalid project.json', ['meta.fps: Required']); },
    historyVersion: async () => fixture(), forgetVersion: () => { calls.push('forget'); },
    save: async () => { calls.push('save'); if (fail) throw new ApiError(409, '專案在別的地方被改過'); } });
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  await ed.restore('h1.json');
  expect(calls.slice(0, 2)).toEqual(['forget', 'save']);
  fail = true;
  await expect(ed.restore('h1.json')).resolves.toBe(false);
  expect(ed.store.get().restoreError).toMatch(/別的地方被改過/);
});

test('an accepted proposal whose save fails is not reported accepted: the agent hears why it is not on disk', async () => {
  const L = live();
  const { api, bridge } = fakes({ ...L.over, save: async () => { throw new ApiError(409, '專案在別的地方被改過'); } });
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  L.send({ type: 'proposal', proposal: prop([{ op: 'trimEnd', id: 'c1', dt: -1 }]) });
  expect(await ed.acceptProposal()).toBe(true);
  expect(L.results).toEqual([{ id: 'p1', outcome: 'stale', reason: expect.stringMatching(/沒有存進/) }]);
  expect(ed.store.get().notice).toMatch(/還沒存檔/);
});

test('a changed-on-disk this page caused itself is ignored; one from another tab holds the edits', async () => {
  const L = live();
  const { api, bridge } = fakes({ ...L.over, clientId: 'me' });
  const ed = new Editor('demo', { api, bridge });
  await ed.open();
  L.send({ type: 'changed-on-disk', by: 'me' });
  expect(ed.store.get().diskChanged).toBe(false);
  L.send({ type: 'changed-on-disk', by: 'other' });
  expect(ed.store.get().diskChanged).toBe(true);
});
