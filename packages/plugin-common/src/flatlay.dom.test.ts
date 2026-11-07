// @vitest-environment jsdom
// common.flatlay (spec 2026-11-07-desk3d): the block's hooks run on a hand-made item context with the real three.js scene and a
// ThreeKit whose renderer is a stand-in (jsdom has no WebGL and no canvas: a stand-in 2D context takes any call and counts them).
import * as THREE from 'three';
import { itemMediaIssues, resolveTheme } from '@tellcut/engine';
import { flatlay, flatlayClip, readFly } from './flatlay.ts';
import { flyCrop } from './flatlay/camera.ts';
import { picAspect, parseObjects } from './flatlay/objects.ts';
import { paintBack } from './flatlay/paper.ts';
import { makeKit } from './three/kit.ts';

const calls = new WeakMap<HTMLCanvasElement, string[]>(), args = new WeakMap<HTMLCanvasElement, Array<[string, unknown[]]>>();
const anything: any = new Proxy(function () {}, {
  get: (_t, k) => (k === Symbol.toPrimitive ? () => 0 : k === 'then' ? undefined : anything),
  apply: () => anything, construct: () => anything, set: () => true,
});
const realGetContext = HTMLCanvasElement.prototype.getContext;
beforeAll(() => {
  (HTMLCanvasElement.prototype as any).getContext = function (this: HTMLCanvasElement) {
    const log = calls.get(this) ?? [], argLog = args.get(this) ?? []; calls.set(this, log); args.set(this, argLog);
    return new Proxy(anything, { get: (t, k) => {
      if (k === 'canvas') return this;
      if (k === 'measureText') return (s: string) => ({ width: String(s).length * 20 });
      if (typeof k === 'string' && ['fillRect', 'drawImage', 'clearRect', 'fillText', 'scale'].includes(k)) return (...a: unknown[]) => { log.push(k); argLog.push([k, a]); };
      return t[k];
    } });
  };
});
afterAll(() => { HTMLCanvasElement.prototype.getContext = realGetContext; });

const W = 1080, H = 1920;
let videos: Array<{ source: string; in: number; out: number; local: number }> = [];
const media: any = {
  video(ref: any, parent: HTMLElement, local: number) {
    videos.push({ source: ref.source, in: ref.in, out: ref.out, local });
    const id = `${ref.source}@${ref.in}`;
    let v = [...parent.querySelectorAll('video')].find((x) => x.dataset.id === id) as HTMLVideoElement | undefined;
    if (!v) {
      v = document.createElement('video'); v.dataset.id = id; parent.appendChild(v);
      Object.defineProperty(v, 'readyState', { value: 4 }); Object.defineProperty(v, 'videoWidth', { value: 1920 }); Object.defineProperty(v, 'videoHeight', { value: 1080 });
    }
    return v;
  },
  place() {}, stillUrl: (r: any) => `still:${r.source}@${r.t}`, fileUrl: () => '',
};

function fakeRenderer() {
  const canvas = document.createElement('canvas');
  return { domElement: canvas, shadowMap: { enabled: false, type: 0 }, setSize() {}, setClearColor() {}, render() {}, dispose() {} } as any;
}
const dofKit = (renderer: any = fakeRenderer()) => makeKit(THREE, {} as any, { makeRenderer: () => renderer, makeDofComposer: () => ({ setSize() {}, render() {} }) } as any);

function ctxOf(params: Record<string, unknown>, o: { len?: number; W?: number; H?: number; kit?: any; reports?: any[] } = {}) {
  const w = o.W ?? W, h = o.H ?? H, len = o.len ?? 5;
  const defaults = Object.fromEntries(flatlay.params.map((d) => [d.key, d.default]));
  const root = document.createElement('div');
  const ctx: any = {
    t: 0, local: 0, dur: len, item: { id: 'x', type: 'common.flatlay', start: 0, end: len, params }, params: { ...defaults, ...params }, root, top: document.createElement('div'),
    project: { meta: { width: w, height: h, fps: 30 }, sources: { a: { width: 1920, height: 1080 }, b: { width: 1920, height: 1080 } } },
    media, W: w, H: h, fps: 30, theme: resolveTheme({}, { width: w, height: h }), grades: {}, three: 'kit' in o ? o.kit : dofKit(), motion: undefined,
    reportText: (b: any) => o.reports?.push(b),
  };
  return ctx;
}
const at = (ctx: any, local: number) => { ctx.t = local; ctx.local = local; return ctx; };
async function built(params: Record<string, unknown>, o: Parameters<typeof ctxOf>[1] = {}) {
  const ctx = ctxOf(params, o), s = flatlay.build(ctx);
  await flatlay.ready?.(s);
  return { ctx, s };
}
const TWO = JSON.stringify([{ kind: 'postcard', shot: 'a|12', at: 0.2 }, { kind: 'polaroid', shot: 'b|3', at: 1.5 }]);

