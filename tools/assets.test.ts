import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createProject, ffmpeg, makePhoto, maps, openSources, SourceError, TELLCUT_ROOT, type AssetMeta, type SourceAdapter, type SourcesConfig } from '@tellcut/media-node';
import { PNG } from 'pngjs';
import { ASSET_FLAGS, ASSET_KINDS, ASSET_SUBCOMMANDS, assetsCommand, MAP_MODES, MAP_STYLES } from './assets.ts';
import { formatCutApi } from './cut/api-doc.ts';
import { DICTS } from '../apps/editor/src/i18n/index.ts';

let root: string, projectsDir: string, clip: string, quietClip: string;
const meta = (id: string): AssetMeta => ({ source: 'fake', id, title: `Rain ${id}`, author: 'A', page: 'https://example.org', license: 'L', quality: 'preview' });
const base = { category: 'media' as const, needsKey: false, limits: [{ n: 100, per: 60 }], sample: 'x', check: async () => 'ok' };
const fake: SourceAdapter = {
  ...base, id: 'fake', label: 'fake', kinds: ['audio'], summary: '假的音效來源', card: () => '# fake 的能力卡',
  search: async (q) => [{ ref: 'fake:1', source: 'fake', id: '1', kind: 'audio', title: `Rain on window (${q.text})`, duration: 12.34, detail: 'Weather', tags: ['rain', 'window', 'interior', 'storm'] },
    { ref: 'fake:2', source: 'fake', id: '2', kind: 'audio', title: 'Rain again', duration: 3 }],
  get: async (id, ctx) => { const file = join(ctx.tmpDir, `${id}.wav`); copyFileSync(clip, file); return { file, kind: 'audio', meta: meta(id) }; },
  credit: (r) => `- SFX: fake ${r.id} "${r.title}"`,
};
const flaky: SourceAdapter = { ...fake, id: 'flaky', summary: '常壞的來源', search: async () => { throw new SourceError('flaky', 'temporary', '暫時不能用（HTTP 503）'); } };
const music: SourceAdapter = { ...fake, id: 'tunes', kinds: ['music'], summary: '假的配樂', search: async () => [{ ref: 'tunes:a', source: 'tunes', id: 'a', kind: 'music', title: 'Pamgaea', duration: 184.3, bpm: 114, detail: 'World · Bouncy' }] };
const config = (ids: string[]): SourcesConfig => ({ contact: '', keys: {}, sources: Object.fromEntries(ids.map((id) => [id, { enabled: true, options: {} }])) });
const noNet = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;
const o = (adapters: Record<string, SourceAdapter>, on = Object.keys(adapters), net = noNet) => ({ projectsDir, sources: openSources({ root, config: config(on), adapters, env: {}, fetch: net }) });

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'assets-cli-')); projectsDir = join(root, 'projects'); clip = join(root, 'clip.wav'); quietClip = join(root, 'quiet.wav');
  // lavfi's sine peaks at -18 dBFS: made louder it is an ordinary sound effect, as it is a quiet one
  await ffmpeg(['-f', 'lavfi', '-i', 'sine=f=440:d=1', '-af', 'volume=15dB', clip]);
  await ffmpeg(['-f', 'lavfi', '-i', 'sine=f=440:d=1', quietClip]);
  await createProject({ id: 'p1', inputs: [], projectsDir, blank: true });
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

test('sources lists only what is available, one line each', async () => {
  expect(await assetsCommand(['sources'], o({ fake, flaky }, ['fake']))).toBe('fake          假的音效來源\n\n看完整說明：npm run tellcut -- assets source <id>');
  expect(await assetsCommand(['sources'], o({ fake }, []))).toBe('目前沒有可用的素材來源（npm run sources 看原因）');
});

test('in the page chat, sources lists what the user ticked and says the rest are theirs to tick', async () => {
  const picked = (list: string) => ({ projectsDir, sources: openSources({ root, config: config(['fake', 'tunes']), adapters: { fake, tunes: music }, env: { TELLCUT_SOURCES: list }, fetch: noNet }) });
  expect((await assetsCommand(['sources'], picked('tunes'))).split('\n')).toEqual(['tunes         假的配樂', '', '（這些是使用者這次在 API 選單勾的；需要別的來源，請使用者勾選）', '', '看完整說明：npm run tellcut -- assets source <id>']);
  expect(await assetsCommand(['sources'], picked(''))).toBe('使用者這次沒有勾選任何 API：需要外部素材時，請使用者在對話框的 API 選單勾選');
  await expect(assetsCommand(['search', 'rain', '--source', 'fake'], picked('tunes'))).rejects.toThrow('使用者這次沒有勾選「fake」：請使用者在對話框的 API 選單勾選');
  // a search of a kind nobody ticked says so, not "see npm run sources"
  expect(await assetsCommand(['search', 'rain', '--kind', 'audio'], picked('tunes'))).toBe('使用者這次沒有勾選可以搜「audio」的來源：請使用者在對話框的 API 選單勾選');
});

