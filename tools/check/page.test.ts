import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { writeFileSync } from 'node:fs';
import { createRegistry, parseProject } from '@tellcut/engine';
import { fakeOcr, isAlive, projectRegistry, TELLCUT_ROOT, run, withProjectPage } from '@tellcut/media-node';
import { plugins } from '@tellcut/plugins';
import { renderedChecks, samePicture } from './page.ts';

// one folder per process: two runs at once (a full run beside a single file) deleted each other's footage in a shared one
const dir = join(TELLCUT_ROOT, `projects/_check-test-${process.pid}`);
const MIX = { master: 0.9, compressor: { threshold: -12, ratio: 3, attack: 0.01, release: 0.2 }, reverb: { seconds: 0.5, send: 0.3 } };

beforeAll(async () => {
  // a run stopped midway leaves its folder behind (afterAll never ran): one of a process that is gone is removed here
  for (const name of readdirSync(join(TELLCUT_ROOT, 'projects'))) {
    const pid = Number(/^_check-test-(\d+)$/.exec(name)?.[1]);
    if (pid && !isAlive(pid)) rmSync(join(TELLCUT_ROOT, 'projects', name), { recursive: true, force: true });
  }
  // its own from an earlier run of this pid would hand over its OCR caches: the run read every frame from them
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  await run(['-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=30:duration=3', '-c:v', 'libx264', join(dir, 'src.mp4')]);
}, 120000);
afterAll(() => rmSync(dir, { recursive: true, force: true }));

test('the page layer: a title pushed off the frame is reported, the sheet is made, the silent mix is quiet for too long', async () => {
  const p = parseProject({ version: 1,
    meta: { name: 't', width: 640, height: 360, fps: 30, duration: 3, plugins: [], cut: { crf: 23, preset: 'ultrafast' }, mix: MIX },
    sources: { s1: { path: 'src.mp4', duration: 3, width: 640, height: 360 } }, media: {}, grids: [],
    tracks: [
      { id: 'v', kind: 'video', items: [{ id: 'c', source: 's1', in: 0, speed: 1, start: 0, end: 3, crop: { from: { x: 0.5, y: 0.5, zoom: 1 }, to: { x: 0.5, y: 0.5, zoom: 1 } } }] },
      { id: 'o', kind: 'overlay', items: [
        { id: 'off', type: 'core.title', start: 0, end: 1.5, params: { text: '這個標題太靠右了' }, transform: { x: 0.6, y: 0, scale: 1 } },
        { id: 'fine', type: 'core.caption', start: 1.5, end: 3, params: { text: '這句沒問題' } },
      ] },
    ] });
  // a stand-in OCR: the footage's own text is read on this clip too, and this machine's real OCR is not what is tested here
  const r = await renderedChecks({ dir, project: p, registry: createRegistry(plugins), sheet: true, ocr: fakeOcr() });
  const msgs = r.findings.map((f) => f.msg);
  expect(msgs).toContain('文字超出安全區（右邊）（off）');
  expect(msgs.some((m) => m.includes('fine'))).toBe(false);
  expect(msgs).toContain('沒有聲音');
  expect(r.sheet && existsSync(r.sheet)).toBe(true);
}, 300000);