test('an overlay frame drawn with three.js', () => {
  expect([flatlay.type, flatlay.kind, flatlay.category, flatlay.three]).toEqual(['common.flatlay', 'overlay', 'frame', true]);
});

test("media() asks for each object's shot from when it comes in", () => {
  const item = { id: 'x', type: 'common.flatlay', start: 0, end: 5, params: { objects: TWO } } as any;
  expect(flatlay.media!(item, {} as any).videos).toEqual([
    { source: 'a', in: 12, out: 12 + 4.8, speed: 1, interp: 'none' },
    { source: 'b', in: 3, out: 3 + 3.5, speed: 1, interp: 'none' },
  ]);
  const still = { ...item, params: { objects: JSON.stringify([{ kind: 'card', shot: 'a|7||still' }]) } };
  expect(flatlay.media!(still, {} as any)).toEqual({ videos: [], stills: [{ source: 'a', t: 7, w: 1080 }] });
});

test('draw renders with shadows and depth of field', async () => {
  const { ctx, s } = await built({ objects: TWO });
  const seen = vi.spyOn(ctx.three, 'render');
  flatlay.draw(at(ctx, 3), s);
  const o = seen.mock.calls.at(-1)![4] as any;
  expect(o.shadows).toBe(true);
  expect(o.toneMapping).toBe('neutral');
  expect(o.dof.focus).toBeGreaterThan(0);
});

test("the picture face keeps the footage's colours", async () => {
  const { ctx, s } = await built({ objects: TWO });
  flatlay.draw(at(ctx, 3), s); flatlay.late!(ctx, s);
  const m = s.items[0].face.material as THREE.MeshPhysicalMaterial;
  expect(m.map).toBe(s.items[0].vt!.texture);
  expect(m.emissiveMap).toBe(m.map);
  expect(m.emissiveIntensity).toBeGreaterThanOrEqual(0.5);
  expect(m.emissiveIntensity).toBeLessThanOrEqual(0.6);
});

test('late uploads every visible video and nothing else', async () => {
  const kit = dofKit(), made: Array<ReturnType<typeof vi.fn>> = [];
  const real = kit.mediaTexture.bind(kit);
  kit.mediaTexture = (el: any) => { const t = real(el), up = vi.fn(t.update); made.push(up); return { ...t, update: up }; };
  const { ctx, s } = await built({ objects: TWO }, { kit });
  flatlay.draw(at(ctx, 1), s);
  made.forEach((u) => u.mockClear());
  flatlay.late!(ctx, s);
  expect(made.length).toBe(1);
  expect(made[0]).toHaveBeenCalledTimes(1);
});

// a source id the project does not have: the engine fails the item loudly (check and the player name the id, as for every block);
// built on its own, the face shows the stand-in
test('a shot naming no source is reported, and its face shows the stand-in', async () => {
  const item = { id: 'x', type: 'common.flatlay', start: 0, end: 5, params: { objects: JSON.stringify([{ kind: 'polaroid', shot: 'zz|3' }]) } } as any;
  expect(itemMediaIssues(flatlay as any, item, { sources: { a: {} } } as any)).toEqual(['unknown source "zz"']);
  const { ctx, s } = await built({ objects: JSON.stringify([{ kind: 'polaroid', shot: 'zz|3' }]) });
  videos = [];
  flatlay.draw(at(ctx, 2), s); flatlay.late!(ctx, s);
  expect(videos).toEqual([]);
  expect((s.items[0].face.material as THREE.MeshPhysicalMaterial).map).toBe(s.items[0].placeholder);
});

test('draws a flat stand-in without WebGL', async () => {
  const kit = makeKit(THREE, {} as any, { makeRenderer: () => null });
  const { ctx, s } = await built({ objects: TWO }, { kit });
  expect(() => flatlay.draw(at(ctx, 3), s)).not.toThrow();
  const log = calls.get(s.c) ?? [];
  expect(log.filter((k) => k === 'fillRect' || k === 'drawImage').length).toBeGreaterThan(0);
});