test('source prints the card, with a warning when the source cannot be used now', async () => {
  expect(await assetsCommand(['source', 'fake'], o({ fake }))).toBe('# fake 的能力卡');
  expect(await assetsCommand(['source', 'fake'], o({ fake }, []))).toBe('⚠ 目前不能用：關閉\n\n# fake 的能力卡');
  await expect(assetsCommand(['source', 'nope'], o({ fake }))).rejects.toThrow('沒有「nope」這個來源');
});

test('search prints refs, lengths and the next step; a temporary problem is said, not hidden', async () => {
  const out = await assetsCommand(['search', 'rain', 'window', '--kind', 'audio'], o({ fake, flaky }));
  expect(out.split('\n')).toEqual([
    'fake:1  12.3 秒  Rain on window (rain window)  Weather  [rain, window, interior]',
    'fake:2  3.0 秒  Rain again',
    '⚠ flaky 暫時不能用：暫時不能用（HTTP 503）',
    '',
    '下載：npm run tellcut -- assets get <專案> <編號> [--from 秒 --len 秒]',
  ]);
  expect(await assetsCommand(['search', '', '--kind', 'music'], o({ tunes: music }))).toContain('tunes:a  184.3 秒  Pamgaea  114 BPM  World · Bouncy');
});

test('search with nothing found says to try other words', async () => {
  const none: SourceAdapter = { ...fake, search: async () => [] };
  expect(await assetsCommand(['search', 'zzz'], o({ fake: none }))).toBe('沒有找到；換個關鍵字（多數來源用英文）');
});

test('options reach the source: --opt, --limit, lengths', async () => {
  let seen: unknown;
  const spy: SourceAdapter = { ...fake, search: async (q) => { seen = q; return []; } };
  await assetsCommand(['search', 'calm', '--opt', 'feel=Calming', '--opt', 'bpm=60-100', '--min-sec', '90', '--limit', '3', '--source', 'fake'], o({ fake: spy }));
  expect(seen).toEqual({ text: 'calm', source: 'fake', opts: { feel: 'Calming', bpm: '60-100' }, minSec: 90, limit: 3 });
});

test('get downloads into the project and tells how to use it', async () => {
  const out = await assetsCommand(['get', 'p1', 'fake:1'], o({ fake }));
  expect(out).toMatch(/^已下載 fake:1 → media\/sfx\/fake-1\.wav（1\.0 秒，峰值 -\d+\.\d dBTP）\n用法：c\.sfxFile\('media\/sfx\/fake-1\.wav', \{ at: 秒 \}\)\ncredits 已更新：media\/CREDITS\.md$/);
  expect(await assetsCommand(['get', 'p1', 'fake:1'], o({ fake }))).toMatch(/^已經有了 fake:1 → media\/sfx\/fake-1\.wav\n用法：/);
  expect(await assetsCommand(['credits', 'p1'], o({ fake }))).toContain('- SFX: fake 1 "Rain 1"');
  expect(readFileSync(join(projectsDir, 'p1', 'media', 'CREDITS.md'), 'utf8')).toContain('- SFX: fake 1 "Rain 1"');
});

test('a quiet sound is not made louder but said to be quiet, with the gain that brings it level', async () => {
  const hush: SourceAdapter = { ...fake, id: 'hush', get: async (id, ctx) => { const file = join(ctx.tmpDir, `${id}.wav`); copyFileSync(quietClip, file); return { file, kind: 'audio', meta: { ...meta(id), source: 'hush' } }; } };
  const out = (await assetsCommand(['get', 'p1', 'hush:1'], o({ hush }))).split('\n');
  const peak = Number(/峰值 (-\d+\.\d) dBTP/.exec(out[0])![1]), room = Math.floor(-1 - peak);
  expect(peak).toBeLessThan(-12);
  expect(out[2]).toBe(`⚠ 很小聲（峰值 ${peak.toFixed(1)} dBTP）：gain 可以比平常再加大約 ${room} dB（例如 c.sfxFile 的 gain: ${-8 + room}）`);
  expect((await assetsCommand(['get', 'p1', 'fake:1'], o({ fake }))).split('\n')).toHaveLength(2);
});

