// @vitest-environment jsdom
import { Stage, transformAt } from './stage.ts';
import { createRegistry } from './registry.ts';
import { corePlugin } from './core.ts';
import type { ItemType } from './plugin.ts';

function fakeMedia(): any {
  const calls: any[] = [];
  return {
    calls,
    begin() { calls.length = 0; },
    video(ref: any, parent: HTMLElement, local: number) { calls.push({ ref, local }); const v = document.createElement('video'); parent.appendChild(v); return v; },
    place() {}, stillUrl: () => 'x.jpg', sync: async () => {},
    image(source: string, parent: HTMLElement) { const im = document.createElement('img'); im.src = `/img/${source}.jpg`; parent.appendChild(im); return im; },
  };
}
const crop = { from: { x: 0.5, y: 0.5, zoom: 1 }, to: { x: 0.5, y: 0.5, zoom: 1 } };
const project = (): any => ({
  version: 1, meta: { width: 100, height: 50, fps: 30, duration: 10, background: '#000', plugins: [] },
  sources: { s: { path: 'a.mp4', duration: 99, width: 1920, height: 1080 } }, media: {}, grids: [],
  tracks: [
    { id: 'v', kind: 'video', items: [
      { id: 'a', source: 's', in: 1, speed: 2, start: 0, end: 4, frame: [0, 0, 1, 1], crop, interp: 'none' },
      { id: 'b', source: 's', in: 5, speed: 1, start: 3, end: 6, frame: [0, 0, 1, 1], crop, interp: 'none', transitionIn: { type: 'dissolve', dur: 1 } },
    ] },
    { id: 'o', kind: 'overlay', items: [
      { id: 'f', type: 'core.flash', start: 5, end: 6, params: { peak: 1, rise: 0, hold: 0, fall: 1, power: 1, color: '#fff' } },
      { id: 'q', type: 'nope.unknown', start: 0, end: 10, params: {} },
    ] },
  ],
});

test('layers stack by track then array order', () => {
  const root = document.createElement('div');
  const st = new Stage(root, createRegistry([corePlugin]), fakeMedia());
  st.load(project());
  const z = [...root.querySelectorAll<HTMLElement>('.st-item')].map((e) => [e.dataset.id, Number(e.style.zIndex)]);
  expect(z).toEqual([['a', 1], ['b', 2], ['f', 3], ['q', 4]]);
  expect(root.style.width).toBe('100px');
});

test('draw shows only active items and feeds media time', () => {
  const root = document.createElement('div');
  const media = fakeMedia();
  const st = new Stage(root, createRegistry([corePlugin]), media);
  st.load(project());
  st.draw(3.5);
  const shown = [...root.querySelectorAll<HTMLElement>('.st-item')].filter((e) => e.style.display !== 'none').map((e) => e.dataset.id);
  expect(shown).toEqual(['a', 'b', 'q']);
  expect(media.calls.map((c: any) => [c.ref.in, c.local])).toEqual([[1, 3.5], [5, 0.5]]);
  const bFrame = root.querySelector<HTMLElement>('[data-id="b"] .st-frame')!;
  expect(parseFloat(bFrame.style.opacity)).toBeCloseTo(0.5, 3);
});

test('an item whose end is stored a hair late (38/30 → 1.266667) is gone on frame 38, where the next one starts', () => {
  const root = document.createElement('div'), p = project();
  p.tracks[1].items = [
    { id: 'x', type: 'core.flash', start: 0, end: 1.266667, params: { peak: 1, rise: 0, hold: 1, fall: 0, power: 1, color: '#fff' } },
    { id: 'y', type: 'core.flash', start: 1.266667, end: 3, params: { peak: 1, rise: 0, hold: 1, fall: 0, power: 1, color: '#f00' } },
  ];
  const st = new Stage(root, createRegistry([corePlugin]), fakeMedia());
  st.load(p);
  st.draw(38 / 30);
  // x used to show for that one frame too: over y, a one-frame flash of the shot before
  expect(['x', 'y'].map((id) => root.querySelector<HTMLElement>(`.st-item[data-id="${id}"]`)!.style.display !== 'none')).toEqual([false, true]);
});