test('draw(2.0), draw(0.5), draw(2.0) give the same scene', async () => {
  const p = { objects: JSON.stringify([{ kind: 'postcard', shot: 'a|1', at: 0, flipAt: 0, flipDur: 0.3, back: '0.3-2.5|謝謝你那時候願意出發', mark: 'ROMA|羅馬|2024', markAt: 1.0 }]) };
  const { ctx, s } = await built(p);
  const snap = () => ({ pose: [s.items[0].group.position.toArray(), s.items[0].turn.rotation.toArray()], key: s.items[0].backKey });
  flatlay.draw(at(ctx, 2.0), s); const a = snap(), v1 = s.items[0].backTex.version;
  flatlay.draw(at(ctx, 0.5), s); const v2 = s.items[0].backTex.version;
  flatlay.draw(at(ctx, 2.0), s); const b = snap();
  expect(b).toEqual(a);
  expect(v2).toBeGreaterThan(v1);
  expect(s.items[0].backKey).not.toBe('');
});

test('while the picture covers the screen the block draws nothing', async () => {
  const { ctx, s } = await built({ objects: TWO, fly: { index: 0, at: 2, dur: 1, back: 4, backDur: 0.5 } });
  const seen = vi.spyOn(ctx.three, 'render');
  flatlay.draw(at(ctx, 3.5), s);
  expect(seen).not.toHaveBeenCalled();
  const log = calls.get(s.c) ?? [], n = log.length;
  expect(log.slice(-1)[0]).toBe('clearRect');
  flatlay.draw(at(ctx, 4.25), s);
  expect(seen).toHaveBeenCalled();
  expect((calls.get(s.c) ?? []).slice(n)).toContain('drawImage');
});

test('words on the canvas are reported to check', async () => {
  for (const [w, h] of [[1080, 1920], [1920, 1080]]) {
    const reports: any[] = [];
    const p = { objects: JSON.stringify([
      { kind: 'postcard', shot: 'a|1', place: 'Roma', year: '2024', at: 0 },
      { kind: 'polaroid', shot: 'b|1', caption: '那年夏天', at: 0.2 },
    ]) };
    const { ctx, s } = await built(p, { W: w, H: h, reports, len: 5 });
    flatlay.draw(at(ctx, 5), s);
    const texts = reports.map((r) => r.text);
    expect(texts).toEqual(expect.arrayContaining(['Roma', '2024', '那年夏天']));
    const safe = ctx.theme.safe;
    for (const r of reports) {
      expect(r.x).toBeGreaterThanOrEqual(safe.side * w - 1); expect(r.x + r.w).toBeLessThanOrEqual(w * (1 - safe.side) + 1);
      expect(r.y).toBeGreaterThanOrEqual(safe.top * h - 1); expect(r.y + r.h).toBeLessThanOrEqual(h * (1 - safe.bottom) + 1);
    }
  }
  // the back's handwriting and the postmark
  const reports: any[] = [];
  const { ctx, s } = await built({ objects: JSON.stringify([{ kind: 'postcard', shot: 'a|1', at: 0, flipAt: 0, flipDur: 0.3, back: '0.3-1|謝謝你', mark: 'ROMA|羅馬|2024', markAt: 1 }]) }, { reports });
  flatlay.draw(at(ctx, 3), s);
  expect(reports.map((r) => r.text)).toEqual(expect.arrayContaining(['謝謝你', 'ROMA']));
});

test('dispose frees every geometry, material, texture and video texture', async () => {
  const { ctx, s } = await built({ objects: TWO });
  flatlay.draw(at(ctx, 3), s); flatlay.late!(ctx, s);
  const geos = new Set<THREE.BufferGeometry>(), mats = new Set<THREE.Material>(), texs = new Set<THREE.Texture>();
  s.scene.traverse((o: any) => {
    if (o.geometry) geos.add(o.geometry);
    for (const m of [o.material].flat().filter(Boolean)) { mats.add(m); for (const v of Object.values(m)) if (v instanceof THREE.Texture) texs.add(v); }
    if (o.map instanceof THREE.Texture) texs.add(o.map);
  });
  const freed = new Set<unknown>();
  for (const x of [...geos, ...mats, ...texs]) vi.spyOn(x, 'dispose').mockImplementation(() => { freed.add(x); });
  flatlay.dispose!(s);
  for (const x of [...geos, ...mats, ...texs]) expect(freed.has(x)).toBe(true);
});

