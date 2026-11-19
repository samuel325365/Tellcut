// Picture windows drawn for real by the built player: a warm structured picture (the transitions' fixture A) cut to every named
// shape over a plain magenta stage, so a pixel tells the picture from the background. The visible share of the frame is measured
// against the shape's own area, the shapes' silhouettes are kept apart from each other, and the outline and the shadow are
// found where they should be.
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { corePlugin, createRegistry, parseProject, SHAPE_TYPES, shapeArea, type NamedShape } from '@tellcut/engine';
import { TELLCUT_ROOT } from './paths.ts';
import { openHost, type PageHost } from './render.ts';
import { withProjectPage } from './stills.ts';
import { meanAbsDiff, printOf, TEMPLATE_LIKENESS, type Rgba } from './likeness.ts';

const W = 480, H = 270, FPS = 10;
const work = join(TELLCUT_ROOT, 'projects/_shapes-test');
const registry = createRegistry([corePlugin]);
const FIXTURES = join(TELLCUT_ROOT, 'packages/media-node/src/fixtures');
let host: PageHost;

beforeAll(async () => {
  mkdirSync(join(work, 'media'), { recursive: true });
  for (const k of ['a', 'b']) copyFileSync(join(FIXTURES, `transition-${k}.png`), join(work, `media/p${k}.png`));
  host = await openHost();
}, 120000);
afterAll(async () => {
  await host?.close();
  rmSync(work, { recursive: true, force: true });
});

const crop = { from: { x: 0.5, y: 0.5, zoom: 1 }, to: { x: 0.5, y: 0.5, zoom: 1 } };
/** one or more clips (each 0–4 s unless they say, over the stage `bg`) in a w × h film */
const film = (clips: Array<Record<string, unknown>>, o: { bg?: string; w?: number; h?: number } = {}) => parseProject({ version: 1,
  meta: { name: 's', width: o.w ?? W, height: o.h ?? H, fps: FPS, duration: 4, plugins: [], background: o.bg ?? '#ff00ff',
    mix: { master: 0.9, compressor: { threshold: -14, ratio: 3, attack: 0.01, release: 0.2 }, reverb: { seconds: 1, send: 0 } } },
  sources: { a: { path: 'media/pa.png', duration: 1, width: 480, height: 270, kind: 'image' }, b: { path: 'media/pb.png', duration: 1, width: 480, height: 270, kind: 'image' } },
  media: {}, grids: [],
  tracks: [{ id: 'v', kind: 'video', items: clips.map((c, i) => ({ id: `c${i}`, source: 'a', in: 0, speed: 1, start: 0, end: 4, crop, ...c })) }] });

interface Shot { w: number; h: number; d: Uint8Array; png: Buffer }
/** the film drawn at each of `times` (seconds) in one page */
const shoot = (clips: Array<Record<string, unknown>>, times: number[] = [0.5], o: { bg?: string; w?: number; h?: number } = {}) =>
  withProjectPage({ dir: work, project: film(clips, o), registry, host }, async (s) => {
    const out: Shot[] = [];
    for (const t of times) {
      await s.frame(Math.round(t * FPS));
      const png = await s.png(), r = PNG.sync.read(png);
      out.push({ w: r.width, h: r.height, d: r.data, png });
    }
    return out;
  });
const one = async (clip: Record<string, unknown>, o: { bg?: string; w?: number; h?: number } = {}) => (await shoot([clip], [0.5], o))[0];

type RGB = [number, number, number];
const px = (s: Shot, x: number, y: number): RGB => { const i = (Math.round(y) * s.w + Math.round(x)) * 4; return [s.d[i], s.d[i + 1], s.d[i + 2]]; };
const far = (a: RGB, b: RGB) => Math.max(...[0, 1, 2].map((i) => Math.abs(a[i] - b[i])));
const MAGENTA: RGB = [255, 0, 255], GREEN: RGB = [0, 255, 0];
/** a pixel of the picture, not the magenta stage (edge pixels count when they are more picture than stage) */
const isPicture = (c: RGB) => far(c, MAGENTA) > 100;
/** the share of the frame that shows the picture, and the box round it */
function visible(s: Shot) {
  let n = 0, x0 = s.w, y0 = s.h, x1 = -1, y1 = -1;
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) if (isPicture(px(s, x, y))) { n++; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return { share: n / (s.w * s.h), box: [x0, y0, x1 + 1, y1 + 1] };
}
/** the shot as a silhouette: the picture white, the stage black */
const mask = (s: Shot): Rgba => {
  const data = new Uint8Array(s.w * s.h * 4);
  for (let i = 0; i < s.w * s.h; i++) { const v = isPicture([s.d[i * 4], s.d[i * 4 + 1], s.d[i * 4 + 2]]) ? 255 : 0; data.set([v, v, v, 255], i * 4); }
  return { width: s.w, height: s.h, data };
};