test('transform video scaling wraps the video in a will-change layer scaled around the focus point', () => {
  const root = document.createElement('div');
  const placed: any[] = [];
  const media = { ...fakeMedia(), place: (_v: any, w: number, h: number, crop: any) => placed.push([w, h, crop.zoom]) };
  const p = project();
  p.meta.width = 1920; p.meta.height = 1080;
  p.tracks[0].items[0].crop = { from: { x: 0.6, y: 0.5, zoom: 1.1 }, to: { x: 0.6, y: 0.5, zoom: 1.1 } };
  const st = new Stage(root, createRegistry([corePlugin]), media);
  st.load(p);
  st.draw(1);
  const kb = root.querySelector<HTMLElement>('[data-id="a"] .st-frame > .st-kb')!;
  expect(kb.style.willChange).toBe('transform');
  expect(kb.style.transform).toBe('scale(1.1000)');
  expect(kb.style.transformOrigin).toBe('1152px 540px');
  expect(kb.querySelector('video')).not.toBeNull();
  expect(placed[0]).toEqual([1920, 1080, 1]);
});

test('layout video scaling sizes the video directly', () => {
  const root = document.createElement('div');
  const placed: any[] = [];
  const media = { ...fakeMedia(), place: (_v: any, w: number, h: number, crop: any) => placed.push(crop.zoom) };
  const p = project();
  p.meta.videoScale = 'layout';
  p.tracks[0].items[0].crop = { from: { x: 0.5, y: 0.5, zoom: 1.2 }, to: { x: 0.5, y: 0.5, zoom: 1.2 } };
  const st = new Stage(root, createRegistry([corePlugin]), media);
  st.load(p);
  st.draw(1);
  expect(root.querySelector('.st-kb')).toBeNull();
  expect(placed[0]).toBe(1.2);
});

test('only the CSS of the project\'s own plugins is injected', () => {
  const root = document.createElement('div');
  const reg = createRegistry([corePlugin, { id: 'kyoto', css: '.title{color:red}' }, { id: 'wedding', css: '.title{background:#000}' }]);
  const p = project();
  p.meta.plugins = ['kyoto'];
  new Stage(root, reg, fakeMedia()).load(p);
  const css = document.getElementById('tellcut-plugin-css')!.textContent!;
  expect(css).toContain('.title{color:red}');
  expect(css).not.toContain('background:#000');
});

test('ctx.top floats above every item and follows its item\'s visibility', () => {
  const root = document.createElement('div');
  const plugin = { id: 'p', items: [{ type: 'p.touch', label: 't', kind: 'overlay' as const, params: [],
    build: (ctx: any) => { const d = document.createElement('i'); ctx.top.appendChild(d); return d; }, draw: () => {} }] };
  const p = project();
  p.tracks.unshift({ id: 's', kind: 'scene', items: [{ id: 'low', type: 'p.touch', start: 0, end: 2, params: {} }] });
  const st = new Stage(root, createRegistry([corePlugin, plugin]), fakeMedia());
  st.load(p);
  const top = root.querySelector<HTMLElement>('.st-top')!;
  const maxItemZ = Math.max(...[...root.querySelectorAll<HTMLElement>('.st-item')].map((e) => Number(e.style.zIndex)));
  expect(Number(top.style.zIndex)).toBeGreaterThan(maxItemZ);
  const slot = top.querySelector<HTMLElement>('[data-id="low"]')!;
  expect(slot.querySelector('i')).not.toBeNull();
  st.draw(1); expect(slot.style.display).toBe('');
  st.draw(3); expect(slot.style.display).toBe('none');
});

