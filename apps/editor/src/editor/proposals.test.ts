// The proposal flow on its own, against a real History: what it touches of the undo history and what it reports.
import type { Project } from '@tellcut/engine';
import { fixture } from '@tellcut/engine/test-fixture';
import { History } from '../history.ts';
import { createStore, initialState } from '../store.ts';
import { ProposalFlow } from './proposals.ts';

const prop = (ops: any[], id = 'p1') => ({ id, label: 'shorter', ops, status: 'pending' as const, created: '', base: '' });
const endOf = (p: Project, id: string) => (p.tracks.flatMap((t) => t.items as any[]).find((i) => i.id === id)).end;

function flow(over: { settle?: () => Promise<boolean> } = {}) {
  const store = createStore(initialState('p1'));
  const h = new History(fixture());
  const results: any[] = [], shown: Array<[Project, boolean]> = [];
  let stopped = 0, outside = 0;
  const f = new ProposalFlow({
    id: 'p1', store, history: () => h,
    api: { proposalResult: async (_id: string, b: any) => { results.push(b); return {} as any; } },
    show: (p, commit) => { shown.push([p, commit]); store.set({ project: p }); },
    stopPreviews: () => { stopped++; },
    settle: over.settle ?? (async () => true),
    outside: () => { outside++; },
  });
  return { f, h, store, results, shown, counts: () => ({ stopped, outside }) };
}

test('a shown proposal is a preview only: the history keeps the project and records nothing', () => {
  const { f, h, store, shown, counts } = flow();
  f.show(prop([{ op: 'trimEnd', id: 'c1', dt: -1 }]));
  expect(f.pending).toBe(true);
  expect([endOf(shown.at(-1)![0], 'c1'), shown.at(-1)![1]]).toEqual([3, false]);
  expect([endOf(h.project, 'c1'), h.canUndo]).toEqual([4, false]);
  expect(store.get().proposal).toMatchObject({ id: 'p1', changed: ['c1'] });
  expect(counts().stopped).toBe(1);
});

test('blocked() refuses edits while one waits and puts its preview back on screen', () => {
  const { f, h, store, shown } = flow();
  expect(f.blocked()).toBe(false);
  f.show(prop([{ op: 'trimEnd', id: 'c1', dt: -1 }]));
  store.set({ project: h.project });   // a drag showed something else meanwhile
  expect(f.blocked()).toBe(true);
  expect(endOf(shown.at(-1)![0], 'c1')).toBe(3);
  expect(store.get().notice).not.toBe('');
});

test('accepting is one recorded step shown as a commit, reported once settled', async () => {
  const { f, h, shown, results } = flow();
  f.show(prop([{ op: 'trimEnd', id: 'c1', dt: -1 }]));
  expect(await f.accept()).toBe(true);
  expect([endOf(h.project, 'c1'), h.canUndo, shown.at(-1)![1], f.pending]).toEqual([3, true, true, false]);
  expect(results).toEqual([{ id: 'p1', outcome: 'accepted' }]);
});

test('an accept whose save fails is reported stale, though it stays applied', async () => {
  let n = 0;
  const { f, h, results } = flow({ settle: async () => ++n < 2 });
  f.show(prop([{ op: 'trimEnd', id: 'c1', dt: -1 }]));
  expect(await f.accept()).toBe(true);
  expect(endOf(h.project, 'c1')).toBe(3);
  expect(results).toEqual([{ id: 'p1', outcome: 'stale', reason: expect.any(String) }]);
});

test('rejecting shows the project again; a proposal that does not apply is reported stale and never shown', async () => {
  const { f, h, shown, results } = flow();
  f.show(prop([{ op: 'trimEnd', id: 'gone', dt: -1 }], 'bad'));
  expect([f.pending, shown.length]).toEqual([false, 0]);
  f.show(prop([{ op: 'trimEnd', id: 'c1', dt: -1 }]));
  await f.reject();
  expect([shown.at(-1)![0], f.pending, h.canUndo]).toEqual([h.project, false, false]);
  await Promise.resolve();
  expect(results).toEqual([{ id: 'bad', outcome: 'stale', reason: expect.stringContaining('gone') }, { id: 'p1', outcome: 'rejected' }]);
});

test('the live stream: only proposal messages are taken; one accepted elsewhere marks the project changed outside', () => {
  const { f, counts } = flow();
  expect(f.onLive({ type: 'changed-on-disk' })).toBe(false);
  expect(f.onLive({ type: 'proposal', proposal: prop([{ op: 'trimEnd', id: 'c1', dt: -1 }]) })).toBe(true);
  expect(f.onLive({ type: 'proposal', proposal: null, outcome: 'accepted' })).toBe(true);
  expect([f.pending, counts().outside]).toEqual([false, 1]);
});