/** every type once, as an editor would first set it */
const TEXT: NamedShape = { type: 'text', text: 'ROMA' };
const PLAIN: NamedShape[] = SHAPE_TYPES.map((type) => (type === 'text' ? TEXT : ({ type }) as NamedShape));
const label = (s: NamedShape) => s.type === 'text' ? `text "${s.text.replace('\n', ' / ')}"` : JSON.stringify(s).replace(/"/g, '').replace(/^\{type:/, '').replace(/}$/, '');

/** each plain type drawn once and shared by the tests below */
const drawn = new Map<string, Promise<Shot>>();
const plain = (s: NamedShape) => { const k = JSON.stringify(s); let x = drawn.get(k); if (!x) drawn.set(k, (x = one({ shape: s }))); return x; };

test('every shape shows the share of the frame its outline covers', async () => {
  const rows: string[] = [];
  for (const s of PLAIN.filter((p) => p.type !== 'text')) {
    const got = visible(await plain(s)).share, want = shapeArea(s, W, H)!;
    // the seeded shapes' ragged edges are many partly covered pixels: a looser tolerance
    const tol = ['blob', 'torn', 'brush'].includes(s.type) ? 0.025 : 0.012;
    rows.push(`${s.type.padEnd(8)} visible ${got.toFixed(4)} area ${want.toFixed(4)}`);
    expect(Math.abs(got - want), `${s.type}: ${got.toFixed(4)} vs ${want.toFixed(4)}`).toBeLessThanOrEqual(tol);
  }
  if (process.env.TELLCUT_SHAPE_SCORES) writeFileSync(`${process.env.TELLCUT_SHAPE_SCORES}.areas.txt`, rows.join('\n'));
  // and against the geometry itself: a circle is π/4 of the square inscribed in the frame, an ellipse π/4 of the frame
  expect(visible(await plain({ type: 'circle' })).share).toBeCloseTo((Math.PI / 4) * (H / W), 2);
  expect(visible(await plain({ type: 'ellipse' })).share).toBeCloseTo(Math.PI / 4, 2);
  // a square ngon fills the frame's middle square, four slats the frame less three gaps of 4 % of its height
  expect(visible(await one({ shape: { type: 'ngon', sides: 4, turn: 45 } })).share).toBeCloseTo(H / W, 2);
  expect(visible(await plain({ type: 'slats' })).share).toBeCloseTo(1 - (3 * 0.04 * H) / W, 2);
}, 300000);

test('the text shape: big letters fitted to the frame, centred; two lines one above the other', async () => {
  const a = visible(await plain(TEXT)), [x0, y0, x1, y1] = a.box;
  expect(a.share).toBeGreaterThan(0.25);
  expect(a.share).toBeLessThan(0.8);
  // as large as fits: one of its sides spans nearly the frame's, and it is centred
  expect(Math.max((x1 - x0) / W, (y1 - y0) / H)).toBeGreaterThan(0.95);
  expect(Math.abs((x0 + x1) / 2 - W / 2)).toBeLessThan(0.02 * W);
  expect(Math.abs((y0 + y1) / 2 - H / 2)).toBeLessThan(0.02 * H);
  const two = await one({ shape: { type: 'text', text: 'ROMA\nCITY' } }), b = visible(two);
  expect(Math.max((b.box[2] - b.box[0]) / W, (b.box[3] - b.box[1]) / H)).toBeGreaterThan(0.95);
  // a row of stage between the lines: some row in the middle third shows (almost) no picture
  const rowShare = (y: number) => { let n = 0; for (let x = 0; x < W; x++) if (isPicture(px(two, x, y))) n++; return n / W; };
  const mids = Array.from({ length: Math.round(H / 3) }, (_, i) => rowShare(Math.round(H / 3) + i));
  expect(Math.min(...mids)).toBeLessThan(0.05);
  expect(rowShare(Math.round(b.box[1] + 0.2 * (b.box[3] - b.box[1])))).toBeGreaterThan(0.2);
}, 180000);

// Admission, as for the transitions: every shape must look clearly unlike every other. Compared as silhouettes (the picture in them
// is the same picture), by the edge-map likeness of likeness.ts.
test('admission: every pair of shapes differs clearly', async () => {
  const prints = new Map<string, Float32Array>(), whole = new Map<string, Float32Array>();
  for (const s of PLAIN) { const shot = await plain(s); prints.set(s.type, printOf(mask(shot))); whole.set(s.type, printOf({ width: shot.w, height: shot.h, data: shot.d })); }
  const rows: string[] = [], close: string[] = [];
  for (let i = 0; i < PLAIN.length; i++) for (let j = i + 1; j < PLAIN.length; j++) {
    const a = PLAIN[i].type, b = PLAIN[j].type, d = meanAbsDiff(prints.get(a)!, prints.get(b)!), dw = meanAbsDiff(whole.get(a)!, whole.get(b)!);
    rows.push(`${a.padEnd(8)} ${b.padEnd(8)} silhouette ${d.toFixed(3)} picture ${dw.toFixed(3)}${d > TEMPLATE_LIKENESS ? '' : '  TOO ALIKE'}`);
    if (d <= TEMPLATE_LIKENESS) close.push(`${a} ~ ${b}: ${d.toFixed(3)}`);
  }
  // TELLCUT_SHAPE_SCORES=<file>: every pair's distances written there, closest first
  if (process.env.TELLCUT_SHAPE_SCORES) writeFileSync(process.env.TELLCUT_SHAPE_SCORES, rows.sort((x, y) => +x.split('silhouette ')[1].slice(0, 5) - +y.split('silhouette ')[1].slice(0, 5)).join('\n'));
  expect(close).toEqual([]);
}, 300000);

// the outline is 40 px at a 1080 short side: 10 px on this 270 px high stage
const OUTLINE = { width: 40, color: '#00ff00' };
test('an outline: a ring of its colour on the shape\'s edge, inside the frame, the picture within it', async () => {
  // a circle inset by half the line: its path has radius 130 round the centre, the line from 125 to 135
  const s = await one({ shape: { type: 'circle' }, outline: OUTLINE });
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * 2 * Math.PI, at = (r: number): [number, number] => [W / 2 + r * Math.cos(a), H / 2 + r * Math.sin(a)];
    expect(far(px(s, ...at(130)), GREEN), `ring at ${k}`).toBeLessThanOrEqual(30);
    expect(isPicture(px(s, ...at(119))) && far(px(s, ...at(119)), GREEN) > 100, `picture at ${k}`).toBe(true);
    if (Math.abs(Math.sin(a)) < 0.9) expect(far(px(s, ...at(141)), MAGENTA), `stage at ${k}`).toBeLessThanOrEqual(30);
  }
  // the top and bottom of the ring touch the frame's edge without being cut by it
  expect(far(px(s, W / 2, 1), GREEN)).toBeLessThanOrEqual(30);
  expect(far(px(s, W / 2, H - 2), GREEN)).toBeLessThanOrEqual(30);
  // a plain frame with rounded corners: the line runs along its edge, its corners round
  const f = await one({ frame: [0.25, 0.25, 0.5, 0.5], radius: 30, outline: OUTLINE });
  for (const [x, y] of [[240, 67.5 + 4], [240, 202.5 - 5], [120 + 4, 135], [360 - 5, 135]]) expect(far(px(f, x, y), GREEN), `(${x}, ${y})`).toBeLessThanOrEqual(30);
  expect(far(px(f, 240, 135), GREEN)).toBeGreaterThan(100);
  expect(far(px(f, 121, 68.5), MAGENTA)).toBeLessThanOrEqual(30);                        // the rounded corner's outside
  expect(far(px(f, 240, 67.5 - 3), MAGENTA)).toBeLessThanOrEqual(30);
  // a polygon: a triangle's base along the frame's bottom
  const t = await one({ shape: [[0.5, 0], [1, 1], [0, 1]], outline: OUTLINE });
  expect(far(px(t, W / 2, H - 5), GREEN)).toBeLessThanOrEqual(30);
  expect(far(px(t, W / 2, H - 20), GREEN)).toBeGreaterThan(100);
  // the text shape's letters are stroked
  const x = await one({ shape: TEXT, outline: OUTLINE });
  let green = 0;
  for (let i = 0; i < x.w * x.h; i++) if (far([x.d[i * 4], x.d[i * 4 + 1], x.d[i * 4 + 2]], GREEN) <= 30) green++;
  expect(green / (W * H)).toBeGreaterThan(0.03);
}, 180000);

