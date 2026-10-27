import { JobQueue, isTerminal } from './jobs.ts';
import { makeProjects, sse, startApp } from './test-utils.ts';

const deferred = () => { let ok!: (v?: unknown) => void, no!: (e: unknown) => void; const p = new Promise((a, b) => { ok = a; no = b; }); return { p, ok, no }; };
const tick = () => new Promise((r) => setTimeout(r, 0));

test('runs at most `concurrency` jobs at once, in order', async () => {
  const q = new JobQueue(2);
  const d = [deferred(), deferred(), deferred()];
  const jobs = d.map((x, i) => q.add('t', 'p', `j${i}`, () => x.p));
  await tick();
  expect(jobs.map((j) => q.get(j.id)!.status)).toEqual(['running', 'running', 'queued']);
  d[0].ok(1);
  await q.wait(jobs[0].id);
  await tick();
  expect(q.get(jobs[2].id)!.status).toBe('running');
  d[1].ok(); d[2].ok();
  await q.wait(jobs[2].id);
});

test('records results, failures, progress and a bounded log', async () => {
  const q = new JobQueue(2);
  const ok = q.add('t', 'p', 'ok', async (ctx) => { ctx.progress(0.5, 'half'); for (let i = 0; i < 250; i++) ctx.log(`line ${i}`); return { n: 1 }; });
  const bad = q.add('t', 'p', 'bad', async () => { throw new Error('boom'); });
  const a = await q.wait(ok.id), b = await q.wait(bad.id);
  expect([a.status, a.progress, a.result, a.log.length, a.log[0]]).toEqual(['done', 1, { n: 1 }, 200, 'line 50']);
  expect([b.status, b.error]).toEqual(['failed', 'boom']);
});

test('cancelling a queued job skips it; cancelling a running job aborts its signal', async () => {
  const q = new JobQueue(1);
  let aborted = false;
  const running = q.add('t', 'p', 'r', (ctx) => new Promise((_, no) => ctx.signal.addEventListener('abort', () => { aborted = true; no(new Error('stopped')); })));
  let ran = false;
  const queued = q.add('t', 'p', 'q', async () => { ran = true; });
  await Promise.resolve();
  expect(q.cancel(queued.id)).toBe(true);
  expect(q.get(queued.id)!.status).toBe('cancelled');
  q.cancel(running.id);
  expect((await q.wait(running.id)).status).toBe('cancelled');
  expect(aborted).toBe(true);
  expect(ran).toBe(false);
  expect(isTerminal('cancelled')).toBe(true);
  expect(q.cancel('nope')).toBe(false);
});

test('SSE streams progress until the job ends; DELETE cancels; closing with open streams leaves no listeners', async () => {
  const { app, base } = await startApp({ projectsDir: makeProjects() });
  const gate = deferred();
  const job = app.queue.add('t', 'demo', 'x', async (ctx) => { ctx.progress(0.3, 'a'); await gate.p; ctx.progress(0.6, 'b'); return 'ok'; });
  const events = sse(`${base}/api/jobs/${job.id}/events`);
  setTimeout(() => gate.ok(), 100);
  const got = await events;
  expect(got.at(-1).status).toBe('done');
  expect(got.map((e) => e.message)).toContain('b');
  expect((await (await fetch(`${base}/api/jobs`)).json())[0].id).toBe(job.id);

  const hang = app.queue.add('t', 'demo', 'hang', (ctx) => new Promise((_, no) => ctx.signal.addEventListener('abort', () => no(new Error('x')))));
  const stream = sse(`${base}/api/jobs/${hang.id}/events`);
  await new Promise((r) => setTimeout(r, 100));
  expect((await fetch(`${base}/api/jobs/${hang.id}`, { method: 'DELETE' })).status).toBe(200);
  expect((await stream).at(-1).status).toBe('cancelled');
  expect((await fetch(`${base}/api/jobs/nope`, { method: 'DELETE' })).status).toBe(404);

  const ac = new AbortController();
  const slow = app.queue.add('t', 'demo', 'slow', (ctx) => new Promise((_, no) => ctx.signal.addEventListener('abort', () => no(new Error('x')))));
  const s2 = sse(`${base}/api/jobs/${slow.id}/events`, ac.signal);
  await new Promise((r) => setTimeout(r, 100));
  ac.abort();
  await s2;
  await new Promise((r) => setTimeout(r, 100));
  expect(app.queue.listenerCount('change')).toBe(0);
  const s3 = sse(`${base}/api/jobs/${slow.id}/events`);
  await new Promise((r) => setTimeout(r, 100));
  await app.close();          // must resolve although s3 is still open
  await s3.catch(() => []);   // the server may cut the stream instead of ending it
});

test('background jobs (sheets, transcripts, beats) never take a slot: an export queued after them starts at once', async () => {
  const q = new JobQueue(1);
  const bg = [deferred(), deferred()], ex = deferred();
  const b = bg.map((d, i) => q.add('extras', 'p', `s${i}`, () => d.p, { background: true }));
  const e = q.add('export', 'p', 'x', () => ex.p);
  await tick();
  expect([...b.map((j) => q.get(j.id)!.status), q.get(e.id)!.status]).toEqual(['running', 'running', 'running']);
  bg.forEach((d) => d.ok()); ex.ok();
  await Promise.all([...b, e].map((j) => q.wait(j.id)));
  expect(q.get(e.id)!.status).toBe('done');
});
