// live.test.ts
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { demoProject, events, makeProjects, startApp } from './test-utils.ts';

const json = (b: unknown) => ({ method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
const post = (b: unknown = {}) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
async function setup(o: { liveTimeout?: number } = {}) {
  const root = makeProjects();
  const { app, base } = await startApp({ projectsDir: root, ...o });
  return { root, app, base, url: `${base}/api/projects/demo` };
}

test('a proposal is checked, stored, and pushed to the open editor', async () => {
  const { app, url } = await setup();
  try {
    const bad = await fetch(`${url}/proposal`, json({ label: 'x', ops: [{ op: 'trimEnd', id: 'zz', dt: 1 }] }));
    expect([bad.status, (await bad.json()).error]).toEqual([400, expect.stringContaining('第 1 條')]);
    const ev = events(`${url}/events`);
    expect(await ev.next()).toEqual({ type: 'hello', proposal: null });
    const ok = await fetch(`${url}/proposal`, json({ label: '剪短', ops: [{ op: 'trimEnd', id: 'c', dt: -0.5 }] }));
    expect(ok.status).toBe(200);
    expect(await ev.next()).toMatchObject({ type: 'proposal', proposal: { label: '剪短', status: 'pending' } });
    ev.close();
  } finally { await app.close(); }
});

test('accept from the chat goes to the editor, which reports back; without an editor it is refused', async () => {
  const { app, url } = await setup();
  try {
    await fetch(`${url}/proposal`, json({ label: 'x', ops: [{ op: 'trimEnd', id: 'c', dt: -0.5 }] }));
    expect((await fetch(`${url}/proposal/accept`, post())).status).toBe(409);
    const ev = events(`${url}/events`);
    const hello = await ev.next();
    const pending = fetch(`${url}/proposal/accept`, post());
    expect(await ev.next()).toEqual({ type: 'accept-request', id: hello.proposal.id });
    expect((await fetch(`${url}/proposal/result`, post({ id: hello.proposal.id, outcome: 'accepted' }))).status).toBe(200);
    expect(await (await pending).json()).toEqual({ outcome: 'accepted' });
    expect(await ev.next()).toEqual({ type: 'proposal', proposal: null, outcome: 'accepted' });
    expect(await (await fetch(`${url}/proposal`)).json()).toBeNull();
    ev.close();
  } finally { await app.close(); }
});

test('an editor that does not answer: 504 and the proposal stays pending', async () => {
  const { app, url } = await setup({ liveTimeout: 200 });
  try {
    await fetch(`${url}/proposal`, json({ label: 'x', ops: [{ op: 'trimEnd', id: 'c', dt: -0.5 }] }));
    const ev = events(`${url}/events`); await ev.next();
    expect((await fetch(`${url}/proposal/accept`, post())).status).toBe(504);
    expect((await (await fetch(`${url}/proposal`)).json()).status).toBe('pending');
    ev.close();
  } finally { await app.close(); }
});

test('two editors: the first result closes the proposal, the second is refused and both see it gone', async () => {
  const { app, url } = await setup();
  try {
    await fetch(`${url}/proposal`, json({ label: 'x', ops: [{ op: 'trimEnd', id: 'c', dt: -0.5 }] }));
    const a = events(`${url}/events`), b = events(`${url}/events`);
    const id = (await a.next()).proposal.id; await b.next();
    expect((await fetch(`${url}/proposal/result`, post({ id, outcome: 'rejected' }))).status).toBe(200);
    expect((await fetch(`${url}/proposal/result`, post({ id, outcome: 'accepted' }))).status).toBe(409);
    expect(await a.next()).toEqual({ type: 'proposal', proposal: null, outcome: 'rejected' });
    expect(await b.next()).toEqual({ type: 'proposal', proposal: null, outcome: 'rejected' });
    a.close(); b.close();
  } finally { await app.close(); }
});

test('an outside write to project.json is announced; the editor’s own saves are not', async () => {
  const { app, root, url } = await setup();
  try {
    const ev = events(`${url}/events`); await ev.next();
    await fetch(url, json(demoProject({ meta: { ...demoProject().meta, name: 'saved' } })));
    await expect(ev.next(400)).rejects.toThrow('no event');
    const f = join(root, 'demo/project.json'), p = JSON.parse(readFileSync(f, 'utf8')); p.meta.name = 'outside';
    writeFileSync(f, JSON.stringify(p));
    expect(await ev.next()).toEqual({ type: 'changed-on-disk' });
    ev.close();
  } finally { await app.close(); }
});

test('a save from one editor tab is announced to the other tabs on the project, not to the tab that saved', async () => {
  const { app, url } = await setup();
  try {
    const a = events(`${url}/events?client=tab-a`), b = events(`${url}/events?client=tab-b`), old = events(`${url}/events`);
    await a.next(); await b.next(); await old.next();
    const r = await fetch(url, { ...json(demoProject({ meta: { ...demoProject().meta, name: 'from a' } })), headers: { 'Content-Type': 'application/json', 'X-Tellcut-Client': 'tab-a' } });
    expect(r.status).toBe(200);
    expect(await b.next()).toEqual({ type: 'changed-on-disk', by: 'tab-a' });
    expect(await old.next()).toEqual({ type: 'changed-on-disk', by: 'tab-a' });   // a page without an id (opened before this) hears it too
    await expect(a.next(400)).rejects.toThrow('no event');
    a.close(); b.close(); old.close();
  } finally { await app.close(); }
});

test('an edited project fx module is announced, other files in the project are not', async () => {
  const { app, root, url } = await setup();
  try {
    const ev = events(`${url}/events`); await ev.next();
    mkdirSync(join(root, 'demo', 'cache'), { recursive: true });
    writeFileSync(join(root, 'demo', 'cache', 'x.json'), '{}');
    await expect(ev.next(400)).rejects.toThrow('no event');
    mkdirSync(join(root, 'demo', 'fx'), { recursive: true });
    writeFileSync(join(root, 'demo', 'fx', 'card.js'), 'export default [];');
    expect(await ev.next()).toEqual({ type: 'fx-changed' });
    ev.close();
  } finally { await app.close(); }
});

test('the editor shares its selection and playhead; connected only while it is open', async () => {
  const { app, url } = await setup();
  try {
    expect((await (await fetch(`${url}/editor-state`)).json()).connected).toBe(false);
    const ev = events(`${url}/events`); await ev.next();
    await fetch(`${url}/editor-state`, json({ selection: ['c'], playhead: 0.4 }));
    expect(await (await fetch(`${url}/editor-state`)).json()).toMatchObject({ connected: true, selection: ['c'], playhead: 0.4 });
    ev.close();
  } finally { await app.close(); }
});

test('an accept from the chat goes to the most recently opened editor only; every editor hears the outcome', async () => {
  const { app, url } = await setup();
  try {
    await fetch(`${url}/proposal`, json({ label: 'x', ops: [{ op: 'trimEnd', id: 'c', dt: -0.5 }] }));
    const a = events(`${url}/events`); const id = (await a.next()).proposal.id;
    const b = events(`${url}/events`); await b.next();
    const pending = fetch(`${url}/proposal/accept`, post());
    expect(await b.next()).toEqual({ type: 'accept-request', id });
    await expect(a.next(400)).rejects.toThrow('no event');
    await fetch(`${url}/proposal/result`, post({ id, outcome: 'accepted' }));
    await pending;
    expect(await a.next()).toEqual({ type: 'proposal', proposal: null, outcome: 'accepted' });
    a.close(); b.close();
  } finally { await app.close(); }
});

test('a new proposal while an accept is still waiting answers that accept at once: superseded', async () => {
  const { app, url } = await setup({ liveTimeout: 5000 });
  try {
    await fetch(`${url}/proposal`, json({ label: 'x', ops: [{ op: 'trimEnd', id: 'c', dt: -0.5 }] }));
    const ev = events(`${url}/events`); await ev.next();
    const t0 = Date.now(), pending = fetch(`${url}/proposal/accept`, post());
    await ev.next();                                                              // the accept-request reached the editor, which stays silent
    await fetch(`${url}/proposal`, json({ label: 'y', ops: [{ op: 'trimEnd', id: 'c', dt: -0.3 }] }));
    const r = await pending;
    expect([r.status, await r.json()]).toEqual([200, { outcome: 'superseded', reason: expect.stringContaining('新的提議') }]);
    expect(Date.now() - t0).toBeLessThan(3000);
    ev.close();
  } finally { await app.close(); }
});

test('a project folder deleted outside the app while the editor has it open does not end the server (its watchers fail)', async () => {
  const { root, app, base, url } = await setup();
  try {
    const ev = events(`${url}/events`);
    expect(await ev.next()).toMatchObject({ type: 'hello' });
    const { rmSync } = await import('node:fs');
    rmSync(join(root, 'demo'), { recursive: true, force: true });
    await new Promise((r) => setTimeout(r, 400));
    expect((await fetch(`${base}/api/projects`)).status).toBe(200);
    ev.close();
  } finally { await app.close(); }
});