test('a shadow: darker stage just below the shape, none above it; true gives a softer default', async () => {
  const GREY: RGB = [216, 216, 216], frame = [0.25, 0.15, 0.5, 0.6];   // 240 × 162 at (120, 40.5): a circle of radius 81 round (240, 121.5)
  const bg = '#d8d8d8', bottom = 121.5 + 81, top = 121.5 - 81;
  const none = await one({ frame, shape: { type: 'circle' } }, { bg });
  const hard = await one({ frame, shape: { type: 'circle' }, shadow: { blur: 8, y: 40, opacity: 0.8 } }, { bg });
  const soft = await one({ frame, shape: { type: 'circle' }, shadow: true }, { bg });
  expect(far(px(none, 240, bottom + 5), GREY)).toBeLessThanOrEqual(6);
  // 10 px down: 5 px under the circle the shadow is near full strength (0.8 of black over the grey)
  expect(px(hard, 240, bottom + 5)[0]).toBeLessThan(80);
  expect(far(px(hard, 240, top - 4), GREY)).toBeLessThanOrEqual(6);
  expect(px(soft, 240, bottom + 4)[0]).toBeLessThan(200);
  expect(px(soft, 240, bottom + 4)[0]).toBeGreaterThan(px(hard, 240, bottom + 5)[0]);
  // a frame with neither shape nor outline casts one too: under its bottom edge
  const plainFrame = await one({ frame, shadow: { blur: 8, y: 40, opacity: 0.8 } }, { bg });
  expect(px(plainFrame, 240, 40.5 + 162 + 5)[0]).toBeLessThan(80);
}, 180000);