test("flatlayClip lines up with the object's video", () => {
  const p = { objects: TWO };
  const [, pola] = parseObjects(p, W, H).objs;
  expect(flatlayClip(p, 1, 1920, 1080, W, H, 5)).toEqual({ at: 1.5, len: 3.5, source: 'b', from: 3, crop: flyCrop(pola.shot!.crop, 1920, 1080, picAspect(pola), 1, W, H) });
  expect(flatlayClip({ objects: JSON.stringify([{ kind: 'card' }]) }, 0, 1920, 1080, W, H, 5)).toBeNull();
  expect(flatlayClip({ objects: JSON.stringify([{ kind: 'card', shot: 'a|2||still' }]) }, 0, 1920, 1080, W, H, 5)).toBeNull();
});

test('a see-through desk renders without depth of field (the blur pass would make it opaque)', async () => {
  const { ctx, s } = await built({ objects: TWO, surface: 'none' });
  const seen = vi.spyOn(ctx.three, 'render');
  flatlay.draw(at(ctx, 3), s);
  expect((seen.mock.calls.at(-1)![4] as any).dof).toBeNull();
});

test("a box's front lies above its body, so the two never fight", async () => {
  const { s } = await built({ objects: JSON.stringify([{ kind: 'tv', shot: 'a|1' }, { kind: 'photo', shot: 'a|1' }]) });
  for (const t of s.items) {
    const tops: Array<[string, number]> = t.sheet.children.filter((m: any) => m.geometry).map((m: any) => { m.geometry.computeBoundingBox(); return [m.geometry.type, m.geometry.boundingBox.max.z]; });
    const body = tops.find(([type]) => type === 'BoxGeometry')![1];
    // the planes on the front side (the panel, the picture), each clear of the body's top
    const front = Math.min(...tops.filter(([type, z]) => type !== 'BoxGeometry' && z > body / 2).map(([, z]) => z));
    expect(front - body).toBeGreaterThan(0.0005);
  }
});

test('without three.js (a failed load) the desk still draws, flat', async () => {
  const { ctx, s } = await built({ objects: TWO }, { kit: undefined });
  expect(() => { flatlay.draw(at(ctx, 3), s); flatlay.late!(ctx, s); }).not.toThrow();
  const log = calls.get((s as any).c) ?? [];
  expect(log).toContain('fillRect');
  expect(log.filter((k) => k === 'drawImage').length).toBeGreaterThanOrEqual(2);
  expect(() => flatlay.dispose!(s)).not.toThrow();
});

test('a fly to an object that is not there is dropped, with a word why', async () => {
  const err = vi.spyOn(console, 'error').mockImplementation(() => {});
  const { ctx, s } = await built({ objects: TWO, fly: { index: 5, at: 1, dur: 1 } });
  expect(err.mock.calls.flat().join(' ')).toMatch(/fly/);
  err.mockRestore();
  const seen = vi.spyOn(ctx.three, 'render');
  flatlay.draw(at(ctx, 3), s);
  expect(seen).toHaveBeenCalled();
});

test('a fly into a picture no main-track clip can take over keeps drawing that picture', async () => {
  for (const shot of ['a|3||still', '']) {
    const { ctx, s } = await built({ objects: JSON.stringify([{ kind: 'polaroid', shot, at: 0 }]), fly: { index: 0, at: 1, dur: 1 } });
    const seen = vi.spyOn(ctx.three, 'render');
    flatlay.draw(at(ctx, 3), s);
    expect(seen, shot || 'stand-in').toHaveBeenCalled();
    expect(s.items[0].overlay.visible).toBe(true);
  }
});

test('only objects at rest report their words (check samples any time: a moving word would read as off the frame)', async () => {
  const p = { objects: JSON.stringify([{ kind: 'postcard', shot: 'a|1', place: 'Roma', year: '2024', at: 0, enter: 'left', dur: 1, flipAt: 3, flipDur: 1 }]) };
  const reports: any[] = [];
  const { ctx, s } = await built(p, { reports });
  flatlay.draw(at(ctx, 0.4), s); expect(reports, 'sliding in').toEqual([]);
  flatlay.draw(at(ctx, 3.5), s); expect(reports, 'turning over').toEqual([]);
  flatlay.draw(at(ctx, 2), s); expect(reports.map((r) => r.text)).toEqual(expect.arrayContaining(['Roma', '2024']));
  const flying: any[] = [];
  const b = await built({ ...p, fly: { index: 0, at: 1.5, dur: 1 } }, { reports: flying });
  flatlay.draw(at(b.ctx, 2), b.s); expect(flying, 'flying in').toEqual([]);
});

