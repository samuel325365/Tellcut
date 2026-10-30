import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exportProject } from './export-project.ts';
import { installExample, listExamples, RELEASE_API } from './examples.ts';

/** a zip of a small project, as export-project makes it */
function zipOf(root: string, id: string): Buffer {
  const dir = join(root, 'src', id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'project.json'), JSON.stringify({ version: 1, meta: { name: id }, sources: {}, media: {}, tracks: [] }));
  writeFileSync(join(dir, 'cut.ts'), '// cut');
  return readFileSync(exportProject(dir, { media: true, out: join(root, `${id}.zip`) }));
}

/** a GitHub that has an `examples` release with these files (name → bytes, or a body that breaks half way) */
function github(files: Record<string, Buffer | 'broken'>) {
  const calls: string[] = [];
  const fetch = async (url: string | URL) => {
    const u = String(url);
    calls.push(u);
    if (u === RELEASE_API) return Response.json({ assets: Object.entries(files).map(([name, b]) => ({ name, size: b === 'broken' ? 1000 : b.length, browser_download_url: `https://dl.test/${name}` })) });
    const name = u.replace('https://dl.test/', ''), b = files[name];
    if (!b) return new Response('no', { status: 404 });
    if (b === 'broken') return new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(10)); c.error(new Error('connection reset')); } }));
    return new Response(b);
  };
  return { fetch: fetch as typeof globalThis.fetch, calls };
}
const places = () => { const root = mkdtempSync(join(tmpdir(), 'ex-')); return { root, projectsDir: join(root, 'projects'), cacheDir: join(root, 'cache') }; };

test('the examples are the release’s project zips, each with its film when there is one; a film alone is no example', async () => {
  const { root } = places();
  const gh = github({ 'meet-tellcut.zip': zipOf(root, 'meet-tellcut'), 'meet-tellcut.mp4': Buffer.from('film'), 'learn-01-getting-started.zip': zipOf(root, 'learn-01-getting-started'), 'trailer.mp4': Buffer.from('x') });
  const list = await listExamples({ fetch: gh.fetch });
  expect(list.map((e) => [e.id, e.zip.name, e.film?.name])).toEqual([['learn-01-getting-started', 'learn-01-getting-started.zip', undefined], ['meet-tellcut', 'meet-tellcut.zip', 'meet-tellcut.mp4']]);
});

test('installing one imports the project and puts its film in exports/; one without a film is installed too', async () => {
  const { root, projectsDir, cacheDir } = places();
  const gh = github({ 'meet-tellcut.zip': zipOf(root, 'meet-tellcut'), 'meet-tellcut.mp4': Buffer.from('the film'), 'learn-02-bring-in-footage.zip': zipOf(root, 'learn-02-bring-in-footage') });
  const [learn, meet] = await listExamples({ fetch: gh.fetch }), log: string[] = [];
  const r = await installExample(meet, { fetch: gh.fetch, projectsDir, cacheDir, log: (s) => log.push(s) });
  expect(r).toEqual({ dir: join(projectsDir, 'meet-tellcut'), installed: true });
  expect(JSON.parse(readFileSync(join(projectsDir, 'meet-tellcut', 'project.json'), 'utf8')).meta.name).toBe('meet-tellcut');
  expect(readFileSync(join(projectsDir, 'meet-tellcut', 'exports', 'meet-tellcut.mp4'), 'utf8')).toBe('the film');
  expect((await installExample(learn, { fetch: gh.fetch, projectsDir, cacheDir, log: () => {} })).installed).toBe(true);
  expect(existsSync(join(projectsDir, 'learn-02-bring-in-footage', 'exports'))).toBe(false);
});

test('the project takes the example’s name even when the zip’s folder inside has another (export-project’s dated name)', async () => {
  const { root, projectsDir, cacheDir } = places();
  const gh = github({ 'meet-tellcut.zip': zipOf(root, 'meet-tellcut-draft'), 'meet-tellcut.mp4': Buffer.from('film') });
  const [meet] = await listExamples({ fetch: gh.fetch });
  expect(await installExample(meet, { fetch: gh.fetch, projectsDir, cacheDir, log: () => {} })).toEqual({ dir: join(projectsDir, 'meet-tellcut'), installed: true });
  expect(readdirSync(projectsDir)).toEqual(['meet-tellcut']);
  expect(existsSync(join(projectsDir, 'meet-tellcut', 'project.json'))).toBe(true);
  expect(readFileSync(join(projectsDir, 'meet-tellcut', 'exports', 'meet-tellcut.mp4'), 'utf8')).toBe('film');
});

test('a project that is already there is left alone and nothing is downloaded', async () => {
  const { root, projectsDir, cacheDir } = places();
  const gh = github({ 'meet-tellcut.zip': zipOf(root, 'meet-tellcut') });
  mkdirSync(join(projectsDir, 'meet-tellcut'), { recursive: true });
  writeFileSync(join(projectsDir, 'meet-tellcut', 'project.json'), 'mine');
  const [meet] = await listExamples({ fetch: gh.fetch }), log: string[] = [];
  expect(await installExample(meet, { fetch: gh.fetch, projectsDir, cacheDir, log: (s) => log.push(s) })).toEqual({ dir: join(projectsDir, 'meet-tellcut'), installed: false });
  expect(readFileSync(join(projectsDir, 'meet-tellcut', 'project.json'), 'utf8')).toBe('mine');
  expect(gh.calls.filter((u) => u.startsWith('https://dl.test/'))).toEqual([]);
  expect(log.join('\n')).toMatch(/already/);
});

test('a download that breaks half way leaves no project and no half file', async () => {
  const { projectsDir, cacheDir } = places();
  const gh = github({ 'meet-tellcut.zip': 'broken' });
  const [meet] = await listExamples({ fetch: gh.fetch });
  await expect(installExample(meet, { fetch: gh.fetch, projectsDir, cacheDir, log: () => {} })).rejects.toThrow(/meet-tellcut\.zip/);
  expect(existsSync(join(projectsDir, 'meet-tellcut'))).toBe(false);
  expect(existsSync(cacheDir) ? readdirSync(cacheDir) : []).toEqual([]);
});

test('no release yet, or no network: a sentence that says so', async () => {
  const none = (async () => new Response('Not Found', { status: 404 })) as unknown as typeof fetch;
  await expect(listExamples({ fetch: none })).rejects.toThrow(/no example projects yet/);
  const offline = (async () => { throw new TypeError('fetch failed'); }) as unknown as typeof fetch;
  await expect(listExamples({ fetch: offline })).rejects.toThrow(/could not reach GitHub/i);
});