test('transitions on a shaped clip: the dip\'s veil and the blur are cut by the shape', async () => {
  // alone from 0 s with a 1 s transition; at 0.75 s a dip has its veil half off, a blur at 0.25 s is at its blurriest
  const [dip] = await shoot([{ shape: { type: 'circle' }, transitionIn: { type: 'dip', dur: 1 } }], [0.8]);
  expect(far(px(dip, W / 2 + 140, H / 2), MAGENTA)).toBeLessThanOrEqual(12);              // outside the circle: the stage, no veil
  expect(Math.max(...px(dip, W / 2, H / 2))).toBeLessThan(200);                            // inside: the picture under the veil
  const [blur] = await shoot([{ shape: { type: 'star' }, transitionIn: { type: 'blur', dur: 1 } }], [0.3]);
  // the star's tips and the stage between them: the blurred picture stays inside the star (a CSS blur would leak out of it)
  const [sharp] = await shoot([{ shape: { type: 'star' } }], [0.3]);
  let leaked = 0, n = 0;
  for (let y = 0; y < H; y += 3) for (let x = 0; x < W; x += 3) if (!isPicture(px(sharp, x, y))) { n++; if (far(px(blur, x, y), MAGENTA) > 40) leaked++; }
  expect(leaked / n).toBeLessThan(0.02);
}, 180000);