test("the back's handwriting wraps instead of dropping characters, and reports only what is written", () => {
  const line = 'one two three four five six seven eight nine ten';   // 48 characters of 20 px: wider than the 780 px the back has
  const { objs } = parseObjects({ objects: JSON.stringify([{ kind: 'postcard', back: `0-2|${line}`, mark: '' }]) }, W, H);
  const done = paintBack(objs[0], 10);
  expect(done.words.length).toBe(2);
  expect(done.words.map((w) => w.text).join(' ')).toBe(line);
  for (const w of done.words) expect(w.rect[0] + w.rect[2]).toBeLessThanOrEqual(0.06 + 0.52 + 1e-9);
  expect(done.words[1].rect[1]).toBeGreaterThan(done.words[0].rect[1]);
  const writing = paintBack(objs[0], 0.2);
  expect(writing.words.length).toBe(1);
  expect(line.startsWith(writing.words[0].text)).toBe(true);
  expect(writing.words[0].text.length).toBeLessThan(12);
});

// a sheet resting on others lies higher than the table, but it is not hovering: its contact shadow is the one of an object at rest
test('a sheet lying on the pile keeps the contact shadow of an object at rest', async () => {
  const objects = JSON.stringify([{ kind: 'photo', x: 0, y: 0, rot: 0, enter: 'none' }, { kind: 'postcard', x: 0.1, y: 0.1, rot: 0, enter: 'none' }]);
  const { ctx, s } = await built({ objects, camera: 'still' });
  flatlay.draw(at(ctx, 3), s);
  for (const t of s.items) expect(t.shadow.scale.x).toBeCloseTo(t.size.w * 1.6, 6);
});

// ---- the final review's minors (2026-11-08)
test("a replaced video keeps the old one's picture on the face until the new one has its own", async () => {
  const kit = dofKit(), freed: unknown[] = [], real = kit.mediaTexture.bind(kit);
  kit.mediaTexture = (el: any) => { const t = real(el); return { ...t, dispose: () => { freed.push(t.texture); t.dispose(); } }; };
  const { ctx, s } = await built({ objects: JSON.stringify([{ kind: 'polaroid', shot: 'a|3', at: 0 }]) }, { kit });
  flatlay.draw(at(ctx, 2), s); flatlay.late!(ctx, s);
  const old = s.items[0].vt!.texture, face = () => (s.items[0].face.material as THREE.MeshPhysicalMaterial).map;
  expect(face()).toBe(old);
  let ready = 0;
  const fresh = document.createElement('video');
  Object.defineProperty(fresh, 'readyState', { get: () => ready }); Object.defineProperty(fresh, 'videoWidth', { get: () => (ready ? 1920 : 0) }); Object.defineProperty(fresh, 'videoHeight', { get: () => (ready ? 1080 : 0) });
  const video = media.video;
  media.video = () => fresh;
  try {
    flatlay.draw(at(ctx, 2.1), s); flatlay.late!(ctx, s);
    expect(face()).toBe(old); expect(freed).not.toContain(old);
    ready = 4;
    flatlay.draw(at(ctx, 2.2), s);
    expect(face()).toBe(s.items[0].vt!.texture); expect(face()).not.toBe(old); expect(freed).toContain(old);
  } finally { media.video = video; }
});

test('the fly: a pull back before the fly is over waits for it, and a broken fly says why', async () => {
  expect(readFly({ index: 0, at: 1, dur: 1.2, back: 1.5 }).fly!.back).toBeCloseTo(2.2, 9);
  expect(readFly('{"index":0,"at":1').error).toMatch(/^fly JSON：/);
  expect(readFly('[1]').error).toMatch(/not an object/);
  expect(readFly('').error).toBeNull(); expect(readFly(null)).toEqual({ fly: null, error: null });
  const err = vi.spyOn(console, 'error').mockImplementation(() => {});
  const { s } = await built({ objects: TWO, fly: '{"index":0,' });
  expect(err.mock.calls.flat().join(' ')).toMatch(/fly JSON/);
  err.mockRestore();
  expect(s.fly).toBeNull(); expect(s.error).toMatch(/fly JSON/);
});

