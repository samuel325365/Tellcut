// @vitest-environment jsdom
// common.flatlay (spec 2026-11-07-desk3d): the block's hooks run on a hand-made item context with the real three.js scene and a
// ThreeKit whose renderer is a stand-in (jsdom has no WebGL and no canvas: a stand-in 2D context takes any call and counts them).
import * as THREE from 'three';
import { resolveTheme } from '@tellcut/engine';
import { flatlay, flatlayClip } from './flatlay.ts';
import { flyCrop } from './flatlay/camera.ts';
import { picAspect, parseObjects } from './flatlay/objects.ts';
import { makeKit } from './three/kit.ts';

const calls = new WeakMap<HTMLCanvasElement, string[]>();
const anything: any = new Proxy(function () {}, {
  get: (_t, k) => (k === Symbol.toPrimitive ? () => 0 : k === 'then' ? undefined : anything),
  apply: () => anything, construct: () => anything, set: () => true,
});
const realGetContext = HTMLCanvasElement.prototype.getContext;
beforeAll(() => {
  (HTMLCanvasElement.prototype as any).getContext = function (this: HTMLCanvasElement) {
    const log = calls.get(this) ?? []; calls.set(this, log);
    return new Proxy(anything, { get: (t, k) => {
      if (k === 'canvas') return this;
      if (k === 'measureText') return (s: string) => ({ width: String(s).length * 20 });
      if (typeof k === 'string' && ['fillRect', 'drawImage', 'clearRect', 'fillText'].includes(k)) return (...a: unknown[]) => { log.push(k); void a; };
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
    media, W: w, H: h, fps: 30, theme: resolveTheme({}, { width: w, height: h }), grades: {}, three: o.kit ?? dofKit(), motion: undefined,
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

test('missing source', async () => {
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