test('an item type with a blend mode blends its whole layer with the items below', () => {
  const root = document.createElement('div');
  const plugin = { id: 'p', items: [{ type: 'p.glow', label: 'g', kind: 'overlay' as const, params: [], blend: 'screen', build: () => null, draw: () => {} }] };
  const p = project();
  p.tracks.push({ id: 'g', kind: 'overlay', items: [{ id: 'glow', type: 'p.glow', start: 0, end: 2, params: {} }] });
  new Stage(root, createRegistry([corePlugin, plugin]), fakeMedia()).load(p);
  expect(root.querySelector<HTMLElement>('.st-item[data-id="glow"]')!.style.mixBlendMode).toBe('screen');
});

test('missing params fall back to the type defaults', () => {
  const root = document.createElement('div');
  const p = project();
  p.tracks[1].items[0].params = {};
  const st = new Stage(root, createRegistry([corePlugin]), fakeMedia());
  st.load(p);
  st.draw(5.15);
  const el = root.querySelector<HTMLElement>('.st-item[data-id="f"]')!.firstChild as HTMLElement;
  expect(parseFloat(el.style.opacity)).toBeCloseTo(0.85 * 0.5, 3);
});

const boom = (where: string) => ({ id: 'b', items: [{ type: 'b.boom', label: 'b', kind: 'overlay' as const, params: [],
  build: () => { if (where === 'build') throw new Error('kaput'); return null; }, draw: () => { if (where === 'draw') throw new Error('kaput'); } }] });
const withBoom = () => { const p = project(); p.tracks.push({ id: 'x', kind: 'overlay', items: [{ id: 'bad', type: 'b.boom', start: 0, end: 10, params: {} }] }); return p; };

test('an item that throws is replaced by a placeholder and the rest still renders', () => {
  for (const where of ['build', 'draw']) {
    const root = document.createElement('div');
    const st = new Stage(root, createRegistry([corePlugin, boom(where)]), fakeMedia());
    st.load(withBoom());
    st.draw(5.15);
    expect(root.querySelector('.st-item[data-id="bad"] .st-missing')).not.toBeNull();
    expect(root.querySelector<HTMLElement>('.st-item[data-id="f"]')!.style.display).toBe('');
  }
});

test('strict mode (render) fails with the item id', () => {
  const root = document.createElement('div');
  const st = new Stage(root, createRegistry([corePlugin, boom('draw')]), fakeMedia(), { strict: true });
  st.load(withBoom());
  expect(() => st.draw(1)).toThrow('Item "bad" (b.boom): kaput');
});

test('unknown item types render a placeholder instead of throwing', () => {
  const root = document.createElement('div');
  const st = new Stage(root, createRegistry([corePlugin]), fakeMedia());
  st.load(project());
  expect(root.querySelector('[data-id="q"] .st-missing')).not.toBeNull();
});

const refPlugin = { id: 't', items: [{ type: 't.v', label: 'v', kind: 'overlay' as const, params: [], build: () => null, draw: () => {},
  media: (it: any) => ({ videos: [{ source: it.params.src, in: 0, out: 1, speed: 1, interp: 'none' as const }], stills: [] }) }] };

test('a plugin item whose params name an unknown source becomes a placeholder naming the item', () => {
  const reg = createRegistry([corePlugin, refPlugin]);
  const p = project();
  p.tracks[1].items = [{ id: 'bad', type: 't.v', start: 0, end: 1, params: { src: 'typo' } }];
  const root = document.createElement('div');
  const err = vi.spyOn(console, 'error').mockImplementation(() => {});
  new Stage(root, reg, fakeMedia()).load(p);
  expect(err.mock.calls[0][0]).toBe('Item "bad" (t.v): unknown source "typo"');
  expect(root.querySelector('.st-item[data-id="bad"] .st-missing')).not.toBeNull();
  err.mockRestore();
  expect(() => new Stage(document.createElement('div'), reg, fakeMedia(), { strict: true }).load(p)).toThrow('Item "bad" (t.v): unknown source "typo"');
});