test('an exit with no exitAt leaves just as the item ends; an empty list is the simple object', () => {
  const [o] = parseObjects({ objects: JSON.stringify([{ kind: 'card', exit: 'left', at: 0.5 }]) }, W, H, 5).objs;
  expect(o.exitAt).toBeCloseTo(4.2, 9);
  const [short] = parseObjects({ objects: JSON.stringify([{ kind: 'card', exit: 'left', at: 0.5 }]) }, W, H, 1).objs;
  expect(short.exitAt).toBeCloseTo(0.5 + 0.9, 9);   // not before it has come in
  expect(parseObjects({ objects: JSON.stringify([{ kind: 'card', exit: 'left' }]) }, W, H).objs[0].exitAt).toBe(Infinity);
  for (const objects of ['[]', ' [ ] ']) expect(parseObjects({ kind: 'tv', objects }, W, H)).toEqual({ objs: [expect.objectContaining({ kind: 'tv' })], error: null });
});

test("a postcard that never turns over asks for no stamp picture", () => {
  const media2 = (objects: unknown[]) => flatlay.media!({ id: 'x', type: 'common.flatlay', start: 0, end: 5, params: { objects: JSON.stringify(objects) } } as any, {} as any).stills;
  expect(media2([{ kind: 'postcard', shot: 'a|12' }])).toEqual([]);
  expect(media2([{ kind: 'postcard', shot: 'a|12', flipAt: 9 }])).toEqual([]);
  expect(media2([{ kind: 'postcard', shot: 'a|12', flipAt: 2 }])).toEqual([{ source: 'a', t: 12, w: 1080 }]);
});

test('without WebGL the picture is cropped to the face, not stretched', async () => {
  const kit = makeKit(THREE, {} as any, { makeRenderer: () => null });
  const { ctx, s } = await built({ objects: JSON.stringify([{ kind: 'polaroid', shot: 'a|3', at: 0, enter: 'none' }]) }, { kit });
  flatlay.draw(at(ctx, 2), s); flatlay.late!(ctx, s);
  const pic = s.items[0].vt!.texture.image as HTMLCanvasElement;
  const drawn = (args.get(s.c) ?? []).filter(([k, a]) => k === 'drawImage' && a[0] === pic).at(-1)![1] as number[];
  expect(drawn[3] / drawn[4]).toBeCloseTo(1920 / 1080, 3);
});

test('drawn flat, a sheet resting high on the pile is not drawn bigger', async () => {
  const objects = JSON.stringify([{ kind: 'photo', x: 0, y: 0, enter: 'none' }, { kind: 'postcard', x: 0.1, y: 0.1, enter: 'none' }]);
  const { ctx, s } = await built({ objects }, { kit: undefined });
  flatlay.draw(at(ctx, 2), s);
  expect((args.get(s.c) ?? []).filter(([k]) => k === 'scale').map(([, a]) => a)).toEqual([[1, 1], [1, 1]]);
});

test("while the back is written, its paper and stamp are painted once", async () => {
  const p = { objects: JSON.stringify([{ kind: 'postcard', shot: 'a|1', at: 0, enter: 'none', flipAt: 0, flipDur: 0.3, back: '0.4-3|謝謝你那時候願意出發' }]) };
  const { ctx, s } = await built(p);
  flatlay.draw(at(ctx, 0.6), s);
  const base = s.items[0].backBase, key = s.items[0].backKey;
  flatlay.draw(at(ctx, 0.75), s);
  expect(s.items[0].backKey).not.toBe(key);
  expect(s.items[0].backBase).toBe(base);
});

test('over a see-through desk, flatlayClip runs only while the picture covers the screen', () => {
  const p = { objects: TWO, surface: 'none' as const, fly: { index: 1, at: 2, dur: 1, back: 4, backDur: 1 } };
  expect(flatlayClip(p, 1, 1920, 1080, W, H, 5)).toMatchObject({ at: 3, len: 1, source: 'b', from: 3 + 1.5 });
  expect(flatlayClip({ ...p, fly: { index: 1, at: 2, dur: 1 } }, 1, 1920, 1080, W, H, 5)).toMatchObject({ at: 3, len: 2, from: 4.5 });
  expect(flatlayClip({ ...p, surface: 'linen' }, 1, 1920, 1080, W, H, 5)).toMatchObject({ at: 1.5, len: 3.5, from: 3 });
  expect(flatlayClip({ ...p, fly: null as any }, 1, 1920, 1080, W, H, 5)).toMatchObject({ at: 1.5, len: 3.5 });
});