// The review sheets, only when asked for: TELLCUT_SHAPE_SHEETS=<folder> writes there shapes.png (every type plain, then with a
// white outline and a shadow, on a paper-coloured stage), shapes-params.png (parameters at work), shapes-text.png (the text shape:
// one line, two lines, outlined, on a 9:16 frame) and shapes-blob.png (a wobbling blob at three times), 480 × 270 a cell.
const SHEETS = process.env.TELLCUT_SHAPE_SHEETS;
test.runIf(!!SHEETS)('review sheets', async () => {
  type Cell = { label: string; png: Buffer; w: number; h: number };
  const PAPER = '#efe6d6', DRESS = { outline: { width: 14, color: '#ffffff' }, shadow: true };
  const cell = async (clip: Record<string, unknown>, lbl: string, o: { w?: number; h?: number; t?: number } = {}): Promise<Cell> => {
    const [s] = await shoot([clip], [o.t ?? 0.5], { bg: PAPER, ...o });
    return { label: lbl, png: s.png, w: s.w, h: s.h };
  };
  const rows4 = (cells: Cell[]) => Array.from({ length: Math.ceil(cells.length / 4) }, (_, i) => cells.slice(4 * i, 4 * i + 4));
  const sheet = async (file: string, rows: Cell[][]) => {
    const html = `<!doctype html><html><body style="margin:0;background:#222;font:14px sans-serif;color:#eee"><div style="display:inline-block;padding:8px">${rows.map((r) =>
      `<div style="display:flex;gap:8px;margin-bottom:8px">${r.map((c) => `<figure style="margin:0"><img style="display:block;width:${c.w}px;height:${c.h}px" src="data:image/png;base64,${c.png.toString('base64')}"><figcaption style="padding:2px 0">${c.label}</figcaption></figure>`).join('')}</div>`).join('')}</div></body></html>`;
    const page = await host.browser.newPage({ viewport: { width: 2100, height: 1200 } });
    try {
      await page.setContent(html);
      const box = await page.locator('body > div').boundingBox();
      mkdirSync(SHEETS!, { recursive: true });
      writeFileSync(join(SHEETS!, file), await page.screenshot({ clip: { x: 0, y: 0, width: Math.ceil(box!.width), height: Math.ceil(box!.height) }, fullPage: true }));
    } finally { await page.close(); }
  };
  // the window over a stage, as a film would have it: a frame inset from the edges
  const win = [0.08, 0.08, 0.84, 0.84];
  const plainCells: Cell[] = [], dressed: Cell[] = [];
  for (const s of PLAIN) plainCells.push(await cell({ frame: win, shape: s }, label(s)));
  for (const s of PLAIN) dressed.push(await cell({ frame: win, shape: s, ...DRESS }, `${label(s)} + outline, shadow`));
  dressed.push(await cell({ frame: win, radius: 40, ...DRESS }, 'frame, radius 40 + outline, shadow'));
  dressed.push(await cell({ frame: win, shape: [[0.05, 0], [1, 0.08], [0.95, 1], [0, 0.9]], ...DRESS }, 'polygon + outline, shadow'));
  await sheet('shapes.png', [...rows4(plainCells), ...rows4(dressed)]);
  const params: NamedShape[] = [
    { type: 'star', points: 12, inner: 0.78 }, { type: 'star', points: 5, round: 0.35 }, { type: 'ngon', sides: 3 }, { type: 'ngon', sides: 4, turn: 45, round: 0.25 },
    { type: 'bubble', tail: 'right' }, { type: 'bubble', tail: 'top' }, { type: 'stamp', teeth: 9 }, { type: 'stamp', teeth: 30 },
    { type: 'blob', seed: 2 }, { type: 'blob', seed: 3, lobes: 3 }, { type: 'torn', seed: 2, sides: 'tb', rough: 1 }, { type: 'torn', seed: 3, rough: 0.2 },
    { type: 'brush', seed: 2 }, { type: 'brush', seed: 3, rough: 1 }, { type: 'slats', count: 5, angle: 30 }, { type: 'slats', count: 3, angle: 90, gap: 0.08 },
  ];
  const pc: Cell[] = [];
  for (const s of params) pc.push(await cell({ frame: win, shape: s, ...DRESS }, label(s)));
  await sheet('shapes-params.png', rows4(pc));
  await sheet('shapes-text.png', [[
    await cell({ shape: TEXT }, 'text ROMA'),
    await cell({ shape: { type: 'text', text: 'ROMA\nCITY' } }, 'text ROMA / CITY'),
    await cell({ frame: win, shape: { type: 'text', text: 'ROMA\nCITY' }, ...DRESS }, 'two lines + outline, shadow'),
    await cell({ shape: { type: 'text', text: '羅馬', weight: 700 }, ...DRESS }, 'text 羅馬, weight 700'),
  ], [
    await cell({ shape: { type: 'text', text: 'GO' } }, 'text GO, 9:16', { w: 152, h: 270 }),
    await cell({ shape: { type: 'text', text: 'DAY\nONE', font: 'body', line: 0.85 }, ...DRESS }, 'DAY / ONE, 9:16, line 0.85', { w: 152, h: 270 }),
    await cell({ frame: [0.1, 0.3, 0.8, 0.4], shape: { type: 'text', text: 'Summer in Rome', weight: 900 }, outline: { width: 10, color: '#1a1a1a' } }, 'a band of text, dark outline'),
  ]]);
  const blob = { frame: win, shape: { type: 'blob', seed: 4, wobble: 0.8 }, ...DRESS };
  await sheet('shapes-blob.png', [[await cell(blob, 'blob wobble 0.8, t = 0', { t: 0 }), await cell(blob, 't = 1.5', { t: 1.5 }), await cell(blob, 't = 3', { t: 3 })]]);
}, 900000);