test('an fx that draws something different at the same time is reported; a steady one is not', async () => {
  mkdirSync(join(dir, 'fx'), { recursive: true });
  const fx = (type: string, body: string) => `export default [{ type: '${type}', label: '${type}', kind: 'overlay', doc: 'd', params: [],
    build({ root, W, H }) { const c = document.createElement('canvas'); c.width = W; c.height = H; c.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%'; root.appendChild(c); return { c }; },
    draw({ local, W, H }, { c }) { const g = c.getContext('2d'); g.clearRect(0, 0, W, H); ${body} } }];\n`;
  writeFileSync(join(dir, 'fx', 'steady.js'), fx('fx.steady', 'g.fillStyle = "#f80"; g.fillRect(0, 0, W * local / 2, H);'));
  writeFileSync(join(dir, 'fx', 'noisy.js'), fx('fx.noisy', 'g.fillStyle = "#08f"; g.fillRect(0, 0, W * Math.random(), H);'));
  const p = parseProject({ version: 1,
    meta: { name: 'f', width: 320, height: 180, fps: 30, duration: 2, plugins: [], fx: ['fx/steady.js', 'fx/noisy.js'], mix: MIX }, sources: {}, media: {}, grids: [],
    tracks: [{ id: 'o', kind: 'overlay', items: [{ id: 'good', type: 'fx.steady', start: 0, end: 1, params: {} }, { id: 'bad', type: 'fx.noisy', start: 1, end: 2, params: {} }] }] });
  const { registry } = await projectRegistry(dir, plugins, p);
  const msgs = (await renderedChecks({ dir, project: p, registry })).findings.map((f) => f.msg);
  expect(msgs.filter((m) => m.startsWith('fx 不是決定性的'))).toHaveLength(1);
  expect(msgs.find((m) => m.startsWith('fx 不是決定性的'))).toContain('（bad）');
}, 300000);

test('words an fx draws on a canvas and reports (ctx.reportText) are measured: outside the safe area, too small, what it said', async () => {
  mkdirSync(join(dir, 'fx'), { recursive: true });
  // the canvas is twice the frame and shown at its size (a 2x canvas): the reports come back in frame pixels
  writeFileSync(join(dir, 'fx', 'words.js'), `export default [{ type: 'fx.words', label: 'w', kind: 'overlay', doc: 'd', params: [{ key: 'px', label: 'px', type: 'number', default: 40 }, { key: 'x', label: 'x', type: 'number', default: 180 }],
    build({ root, W, H }) { const c = document.createElement('canvas'); c.width = W * 2; c.height = H * 2; c.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%'; root.appendChild(c); return { c }; },
    draw(ctx, { c }) { const g = c.getContext('2d'); g.clearRect(0, 0, c.width, c.height); g.save(); g.scale(2, 2);
      g.font = '700 ' + ctx.params.px + 'px sans-serif'; g.fillStyle = '#fff'; g.textAlign = 'left'; g.fillText('Hello', ctx.params.x, 300); ctx.reportText(g, 'Hello', ctx.params.x, 300); g.restore(); } }];\n`);
  const p = parseProject({ version: 1,
    meta: { name: 'w', width: 360, height: 640, fps: 30, duration: 2, plugins: [], fx: ['fx/words.js'], mix: MIX }, sources: {}, media: {}, grids: [],
    tracks: [{ id: 'o', kind: 'overlay', items: [
      { id: 'edge', type: 'fx.words', start: 0, end: 1, params: { x: 2 } },              // 40 px on a 360 px wide frame: 120 at 1080
      { id: 'tiny', type: 'fx.words', start: 1, end: 2, params: { px: 10, x: 150 } },    // 10 px: 30 at 1080
    ] }] });
  const { registry } = await projectRegistry(dir, plugins, p);
  const r = await renderedChecks({ dir, project: p, registry });
  const msgs = r.findings.map((f) => f.msg);
  expect(msgs).toContain('文字超出安全區（左邊）（edge）');
  expect(msgs.find((m) => m.startsWith('canvas 上畫的字太小'))).toMatch(/約 30 px.*（tiny）/);
  expect(msgs.some((m) => m.includes('（tiny）') && m.includes('安全區'))).toBe(false);
  expect(r.drawn.words.get('edge')).toBe('Hello');
  expect(r.drawn.early.has('edge')).toBe(true);
}, 300000);