test('styles of a plugin used by an item but missing from meta.plugins are still loaded, with a warning', () => {
  const reg = createRegistry([corePlugin, { id: 'x', css: '.x-box{color:red}', items: [{ type: 'x.box', label: 'b', kind: 'overlay', params: [], build: () => null, draw: () => {} }] }]);
  const p = project();
  p.tracks[1].items = [{ id: 'b', type: 'x.box', start: 0, end: 1, params: {} }];
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  new Stage(document.createElement('div'), reg, fakeMedia()).load(p);
  expect(document.getElementById('tellcut-plugin-css')!.textContent).toContain('.x-box{color:red}');
  expect(warn).toHaveBeenCalledWith('meta.plugins does not list "x" (used by items); loading its styles anyway');
  warn.mockRestore();
});

const edit = (p: any, track: string, fn: (items: any[]) => any[]) => ({ ...p, tracks: p.tracks.map((t: any) => (t.id === track ? { ...t, items: fn(t.items) } : t)) });

test('update keeps unchanged layers and rebuilds changed ones (compared by content)', () => {
  const root = document.createElement('div');
  const st = new Stage(root, createRegistry([corePlugin]), fakeMedia());
  const p = project();
  st.load(p);
  const elA = root.querySelector('.st-item[data-id="a"]'), elF = root.querySelector('.st-item[data-id="f"]');
  st.update(structuredClone(edit(p, 'o', (items) => items.map((i) => (i.id === 'f' ? { ...i, start: 4 } : i)))));
  expect(root.querySelector('.st-item[data-id="a"]')).toBe(elA);
  expect(root.querySelector('.st-item[data-id="f"]')).not.toBe(elF);
  expect(root.querySelectorAll('.st-item').length).toBe(4);
  expect(st.times.get('f')!.start).toBe(4);
});

test('update removes deleted items and reloads fully when meta changes', () => {
  const root = document.createElement('div');
  const st = new Stage(root, createRegistry([corePlugin]), fakeMedia());
  const p = project();
  st.load(p);
  const q = edit(p, 'v', (items) => [items[0]]);
  st.update(q);
  expect([...root.querySelectorAll('.st-item')].map((e) => (e as HTMLElement).dataset.id)).toEqual(['a', 'f', 'q']);
  expect([...root.querySelectorAll<HTMLElement>('.st-item')].map((e) => e.style.zIndex)).toEqual(['1', '2', '3']);
  const elA = root.querySelector('.st-item[data-id="a"]');
  st.update({ ...q, meta: { ...q.meta, width: 200 } });
  expect(root.style.width).toBe('200px');
  expect(root.querySelector('.st-item[data-id="a"]')).not.toBe(elA);
});

test('a new length, name or sound setting keeps every layer (a magnetic edit changes meta.duration on every drag frame)', () => {
  const root = document.createElement('div');
  const st = new Stage(root, createRegistry([corePlugin]), fakeMedia());
  const p = project();
  st.load(p);
  const elA = root.querySelector('.st-item[data-id="a"]');
  st.update({ ...p, meta: { ...p.meta, duration: p.meta.duration + 3, name: 'renamed', loudness: -16, mix: { ...p.meta.mix, master: 0.5 } } });
  expect(root.querySelector('.st-item[data-id="a"]')).toBe(elA);
});

test('new export settings or home preset info keep every layer (neither changes what a layer looks like)', () => {
  const root = document.createElement('div');
  const st = new Stage(root, createRegistry([corePlugin]), fakeMedia());
  const p = project();
  st.load(p);
  const elA = root.querySelector('.st-item[data-id="a"]');
  st.update({ ...p, meta: { ...p.meta, cut: { crf: 23, preset: 'slow' }, preset: { id: 'travel', styles: ['film'] } } });
  expect(root.querySelector('.st-item[data-id="a"]')).toBe(elA);
});