test('when no source of the kind can be searched, it says so instead of "nothing found"', async () => {
  expect(await assetsCommand(['search', 'rain', '--kind', 'music'], o({ fake }))).toBe('目前沒有可以搜「music」的素材來源（npm run sources 看原因）');
  expect(await assetsCommand(['search', 'rain'], o({ fake }, []))).toBe('目前沒有可以搜的素材來源（npm run sources 看原因）');
});

test('--flag=value is read like --flag value; an unknown flag is a usage error, not a keyword', async () => {
  let seen: unknown;
  const spy: SourceAdapter = { ...fake, search: async (q) => { seen = q; return []; } };
  await assetsCommand(['search', 'rain', '--kind=audio', '--opt=feel=Calm', '--max-sec=5'], o({ fake: spy }));
  expect(seen).toEqual({ text: 'rain', kind: 'audio', opts: { feel: 'Calm' }, maxSec: 5, limit: 8 });
  const out = await assetsCommand(['get', 'p1', 'fake:2', '--from=0.2', '--len=0.5'], o({ fake }));
  expect(out).toMatch(/^已下載 fake:2 → media\/sfx\/fake-2-0\.2s-0\.5s\.wav（0\.5 秒/);
  await expect(assetsCommand(['search', 'rain', '--knd', 'music'], o({ fake }))).rejects.toThrow('沒有 --knd 這個選項');
  await expect(assetsCommand(['get', 'p1', 'fake:1', '--form=3'], o({ fake }))).rejects.toThrow('沒有 --form 這個選項');
});

test('flags are read the same wherever they stand; bad ones are a usage error', async () => {
  await expect(assetsCommand(['search', '--kind', 'pizza', 'rain'], o({ fake }))).rejects.toThrow('--kind 只能是 video、image、audio、music');
  await expect(assetsCommand(['search', 'rain', '--min-sec', 'x'], o({ fake }))).rejects.toThrow('--min-sec 要是數字');
  await expect(assetsCommand(['search', 'rain', '--opt', 'feel'], o({ fake }))).rejects.toThrow('--opt 要寫成 k=v');
  await expect(assetsCommand(['get', 'p1'], o({ fake }))).rejects.toThrow('用法：npm run tellcut -- assets get <專案> <編號>');
  await expect(assetsCommand(['get', 'nope', 'fake:1'], o({ fake }))).rejects.toThrow('沒有專案 nope');
  await expect(assetsCommand(['dance'], o({ fake }))).rejects.toThrow('用法：npm run tellcut -- assets sources');
});

test('search with thumbnails names one sheet first', async () => {
  const jpeg = readFileSync(await makePhoto(join(root, 'thumb.jpg'), { w: 330, h: 500 }));
  const thumbs = (async () => new Response(new Uint8Array(jpeg), { headers: { 'content-type': 'image/jpeg' } })) as unknown as typeof fetch;
  const pics: SourceAdapter = { ...fake, id: 'pics', kinds: ['image'], search: async () => [1, 2].map((n) => ({ ref: `pics:${n}`, source: 'pics', id: String(n), kind: 'image' as const, title: `Tower ${n}`, width: 2000, height: 3000, thumbUrl: `https://thumb.example/${n}.jpg` })) };
  const out = await assetsCommand(['search', 'tower'], o({ pics }, ['pics'], thumbs));
  expect(out.split('\n')[0]).toMatch(/^縮圖總覽：.+\.jpg（每格下面是編號；用 Read 看這一張就好）$/);
  expect(out.split('\n')[1]).toBe('');
  expect(out).toMatch(/\n    縮圖 .+1\.jpg\n/);
});

test('data prints what the source answers; a source without data says so', async () => {
  const facts: SourceAdapter = { ...fake, id: 'facts', summary: '查資料', data: async (q, ctx) => `答案：${q}${ctx.options.lang ? `（${ctx.options.lang}）` : ''}` };
  expect(await assetsCommand(['data', 'facts', '台北', '101', '--opt', 'lang=en'], o({ facts }))).toBe('答案：台北 101（en）');
  expect(await assetsCommand(['sources'], o({ facts }))).toContain('facts         查資料（另有資料查詢：assets data facts …）');
  await expect(assetsCommand(['data', 'fake', 'x'], o({ fake }))).rejects.toThrow('來源 fake 沒有資料查詢');
  await expect(assetsCommand(['data', 'facts'], o({ facts }))).rejects.toThrow('用法：npm run tellcut -- assets data <來源> <查詢…>');
});

