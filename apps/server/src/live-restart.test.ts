// live.ts: a folder watcher that fails while an editor is open is started again (its own file: node:fs's watch is wrapped here)
import type { FSWatcher } from 'node:fs';
import { events, makeProjects, startApp } from './test-utils.ts';

const made: FSWatcher[] = [], closed = new Set<FSWatcher>();
/** the folder watcher (recursive) cannot be made while this is set */
let refuse = false;
vi.mock('node:fs', async (orig) => {
  const fs = await orig<typeof import('node:fs')>();
  return { ...fs, watch: (...a: Parameters<typeof fs.watch>) => {
    if (refuse && (a[1] as any)?.recursive) throw new Error('watch refused');
    const w = fs.watch(...a), close = w.close.bind(w);
    w.close = () => { closed.add(w); close(); };
    made.push(w); return w;
  } };
});

test('a watcher that cannot be made: the ones made before it are closed, the editor is still served, watching starts again', async () => {
  const root = makeProjects(), { app, base } = await startApp({ projectsDir: root }), url = `${base}/api/projects/demo`;
  refuse = true;
  try {
    const before = made.length, ev = events(`${url}/events`);
    expect(await ev.next()).toMatchObject({ type: 'hello' });
    expect(made.length).toBe(before + 1);
    expect(closed.has(made.at(-1)!)).toBe(true);   // the proposals' watcher, left open, had nobody to stop it
    refuse = false;
    await new Promise((r) => setTimeout(r, 1500));
    expect(made.length).toBe(before + 3);
    const r = await fetch(`${url}/proposal`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label: 'y', ops: [{ op: 'trimEnd', id: 'c', dt: -0.3 }] }) });
    expect(r.status).toBe(200);
    expect(await ev.next()).toMatchObject({ type: 'proposal', proposal: { label: 'y' } });
    ev.close();
  } finally { refuse = false; await app.close(); }
}, 15000);

test('a watcher error while an editor is open: watching starts again after a wait, and the editor hears of a proposal again', async () => {
  const root = makeProjects(), { app, base } = await startApp({ projectsDir: root }), url = `${base}/api/projects/demo`;
  try {
    const ev = events(`${url}/events`);
    expect(await ev.next()).toMatchObject({ type: 'hello' });
    const first = made.length;
    expect(first).toBeGreaterThan(0);
    made[first - 1].emit('error', new Error('the network drive dropped'));
    made[first - 2]?.emit('error', new Error('the same failure, seen by the other watcher'));   // one restart, not two
    await new Promise((r) => setTimeout(r, 1500));
    expect(made.length).toBe(first + 2);   // both watchers made again
    const r = await fetch(`${url}/proposal`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label: 'x', ops: [{ op: 'trimEnd', id: 'c', dt: -0.3 }] }) });
    expect(r.status).toBe(200);
    expect(await ev.next()).toMatchObject({ type: 'proposal', proposal: { label: 'x' } });
    ev.close();
  } finally { await app.close(); }
}, 15000);