test('item failures are reported through onError', () => {
  const errs: Array<[string, string]> = [];
  const p = project();
  p.tracks[1].items = [{ id: 'bad', type: 't.v', start: 0, end: 1, params: { src: 'typo' } }];
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
  new Stage(document.createElement('div'), createRegistry([corePlugin, refPlugin]), fakeMedia(), { onError: (id, m) => errs.push([id, m]) }).load(p);
  spy.mockRestore();
  expect(errs).toEqual([['bad', 'Item "bad" (t.v): unknown source "typo"']]);
});

test('an item transform moves and scales its whole layer; changing only the transform keeps the layer', () => {
  const root = document.createElement('div');
  const st = new Stage(root, createRegistry([corePlugin]), fakeMedia());
  const p = project();
  p.tracks[1].items[0].transform = { x: 0.1, y: -0.2, scale: 1.5, ox: 0.5, oy: 0.25 };
  st.load(p);
  const el = root.querySelector<HTMLElement>('.st-item[data-id="f"]')!;
  expect([el.style.transform, el.style.transformOrigin]).toEqual(['translate(10px, -10px) scale(1.5)', '50% 25%']);
  expect(root.querySelector<HTMLElement>('.st-top [data-id="f"]')!.style.transform).toBe('translate(10px, -10px) scale(1.5)');
  const q = project();
  q.tracks[1].items[0].transform = { x: 0, y: 0.5, scale: 2, ox: 0.5, oy: 0.5 };
  st.update(q);
  expect(root.querySelector('.st-item[data-id="f"]')).toBe(el);   // not rebuilt
  expect(el.style.transform).toBe('translate(0px, 25px) scale(2)');
  st.update(project());
  expect(el.style.transform).toBe('');
});
test('a photo on a video track is an <img> with the same Ken Burns framing, never a video', () => {
  const root = document.createElement('div'), media = fakeMedia(), placed: any[] = [];
  media.place = (el: HTMLElement) => placed.push(el.tagName);
  const p = project();
  p.sources.ph = { path: 'p.jpg', duration: 3600, width: 900, height: 1200, kind: 'image' };
  p.tracks[0].items.push({ id: 'pic', source: 'ph', in: 0, speed: 1, start: 6, end: 9, frame: [0, 0, 1, 1], crop: { from: { x: 0.5, y: 0.5, zoom: 1 }, to: { x: 0.5, y: 0.5, zoom: 1.1 } }, interp: 'none' });
  const st = new Stage(root, createRegistry([corePlugin]), media);
  st.load(p);
  st.draw(7);
  expect(root.querySelector('[data-id="pic"] img')!.getAttribute('src')).toBe('/img/ph.jpg');
  expect(media.calls.filter((c: any) => c.ref.source === 'ph')).toEqual([]);
  expect(placed).toContain('IMG');
  expect(st.mediaRefs().map((r) => r.source)).toEqual(['s', 's']);
});

test('a clip draws its corner radius and shakes its picture inside the frame', () => {
  const root = document.createElement('div');
  const p = project();
  Object.assign(p.tracks[0].items[0], { radius: 12, shake: [{ at: 0, dur: 2, px: 8 }] });
  const st = new Stage(root, createRegistry([corePlugin]), fakeMedia());
  st.load(p);
  st.draw(0.5);
  const frame = root.querySelector<HTMLElement>('[data-id="a"] .st-frame')!;
  expect(frame.style.borderRadius).toBe('12px');
  expect(frame.style.transform).toBe('none');                       // the frame stays; the picture moves
  const kb = root.querySelector<HTMLElement>('[data-id="a"] .st-kb')!;
  // shaking: one matrix (zoom around the focus, then grown around the frame centre and moved) from the top-left corner
  expect(kb.style.transform).toMatch(/^matrix\([\d.]+, 0, 0, [\d.]+, -?[\d.]+, -?[\d.]+\)$/);
  expect(kb.style.transformOrigin).toMatch(/^0(px)? 0(px)?/);
  st.draw(2.5);                                                       // shake over: the plain zoom around the focus again
  expect(kb.style.transform).toMatch(/^scale\([\d.]+\)$/);
  st.draw(3);
  expect(root.querySelector<HTMLElement>('[data-id="b"] .st-frame')!.style.borderRadius).toBe('');
});