test('get of a picture tells its size, not a length and a peak', async () => {
  const picture = await makePhoto(join(root, 'tower.jpg'), { w: 1200, h: 1800 });
  const pics: SourceAdapter = { ...fake, id: 'pics', kinds: ['image'], get: async (id, ctx) => { const file = join(ctx.tmpDir, `${id}.jpg`); copyFileSync(picture, file); return { file, kind: 'image', meta: { ...meta(id), source: 'pics' } }; } };
  const out = await assetsCommand(['get', 'p1', 'pics:7'], o({ pics }, ['pics']));
  expect(out.split('\n')[0]).toBe('已下載 pics:7 → media/pics/pics-7.jpg（1200×1800）');
  expect(out.split('\n')[1]).toBe("用法：c.photo('pics-7', { len: 3 })");
});

test('a contact sheet that cannot be made costs only the sheet line, not the results', async () => {
  const notImages = (async () => new Response('not a picture at all', { headers: { 'content-type': 'image/jpeg' } })) as unknown as typeof fetch;
  const broken: SourceAdapter = { ...fake, id: 'broken', kinds: ['image'], search: async () => [{ ref: 'broken:9', source: 'broken', id: '9', kind: 'image' as const, title: 'Tower 9', thumbUrl: 'https://thumb.example/9.jpg' }] };
  const out = await assetsCommand(['search', 'tower'], o({ broken }, ['broken'], notImages));
  expect(out.split('\n')[0]).toBe('broken:9  Tower 9');
  expect(out).not.toContain('縮圖總覽');
});

