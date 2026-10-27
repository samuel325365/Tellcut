import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { writeFileSync } from 'node:fs';
import { createRegistry, parseProject } from '@tellcut/engine';
import { fakeOcr, projectRegistry, TELLCUT_ROOT, run } from '@tellcut/media-node';
import { plugins } from '@tellcut/plugins';
import { renderedChecks, samePicture } from './page.ts';

const dir = join(TELLCUT_ROOT, 'projects/_check-test');
const MIX = { master: 0.9, compressor: { threshold: -12, ratio: 3, attack: 0.01, release: 0.2 }, reverb: { seconds: 0.5, send: 0.3 } };

beforeAll(async () => {
  // a run stopped midway leaves its OCR caches behind (afterAll never ran): the next run read every frame from them
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
  const r = await renderedChecks({ dir, project: p, registry: createRegistry(plugins), sheet: true });
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

test('a 3D fx drawn with ctx.three (the example) draws the same picture at the same time', async () => {
  mkdirSync(join(dir, 'fx'), { recursive: true });
  writeFileSync(join(dir, 'fx', 'spin3d.js'), readFileSync(join(TELLCUT_ROOT, 'tools/fx-example/spin3d.js'), 'utf8'));
  const p = parseProject({ version: 1,
    meta: { name: 's', width: 320, height: 180, fps: 30, duration: 2, plugins: [], fx: ['fx/spin3d.js'], mix: MIX }, sources: {}, media: {}, grids: [],
    tracks: [{ id: 'o', kind: 'overlay', items: [{ id: 'spin', type: 'fx.spin3d', start: 0, end: 2, params: { text: 'Hi' } }] }] });
  const { registry } = await projectRegistry(dir, plugins, p);
  const msgs = (await renderedChecks({ dir, project: p, registry })).findings.map((f) => f.msg);
  expect(msgs.filter((m) => m.startsWith('fx 不是決定性的'))).toEqual([]);
  expect(msgs.filter((m) => m.includes('spin') && /失敗|錯誤|error/i.test(m))).toEqual([]);
}, 300000);

test('a bleeped word the finished frame still shows is reported, Simplified or not (frames read once, then from the cache); no OCR is a note', async () => {
  const p = parseProject({ version: 1,
    meta: { name: 'l', width: 640, height: 360, fps: 30, duration: 3, plugins: [], cut: { crf: 23, preset: 'ultrafast' }, mix: MIX },
    sources: { s1: { path: 'src.mp4', duration: 3, width: 640, height: 360 } }, media: {}, grids: [],
    tracks: [
      { id: 'v', kind: 'video', items: [{ id: 'c', source: 's1', in: 0, speed: 1, start: 0, end: 3, crop: { from: { x: 0.5, y: 0.5, zoom: 1 }, to: { x: 0.5, y: 0.5, zoom: 1 } } }] },
      { id: 'o', kind: 'overlay', items: [{ id: 'cap', type: 'common.caption', start: 1, end: 2, params: { text: '{發票}對獎' } }] },
    ] });
  rmSync(join(dir, 'cache', 'check', 'ocr-v2.json'), { force: true });
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