test('every registered SVG filter is injected once, so a grade works whichever plugins the project lists', () => {
  const reg = createRegistry([corePlugin, { id: 'red', svg: '<filter id="red-dawn"><feColorMatrix type="saturate" values="0.6"/></filter>', grades: { dawn: 'url(#red-dawn)' } }]);
  const p = project(); p.meta.plugins = [];                          // the grade picked from the dropdown, the plugin not listed
  p.tracks[0].items[0].grade = 'dawn';
  const st = new Stage(document.createElement('div'), reg, fakeMedia());
  st.load(p); st.load(p); st.update(structuredClone(p));
  expect(document.querySelectorAll('#tellcut-svg-defs').length).toBe(1);
  expect(document.querySelectorAll('#tellcut-svg-defs filter#red-dawn').length).toBe(1);
});

test('a plugin item is told once when it stops showing, and draws again when it comes back', () => {
  const calls: string[] = [];
  const reg = createRegistry([corePlugin, { id: 'h', items: [{ type: 'h.x', label: 'x', kind: 'overlay', params: [],
    build: () => ({}), draw: (ctx: any) => calls.push(`draw ${ctx.local}`), hide: () => calls.push('hide') }] } as any]);
  const p = project();
  p.tracks[1].items = [{ id: 'hx', type: 'h.x', start: 0, end: 1, params: {} }];
  const st = new Stage(document.createElement('div'), reg, fakeMedia());
  st.load(p);
  st.draw(0.5); st.draw(5); st.draw(6); st.draw(0.25);
  expect(calls).toEqual(['draw 0.5', 'hide', 'draw 0.25']);
});

test('stage.ready waits for every plugin item to load its assets; a failed load is reported, not thrown (preview)', async () => {
  let open!: () => void;
  const gate = new Promise<void>((r) => (open = r));
  const errors: string[] = [];
  const reg = createRegistry([corePlugin, { id: 'r', items: [
    { type: 'r.slow', label: 's', kind: 'overlay', params: [], build: () => ({ p: gate }), draw() {}, ready: (s: any) => s.p },
    { type: 'r.bad', label: 'b', kind: 'overlay', params: [], build: () => ({}), draw() {}, ready: () => Promise.reject(new Error('no art')) },
  ] } as any]);
  const p = project();
  p.tracks[1].items = [{ id: 's1', type: 'r.slow', start: 0, end: 1, params: {} }, { id: 'b1', type: 'r.bad', start: 0, end: 1, params: {} }];
  const st = new Stage(document.createElement('div'), reg, fakeMedia(), { onError: (id, m) => errors.push(`${id}: ${m}`) });
  st.load(p);
  let done = false;
  const r = st.ready().then(() => (done = true));
  await new Promise((res) => setTimeout(res, 20));
  expect(done).toBe(false);
  open();
  await r;
  expect(done).toBe(true);
  expect(errors).toEqual(['b1: no art']);
});

test('in strict (export) mode a plugin item whose assets fail to load fails stage.ready', async () => {
  const reg = createRegistry([corePlugin, { id: 'r', items: [
    { type: 'r.bad', label: 'b', kind: 'overlay', params: [], build: () => ({}), draw() {}, ready: () => Promise.reject(new Error('no art')) },
  ] } as any]);
  const p = project();
  p.tracks[1].items = [{ id: 'b1', type: 'r.bad', start: 0, end: 1, params: {} }];
  const st = new Stage(document.createElement('div'), reg, fakeMedia(), { strict: true });
  st.load(p);
  await expect(st.ready()).rejects.toThrow(/b1.*no art/);
});

