// What POST /analyze tells the chat when its jobs end, and what it queues again after a failure (review R4-S3). The analysis
// itself is faked: these tests are about the queue and the callback, not about ffmpeg or whisper.
import { utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
vi.mock('@tellcut/media-node', async (orig) => {
  const m = await orig<typeof import('@tellcut/media-node')>();
  return { ...m, analysisDone: () => true, shareAnalysis: () => {}, extrasDone: async () => false, sourceExtras: vi.fn(async () => ({})), musicBeats: vi.fn(async () => ({})) };
});
import { sourceExtras } from '@tellcut/media-node';
import { router } from './http.ts';
import { JobQueue, type JobInfo } from './jobs.ts';
import { mediaRoutes } from './media.ts';
import { ProjectStore } from './projects.ts';
import { demoProject, makeProjects } from './test-utils.ts';

const setup = () => {
  const root = makeProjects(), dir = join(root, 'demo');
  writeFileSync(join(dir, 'project.json'), JSON.stringify(demoProject({ sources: { talk: { path: 'talk.mp4', duration: 4, width: 320, height: 180 } }, media: {}, tracks: [] })));
  writeFileSync(join(dir, 'talk.mp4'), 'video');
  const r = router(), queue = new JobQueue(2), told: Array<{ id: string; jobs: JobInfo[] }> = [];
  let ended: () => void = () => {};
  mediaRoutes(r, new ProjectStore(root), queue, { onAnalyzed: (id, _since, jobs) => { told.push({ id, jobs }); ended(); } });
  const analyze = async (): Promise<{ extras: JobInfo[]; jobs: JobInfo[] }> => {
    let body = '';
    const res = { writeHead() { return res; }, end(s: string) { body = s; } } as unknown as ServerResponse;
    await r.handle({ method: 'POST', url: '/api/projects/demo/analyze' } as IncomingMessage, res);
    return JSON.parse(body);
  };
  const over = () => new Promise<void>((ok) => { ended = ok; });
  return { dir, analyze, told, over, queue };
};

test("the jobs' outcomes go to the chat; a transcript that failed is not queued again on every open, until its file changes", async () => {
  vi.mocked(sourceExtras).mockRejectedValue(new Error('no whisper model'));
  const { dir, analyze, told, over } = setup();
  const ended = over(), first = await analyze();
  expect(first.extras.map((j) => j.kind)).toEqual(['extras']);
  await ended;
  expect(told).toHaveLength(1);
  expect(told[0].jobs.map((j) => [j.kind, j.status, j.error])).toEqual([['extras', 'failed', 'no whisper model']]);
  // the editor asks again on every open: the same file, the same failure — nothing queued, no automatic turn
  expect((await analyze()).extras).toEqual([]);
  expect(told).toHaveLength(1);
  // the footage changed: worth another try
  const later = new Date(Date.now() + 5000);
  utimesSync(join(dir, 'talk.mp4'), later, later);
  vi.mocked(sourceExtras).mockResolvedValue({});
  const again = over();
  expect((await analyze()).extras.map((j) => j.kind)).toEqual(['extras']);
  await again;
  expect(told[1].jobs.map((j) => j.status)).toEqual(['done']);
});

test('a cancelled transcript is not a failure: the next open queues it again', async () => {
  vi.mocked(sourceExtras).mockImplementation((_d, _p, o) => new Promise((_ok, no) => o.signal?.addEventListener('abort', () => no(new Error('aborted')))));
  const { analyze, over, queue } = setup();
  const ended = over(), first = await analyze();
  queue.cancel(first.extras[0].id);
  await ended;
  expect((await queue.wait(first.extras[0].id)).status).toBe('cancelled');
  vi.mocked(sourceExtras).mockResolvedValue({});
  expect((await analyze()).extras.map((j) => j.kind)).toEqual(['extras']);
});