test('map prints the file, the layer, the tiles and the budget, and how to use it', async () => {
  await createProject({ id: 'p9', inputs: [], projectsDir, blank: true, size: [1080, 1920] });
  const t = new PNG({ width: 256, height: 256 }); t.data.fill(220);
  const png = PNG.sync.write(t);
  const tiles = (async () => new Response(new Uint8Array(png), { headers: { 'content-type': 'image/png' } })) as unknown as typeof fetch;
  const out = await assetsCommand(['map', 'p9', '--at', '25.0339,121.5645', '--zoom', '15', '--name', 'xinyi'], o({ maps }, ['maps'], tiles));
  expect(out).toMatch(/^地圖 → media\/maps\/maps-xinyi\.jpg（1080×1920，臺灣通用電子地圖，z15，圖磚 \d+ 張、新下載 \d+ 張；本片累計 \d+／3000）\n用法：c\.photo\('maps-xinyi', \{ len: 4, zoom: \[1, 1\.08\] \}\)\n地圖鏡頭.*c\.effect\('common\.mapcam', \{ at: 秒, len: 秒, source: 'maps-xinyi'.*\ncredits 已更新：media\/CREDITS\.md$/);
  await expect(assetsCommand(['map', 'p9', '--at', 'x', '--style', 'pink'], o({ maps }, ['maps'], tiles))).rejects.toThrow('--style 只能是 street、satellite、light、dark');
  await expect(assetsCommand(['map', 'p9', '--at', 'x', '--size', 'big'], o({ maps }, ['maps'], tiles))).rejects.toThrow('--size 要像 1080x1920');
  await expect(assetsCommand(['map', 'p9', '--at', 'x', '--no-pin=yes'], o({ maps }, ['maps'], tiles))).rejects.toThrow('--no-pin 後面不接值');
  await expect(assetsCommand(['map', 'p9', '--at', 'x', '--size', '0x1920'], o({ maps }, ['maps'], tiles))).rejects.toThrow('--size 的寬和高要在 64 到 4096 之間');
  await expect(assetsCommand(['map', 'p9', '--at', 'x', '--color', 'red'], o({ maps }, ['maps'], tiles))).rejects.toThrow('--color 要像 #e5484d');
  const plain = await assetsCommand(['map', 'p9', '--no-pin', '--at', '25.0339,121.5645', '--zoom', '15', '--name', 'xinyi-plain'], o({ maps }, ['maps'], tiles));
  expect(plain).toMatch(/^地圖 → media\/maps\/maps-xinyi-plain\.jpg/);
});

test('--help prints the usage of the subcommand it follows instead of reading it as a project or a keyword', async () => {
  expect(await assetsCommand(['map', '--help'], o({}, []))).toMatch(/^用法：npm run tellcut -- assets map <專案> .*--no-pin/);
  expect(await assetsCommand(['get', 'p1', '-h'], o({}, []))).toMatch(/^用法：npm run tellcut -- assets get <專案> <編號>/);
  expect(await assetsCommand(['search', '--help'], o({}, []))).toMatch(/^用法：npm run tellcut -- assets search/);
  expect(await assetsCommand(['--help'], o({}, []))).toMatch(/^用法：npm run tellcut -- assets sources \| source/);
});

const GUIDES = ['guides/workflow.md', 'apps/server/chat-prompt.md'];
const readGuide = (f: string) => readFileSync(join(TELLCUT_ROOT, f), 'utf8');

/** the code spans an agent copies: every span of workflow.md's Outside assets section, and every span naming assets elsewhere */
function assetSpans(f: string): string[] {
  const text = readGuide(f), at = text.indexOf('## Outside assets'), sec = f === 'guides/workflow.md' ? text.slice(at, text.indexOf('\n## ', at + 1)) : '';
  if (f === 'guides/workflow.md') expect(at, 'workflow.md has no "## Outside assets" section').toBeGreaterThan(0);
  return [...new Set([...[...sec.matchAll(/`[^`\n]+`/g)].map((m) => m[0]), ...[...text.matchAll(/`[^`\n]*\bassets [^`\n]*`/g)].map((m) => m[0])])];
}

test('the guides name every assets subcommand and nothing that is not there', () => {
  const workflow = readGuide('guides/workflow.md');
  for (const s of ASSET_SUBCOMMANDS) expect(workflow, `workflow.md 沒提到 assets ${s}`).toMatch(new RegExp(`assets ${s}(?![a-z])`));
  for (const f of GUIDES) {
    for (const m of readGuide(f).matchAll(/\bassets ([a-z][\w-]*)/g)) expect(ASSET_SUBCOMMANDS, `${f}: assets ${m[1]}`).toContain(m[1]);
    for (const span of assetSpans(f)) {
      // the flags an agent would type are flags the command takes …
      for (const m of span.matchAll(/(?<![\w-])(--[a-z][a-z-]*)/g)) expect(ASSET_FLAGS, `${f}: ${m[1]} in ${span}`).toContain(m[1]);
      // … and the values listed for --kind / --style / --mode are values it accepts
      for (const [flag, ok] of [['--kind', ASSET_KINDS], ['--style', MAP_STYLES], ['--mode', MAP_MODES]] as const)
        for (const m of span.matchAll(new RegExp(`${flag} ([a-z|（）\\p{Script=Han}]+)`, 'gu')))
          for (const v of m[1].split('|').map((x) => x.replace(/（.*）/u, ''))) expect(ok, `${f}: ${flag} ${v}`).toContain(v);
    }
  }
  expect(readGuide('apps/server/chat-prompt.md')).toContain('assets data wikimedia');});

test('the guides say what an agent must tell the user and must not assume', () => {
  // personal-use licences (BBC, the Incompetech mirror) are stricter than NC and say "personal use", not "NC"
  expect(readGuide('guides/workflow.md')).toContain('personal use only');
  // the editor's bar (its words in English and Chinese) with Reload / Ignore; Ignore would save the old project over the new assets
  const chat = readGuide('apps/server/chat-prompt.md');
  for (const s of [DICTS.en['ed.diskChanged'], DICTS.zh['ed.diskChanged'], 'Reload', 'never Ignore']) expect(chat).toContain(s);
  // downloads are only peak-limited, never made louder, and sfxFile is not ducked
  expect(readGuide('guides/workflow.md')).toContain('only peak-limited, never made louder');
});

test('the cut-api cheat sheet tells where downloaded assets go', () => {
  const doc = formatCutApi();
  for (const s of ['assets get', 'assets map']) expect(doc).toContain(s);
});


// brand plan 5: a wall of photos is one call
test('get takes several refs: each downloaded in turn, the failures listed, an error when any failed', async () => {
  const some: SourceAdapter = { ...fake, get: async (id, ctx) => { if (id === 'bad') throw new SourceError('fake', 'missing', 'fake 沒有 bad'); return fake.get(id, ctx); } };
  const ok = await assetsCommand(['get', 'p1', 'fake:7', 'fake:8'], o({ fake: some }));
  expect(ok).toMatch(/已下載 fake:7/);
  expect(ok).toMatch(/已下載 fake:8/);
  const e = await assetsCommand(['get', 'p1', 'fake:9', 'fake:bad', 'fake:10'], o({ fake: some })).catch((x) => x);
  expect(e).toBeInstanceOf(Error);
  expect(String(e.message)).toMatch(/已下載 fake:9/);
  expect(String(e.message)).toMatch(/已下載 fake:10/);
  expect(String(e.message)).toMatch(/沒拿到.*fake:bad/s);
});

test('--from/--len with several refs is refused (they are per clip)', async () => {
  await expect(assetsCommand(['get', 'p1', 'fake:1', 'fake:2', '--len', '3'], o({ fake }))).rejects.toThrow(/一次一個/);
});