test('an item kept through an edit is not made ready again; a rebuilt one is, and a failed load is tried again', async () => {
  // preview patches call ready() on every edit: wall/globe/logo built their three.js scene again each time and leaked the old one
  const calls: string[] = [];
  let fail = true;
  const reg = createRegistry([corePlugin, { id: 'r', items: [
    { type: 'r.art', label: 'a', kind: 'overlay', params: [{ key: 'n', label: 'n', type: 'number', default: 0 }], build: (c: any) => ({ id: c.item.id }), draw() {},
      ready: async (s: any) => { calls.push(s.id); if (s.id === 'x' && fail) throw new Error('not yet'); } },
  ] } as any]);
  const p = project();
  p.tracks[1].items = [{ id: 'k', type: 'r.art', start: 0, end: 1, params: { n: 1 } }, { id: 'e', type: 'r.art', start: 0, end: 1, params: { n: 1 } }, { id: 'x', type: 'r.art', start: 0, end: 1, params: {} }];
  const st = new Stage(document.createElement('div'), reg, fakeMedia(), { onError: () => {} });
  st.load(p);
  await st.ready();
  expect(calls.sort()).toEqual(['e', 'k', 'x']);
  calls.length = 0;
  fail = false;
  const q = structuredClone(p);
  q.tracks[1].items[1].params.n = 2;
  st.update(q);
  await st.ready();
  expect(calls.sort()).toEqual(['e', 'x']);
});

test('a preview stage tilts a zooming video by 0.02° so the browser draws it at sub-pixel positions instead of snapping it', () => {
  // a layer that is only scaled gets snapped to whole pixels: a slow zoom then jumps back and forth (seen at 150% display scaling)
  const kbOf = (zoom: number, subpixelZoom?: boolean) => {
    const root = document.createElement('div'), p = project();
    p.tracks[0].items[0].crop = { from: { x: 0.5, y: 0.5, zoom }, to: { x: 0.5, y: 0.5, zoom } };
    const st = new Stage(root, createRegistry([corePlugin]), fakeMedia(), { subpixelZoom });
    st.load(p); st.draw(1);
    return root.querySelector<HTMLElement>('[data-id="a"] .st-kb')!.style.transform;
  };
  expect(kbOf(1.1, true)).toBe('scale(1.1000) rotate(0.02deg)');
  expect(kbOf(1, true)).toBe('scale(1.0000)');
  expect(kbOf(1.1)).toBe('scale(1.1000)');            // an export draws exactly
});

test('a transform with keys moves the layer along them as it plays (linear, held before and after)', () => {
  const root = document.createElement('div');
  const st = new Stage(root, createRegistry([corePlugin]), fakeMedia());
  const p = project();
  p.tracks[1].items[0].transform = { x: 0, y: 0, scale: 1, ox: 0.5, oy: 0.5, keys: [{ t: 0, x: 0, y: 0, scale: 1 }, { t: 0.2, x: 0.2, y: 0.4, scale: 2 }] };
  st.load(p);
  const s = st.times.get('f')!.start, el = root.querySelector<HTMLElement>('.st-item[data-id="f"]')!;
  st.draw(s + 0.1);
  expect(el.style.transform).toBe('translate(10px, 10px) scale(1.5)');
  expect(root.querySelector<HTMLElement>('.st-top [data-id="f"]')!.style.transform).toBe('translate(10px, 10px) scale(1.5)');
  st.draw(s + 0.25);
  expect(el.style.transform).toBe('translate(20px, 20px) scale(2)');
});

test('transformAt: no keys is the transform itself', () => {
  const t = { x: 0.1, y: 0.2, scale: 1, ox: 0.5, oy: 0.5 };
  expect(transformAt(t, 5)).toBe(t);
});