test('a 3D fx drawn with ctx.three (the example) draws the same picture at the same time', async () => {
  mkdirSync(join(dir, 'fx'), { recursive: true });
  writeFileSync(join(dir, 'fx', 'spin3d.js'), readFileSync(join(TELLCUT_ROOT, 'tools/fx-example/spin3d.js'), 'utf8'));
  const p = parseProject({ version: 1,
    meta: { name: 's', width: 320, height: 180, fps: 30, duration: 3, plugins: [], fx: ['fx/spin3d.js'], mix: MIX }, sources: {}, media: {}, grids: [],
    tracks: [{ id: 'o', kind: 'overlay', items: [{ id: 'spin', type: 'fx.spin3d', start: 0, end: 2, params: { text: 'Hi' } }] }] });
  const { registry } = await projectRegistry(dir, plugins, p);
  const msgs = (await renderedChecks({ dir, project: p, registry })).findings.map((f) => f.msg);
  expect(msgs.filter((m) => m.startsWith('fx 不是決定性的'))).toEqual([]);
  expect(msgs.filter((m) => m.includes('spin') && /失敗|錯誤|error/i.test(m))).toEqual([]);
  // and it draws something: two blank frames are "the same picture" too, so a fx that drew nothing passed the lines above.
  // Its frame differs from the empty one after it (2.5 s, past the item)
  const [shown, empty] = await withProjectPage({ dir, project: p, registry }, async (s) => {
    const at = async (t: number) => { await s.frame(Math.round(t * s.fps)); return s.png(); };
    return [await at(0.5), await at(2.5)];
  });
  expect(await samePicture(shown, empty)).toBe(false);
}, 300000);

test('a bleeped word the finished frame still shows is reported, Simplified or not (frames read once, then from the cache); no OCR is a note', async () => {
  const p = parseProject({ version: 1,
    meta: { name: 'l', width: 640, height: 360, fps: 30, duration: 3, plugins: [], cut: { crf: 23, preset: 'ultrafast' }, mix: MIX },
    sources: { s1: { path: 'src.mp4', duration: 3, width: 640, height: 360 } }, media: {}, grids: [],
    tracks: [
      { id: 'v', kind: 'video', items: [{ id: 'c', source: 's1', in: 0, speed: 1, start: 0, end: 3, crop: { from: { x: 0.5, y: 0.5, zoom: 1 }, to: { x: 0.5, y: 0.5, zoom: 1 } } }] },
      { id: 'o', kind: 'overlay', items: [{ id: 'cap', type: 'common.caption', start: 1, end: 2, params: { text: '{發票}對獎' } }] },
    ] });
  // both caches: the first test reads the same clip's own text with the same stand-in OCR, and its empty answers would be kept
  rmSync(join(dir, 'cache', 'check', 'ocr-v2.json'), { force: true });
  rmSync(join(dir, 'cache', 'check', 'ocr-lines-v2.json'), { force: true });
  // frames are written as <film seconds>.png; Simplified, as some footage is. A few letters typing on one frame before the clip
  // ends are read only enlarged (r3c-baking's "Cre…")
  const ocr = fakeOcr({ '1.5.png': '这张发票对奖', '2.95-x2.png': 'Crea' });
  const msgs = (await renderedChecks({ dir, project: p, registry: createRegistry(plugins), ocr })).findings.map((f) => f.msg);
  expect(msgs.find((m) => m.includes('被消音的「發票」'))).toContain('1.5 秒');   // read through the transcripts' s2twp
  expect(ocr.calls[0]).toHaveLength(3);                                     // 1, 1.5, 2
  // then the footage's own text, read with the video track alone (stray.ts): the same 1.5 s frame shows the subtitle
  expect(ocr.calls).toHaveLength(2);
  expect(msgs.find((m) => m.includes('原片自己的字壓在畫面框邊'))).toContain('「这张发票对奖」');   // the fake box spans the width
  expect(msgs.some((m) => m.includes('原片自己的字壓在畫面框邊') && m.includes('「Crea」'))).toBe(true);
  rmSync(join(dir, 'cache', 'check', 'ocr-lines-v2.json'), { force: false });   // it keeps its own cache
  await renderedChecks({ dir, project: p, registry: createRegistry(plugins), ocr });
  expect(ocr.calls).toHaveLength(3);                                        // the leak frames from the cache; the stray ones read again
  await renderedChecks({ dir, project: p, registry: createRegistry(plugins), ocr });
  expect(ocr.calls).toHaveLength(3);                                        // the same frames: all from the cache
  rmSync(join(dir, 'cache', 'check', 'ocr-v2.json'), { force: true });
  rmSync(join(dir, 'cache', 'check', 'ocr-lines-v2.json'), { force: true });
  const broken = { ...fakeOcr(), read: async () => { throw new Error('沒有 zh-Hant-TW 的文字辨識'); } };
  const notes = (await renderedChecks({ dir, project: p, registry: createRegistry(plugins), ocr: broken })).findings.filter((f) => f.level === 'note').map((f) => f.msg);
  expect(notes.some((m) => m.includes('文字辨識不能用'))).toBe(true);
  // the footage's own text too: it used to be skipped in silence, and a film with no bleeps read "沒有發現問題"
  expect(notes.some((m) => m.includes('原片自己的字') && m.includes('文字辨識不能用'))).toBe(true);
}, 300000);