test('transformAt: keys given out of order (a cut.ts, a proposal) move the layer as if sorted, not in jumps', () => {
  const k = (t: number, x: number) => ({ t, x, y: 0, scale: 1 });
  const t = { x: 0, y: 0, scale: 1, ox: 0.5, oy: 0.5, keys: [k(2, 1), k(0, 0), k(1, 0.5)] };
  expect([0.5, 1.5, 3].map((s) => transformAt(t, s).x)).toEqual([0.25, 0.75, 1]);
});

test('ctx.types finds other registered item types (a block hosting another, like common.card)', () => {
  let seen: unknown;
  const host = { id: 'h', items: [{ type: 'h.host', label: 'h', kind: 'overlay' as const, params: [], build: () => null, draw: (ctx: any) => { seen = [ctx.types('core.flash')?.type, ctx.types('nope.x')]; } }] };
  const p = project(); p.tracks.push({ id: 'x', kind: 'overlay', items: [{ id: 'hh', type: 'h.host', start: 0, end: 10, params: {} }] });
  const st = new Stage(document.createElement('div'), createRegistry([corePlugin, host]), fakeMedia());
  st.load(p);
  st.draw(1);
  expect(seen).toEqual(['core.flash', undefined]);
});

test('past freezeAt the clip is drawn as held (the preview keeps it paused on that frame)', () => {
  const root = document.createElement('div');
  const media = fakeMedia();
  const held: boolean[] = [];
  media.video = (ref: any, parent: HTMLElement, local: number, h?: boolean) => { held.push(!!h); const v = document.createElement('video'); parent.appendChild(v); return v; };
  const p = project();
  p.tracks[0].items = [{ ...p.tracks[0].items[0], freezeAt: 1 }];
  const st = new Stage(root, createRegistry([corePlugin]), media);
  st.load(p);
  st.draw(0.5); st.draw(2);
  expect(held).toEqual([false, true]);
});

test('a kept layer moves along its new keys after an update (dragging a moving layer moves its whole path)', () => {
  const root = document.createElement('div');
  const st = new Stage(root, createRegistry([corePlugin]), fakeMedia());
  const keyed = (dx: number) => { const p = project(); p.tracks[1].items[0].transform = { x: dx, y: 0, scale: 1, ox: 0.5, oy: 0.5, keys: [{ t: 0, x: dx, y: 0, scale: 1 }, { t: 1, x: dx, y: 0, scale: 1 }] }; return p; };
  st.load(keyed(0));
  const s = st.times.get('f')!.start, el = root.querySelector<HTMLElement>('.st-item[data-id="f"]')!;
  st.update(keyed(0.5));
  expect(root.querySelector('.st-item[data-id="f"]')).toBe(el);   // not rebuilt
  st.draw(s + 0.5);
  expect(el.style.transform).toBe('translate(50px, 0px) scale(1)');
  st.update(project());                                             // the keys removed: it stays where it is put
  st.draw(s + 0.5);
  expect(el.style.transform).toBe('');
});

test('an item that fails while drawing lets go of its state first (its GPU things), and destroy() lets every item go once', () => {
  const freed: string[] = [];
  const kept = (type: string, fails: boolean): ItemType => ({ type, label: type, kind: 'overlay', params: [], build: () => type,
    draw: () => { if (fails) throw new Error('kaput'); }, dispose: (s: any) => freed.push(s) });
  const root = document.createElement('div');
  const st = new Stage(root, createRegistry([corePlugin, { id: 'k', items: [kept('k.bad', true), kept('k.ok', false)] } as any]), fakeMedia());
  const p = project();
  p.tracks.push({ id: 'k', kind: 'overlay', items: [{ id: 'bad', type: 'k.bad', start: 0, end: 10, params: {} }, { id: 'ok', type: 'k.ok', start: 0, end: 10, params: {} }] });
  st.load(p);
  st.draw(1);
  expect(freed).toEqual(['k.bad']);
  st.destroy();
  st.destroy();
  expect(freed).toEqual(['k.bad', 'k.ok']);
});