test('a failure reading the footage’s own text (the second page) is a note: the first page’s findings are still reported', async () => {
  const p = parseProject({ version: 1,
    meta: { name: 'f', width: 640, height: 360, fps: 30, duration: 3, plugins: [], cut: { crf: 23, preset: 'ultrafast' }, mix: MIX },
    sources: { s1: { path: 'src.mp4', duration: 3, width: 640, height: 360 } }, media: {}, grids: [],
    tracks: [
      { id: 'v', kind: 'video', items: [{ id: 'c', source: 's1', in: 0, speed: 1, start: 0, end: 3, crop: { from: { x: 0.5, y: 0.5, zoom: 1 }, to: { x: 0.5, y: 0.5, zoom: 1 } } }] },
      { id: 'o', kind: 'overlay', items: [{ id: 'off', type: 'core.title', start: 0, end: 1.5, params: { text: '這個標題太靠右了' }, transform: { x: 0.6, y: 0, scale: 1 } }] },
    ] });
  rmSync(join(dir, 'cache', 'check', 'ocr-lines-v2.json'), { force: true });
  // a provider that answers with lines without boxes: reading them throws, after the first page is done
  const odd = { ...fakeOcr(), read: async (imgs: string[]) => imgs.map(() => ({ width: 640, height: 360, lines: [{ text: 'x' }] })) } as any;
  const r = await renderedChecks({ dir, project: p, registry: createRegistry(plugins), ocr: odd });
  expect(r.findings.map((f) => f.msg)).toContain('文字超出安全區（右邊）（off）');
  expect(r.findings.some((f) => f.level === 'note' && f.msg.includes('原片自己的字') && f.msg.includes('出錯'))).toBe(true);
  expect(r.drawn).toBeDefined();
}, 300000);

test('two pictures a few pixels apart are the same picture; a moved shape is not', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'same-')), png = async (filter: string, name: string) => {
    const out = join(dir, name);
    await run(['-f', 'lavfi', '-i', `color=gray:s=320x240,${filter}`, '-frames:v', '1', out]);
    return readFileSync(out);
  };
  const a = await png('drawbox=x=40:y=40:w=60:h=60:color=white:t=fill', 'a.png');
  const b = await png('drawbox=x=40:y=40:w=60:h=60:color=white:t=fill,drawbox=x=300:y=200:w=1:h=1:color=0x818181:t=fill', 'b.png');   // one pixel off by one
  const c = await png('drawbox=x=140:y=90:w=60:h=60:color=white:t=fill', 'c.png');                                                   // the box moved
  expect(await samePicture(a, a)).toBe(true);
  expect(await samePicture(a, b)).toBe(true);
  expect(await samePicture(a, c)).toBe(false);
}, 60000);
