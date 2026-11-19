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
  expect(z).toEqual([['a', 2], ['b', 4], ['f', 6], ['q', 8]]);   // steps of two: room for a clip lifted over the one before it
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
  // the fade is the clip's whole layer's (its frame, outline and shadow fade as one picture), not the frame's
  const bLayer = root.querySelector<HTMLElement>('.st-item[data-id="b"]')!;
  expect(parseFloat(bLayer.style.opacity)).toBeCloseTo(0.5, 3);
  expect(bLayer.querySelector<HTMLElement>('.st-frame')!.style.opacity).toBe('');
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

test('several blend modes: a layer each right after the item\'s, handed to it as ctx.layers and dropped when it fails', () => {
  const root = document.createElement('div'), seen: HTMLElement[][] = [];
  let boom = false;
  const two = { type: 'p.two', label: 't', kind: 'overlay' as const, params: [], blend: ['color', 'multiply'],
    build: (ctx: any) => { seen.push(ctx.layers); return null; }, draw: (ctx: any) => { seen.push(ctx.layers); if (boom) throw new Error('x'); } };
  const p = project();
  p.tracks.push({ id: 'g', kind: 'overlay', items: [{ id: 'two', type: 'p.two', start: 0, end: 2, params: {} }] });
  const st = new Stage(root, createRegistry([corePlugin, { id: 'p', items: [two] }]), fakeMedia());
  st.load(p);
  const own = root.querySelector<HTMLElement>('.st-item[data-id="two"]')!, more = root.querySelector<HTMLElement>('.st-more[data-id="two"]')!;
  expect([own.style.mixBlendMode, more.style.mixBlendMode, own.nextElementSibling === more, more.style.zIndex === own.style.zIndex]).toEqual(['color', 'multiply', true, true]);
  st.draw(1);
  expect(seen.every((l) => l.length === 1 && l[0] === more)).toBe(true);
  expect(more.style.display).toBe('');
  boom = true;
  st.draw(1.5);
  expect(more.isConnected).toBe(false);
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
  expect([...root.querySelectorAll<HTMLElement>('.st-item')].map((e) => e.style.zIndex)).toEqual(['2', '4', '6']);
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
  const errs: unknown[] = [];
  const p = project();
  p.tracks[1].items = [{ id: 'bad', type: 't.v', start: 0, end: 1, params: { src: 'typo' } }];
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
  new Stage(document.createElement('div'), createRegistry([corePlugin, refPlugin]), fakeMedia(), { onError: (id, m, c) => errs.push([id, m, c]) }).load(p);
  spy.mockRestore();
  // with a code the editor words in its language (the block's own error stays as it was thrown)
  expect(errs).toEqual([['bad', 'Item "bad" (t.v): unknown source "typo"', { code: 'player.itemFailed', params: { type: 't.v', error: 'unknown source "typo"' } }]]);
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
  const st = new Stage(document.createElement('div'), reg, fakeMedia(), { onError: (id, m, c) => errors.push(`${id}: ${m} ${JSON.stringify(c)}`) });
  st.load(p);
  let done = false;
  const r = st.ready().then(() => (done = true));
  await new Promise((res) => setTimeout(res, 20));
  expect(done).toBe(false);
  open();
  await r;
  expect(done).toBe(true);
  expect(errors).toEqual(['b1: no art {"code":"player.itemNotReady","params":{"type":"r.bad","error":"no art"}}']);
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
  // preview patches call ready() on every edit: the three.js blocks built their scene again each time and leaked the old one
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

test('ctx.motion reaches build and draw (fx get their springs from it)', () => {
  const seen: number[] = [];
  const fx = { id: 'm', items: [{ type: 'm.bob', label: 'm', kind: 'overlay' as const, params: [],
    build: (ctx: any) => { seen.push(ctx.motion.spring({ duration: 0.5 })(0)); return null; },
    draw: (ctx: any) => { seen.push(ctx.motion.spring({ duration: 0.5 })(ctx.local)); } }] };
  const p = project(); p.tracks.push({ id: 'x', kind: 'overlay', items: [{ id: 'mm', type: 'm.bob', start: 0, end: 10, params: {} }] });
  const st = new Stage(document.createElement('div'), createRegistry([corePlugin, fx]), fakeMedia());
  st.load(p);
  st.draw(5);
  expect(seen).toEqual([0, 1]);
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

test('a linked push moves both frames and a wipe clips the incoming one; the outgoing clip learns of a new transition without a rebuild', () => {
  const root = document.createElement('div');
  const st = new Stage(root, createRegistry([corePlugin]), fakeMedia());
  const p = project();                                   // a 0–4, b 3–6: a 1 s overlap
  p.tracks[0].items[1].transitionIn = { type: 'push', dur: 1, dir: 'l' };
  st.load(p);
  const frame = (id: string) => root.querySelector<HTMLElement>(`[data-id="${id}"] .st-frame`)!;
  st.draw(3.5);
  expect([frame('a').style.transform, frame('b').style.transform, frame('b').parentElement!.style.opacity]).toEqual(['translate(50px, 0px)', 'translate(-50px, 0px)', '1']);
  const a = frame('a');
  const q = structuredClone(p);
  q.tracks[0].items[1].transitionIn = { type: 'wipe', dur: 1, dir: 'l' };
  st.update(q);
  expect(frame('a')).toBe(a);                            // A kept its layer
  st.draw(3.5);
  expect([frame('a').style.transform, frame('a').style.clipPath, frame('b').style.transform, frame('b').style.clipPath]).toEqual(['none', '', 'none', 'inset(0 50% 0 0)']);
  st.draw(4.5);
  expect(frame('b').style.clipPath).toBe('');
});

test('a zoom scales both frames round their centres; a scale of 1 leaves the transform as it was, a push still composes with it', () => {
  const root = document.createElement('div');
  const st = new Stage(root, createRegistry([corePlugin]), fakeMedia());
  const p = project();                                   // a 0–4, b 3–6: a 1 s overlap
  p.tracks[0].items[1].transitionIn = { type: 'zoom', dur: 1 };
  st.load(p);
  const frame = (id: string) => root.querySelector<HTMLElement>(`[data-id="${id}"] .st-frame`)!;
  st.draw(3.5);
  expect([frame('a').style.transform, frame('b').style.transform, frame('a').style.transformOrigin]).toEqual(['scale(1.6094)', 'scale(1.2000)', '']);
  st.draw(4.5);
  expect(frame('b').style.transform).toBe('none');
  st.draw(2);
  expect(frame('a').style.transform).toBe('none');
  // a clip still sliding in while the clip after it zooms through it: the move first, then the scale
  const q = project();
  q.tracks[0].items = [
    { ...q.tracks[0].items[0], end: 5 },
    { ...q.tracks[0].items[1], start: 3, end: 8, transitionIn: { type: 'slide', dur: 2, dir: 'l' } },
    { ...q.tracks[0].items[1], id: 'c', start: 4, end: 10, transitionIn: { type: 'zoom', dur: 4 } },
  ];
  st.load(q);
  st.draw(4.5);
  expect(frame('b').style.transform).toMatch(/^translate\(-[\d.]+px, 0px\) scale\(1\.1155\)$/);
});

test('a blur draws with the layer\'s own SVG filter, made once and reused, after the grade; gone from the filter once over', () => {
  const reg = createRegistry([corePlugin, { id: 'red', svg: '<filter id="red-dawn"><feColorMatrix type="saturate" values="0.6"/></filter>', grades: { dawn: 'url(#red-dawn)' } }]);
  const root = document.createElement('div');
  const st = new Stage(root, reg, fakeMedia());
  const p = project();
  Object.assign(p.tracks[0].items[1], { grade: 'dawn', transitionIn: { type: 'whip', dur: 1, dir: 'r' } });
  st.load(p);
  const frame = (id: string) => root.querySelector<HTMLElement>(`[data-id="${id}"] .st-frame`)!;
  const filters = (id: string) => [...root.querySelectorAll(`[data-id="${id}"] filter`)];
  expect(filters('b')).toEqual([]);                      // nothing made before it is needed
  st.draw(3.5);
  const [f] = filters('b'), id = f.getAttribute('id')!;
  expect(frame('b').style.filter).toBe(`url(#red-dawn) url(#${id})`);
  expect(f.querySelector('feGaussianBlur')!.getAttribute('stdDeviation')).toBe('6 0');   // along x only: 6% of the 100 px frame
  expect(frame('a').style.filter).toMatch(/^url\(#tc-streak-\d+\)$/);                     // A has its own
  expect(filters('a')[0].getAttribute('id')).not.toBe(id);
  st.draw(3.25);
  expect(filters('b')).toEqual([f]);                     // the same element, its deviation rewritten
  expect(Number(f.querySelector('feGaussianBlur')!.getAttribute('stdDeviation')!.split(' ')[0])).toBeLessThan(6);
  st.draw(4.5);
  expect([frame('b').style.filter, filters('b').length]).toEqual(['url(#red-dawn)', 1]);
  // an even blur: both deviations
  const q = structuredClone(p);
  q.tracks[0].items[1].transitionIn = { type: 'blur', dur: 1 };
  st.update(q);
  st.draw(3.5);
  expect(filters('b')[0].querySelector('feGaussianBlur')!.getAttribute('stdDeviation')).toBe('1.5 1.5');   // 3% of the 50 px side
});

test('dip and flash cover the picture with a veil inside the frame, made once; hidden again after', () => {
  const root = document.createElement('div');
  const st = new Stage(root, createRegistry([corePlugin]), fakeMedia());
  const p = project();
  Object.assign(p.tracks[0].items[1], { radius: 8, transitionIn: { type: 'dip', dur: 1 } });
  st.load(p);
  const frame = (id: string) => root.querySelector<HTMLElement>(`[data-id="${id}"] .st-frame`)!;
  const veil = (id: string) => frame(id).querySelector<HTMLElement>(':scope > .st-veil');
  expect(veil('a')).toBeNull();
  st.draw(3.25);
  expect([veil('a')!.style.display, parseFloat(veil('a')!.style.opacity), veil('a')!.style.zIndex]).toEqual(['', 0.5, '1']);
  expect(veil('a')!.style.background).toMatch(/^(#000|rgb\(0, 0, 0\)|black)$/);
  expect(parseFloat(frame('b').parentElement!.style.opacity)).toBe(0);  // B unseen before the middle
  st.draw(3.75);
  const v = veil('b')!;
  expect([parseFloat(v.style.opacity), parseFloat(frame('b').parentElement!.style.opacity), frame('b').style.borderRadius]).toEqual([0.5, 1, '8px']);
  st.draw(4.5);
  expect([veil('b'), v.style.display]).toEqual([v, 'none']);
  expect(frame('b').querySelectorAll('.st-veil').length).toBe(1);
  // flash: white, and brighter
  const q = structuredClone(p);
  q.tracks[0].items[1].transitionIn = { type: 'flash', dur: 1 };
  st.update(q);
  st.draw(3.45);
  expect(veil('a')!.style.background).toMatch(/^(#fff|rgb\(255, 255, 255\)|white)$/);
  expect(frame('a').style.filter).toBe('brightness(1.151)');
});

test('a clip stacked under the clip its linked transition comes from is lifted just above it while the transition runs', () => {
  const root = document.createElement('div');
  const st = new Stage(root, createRegistry([corePlugin]), fakeMedia());
  const p = project();
  const [a, b] = p.tracks[0].items;
  b.transitionIn = { type: 'iris', dur: 1 };
  p.tracks[0].items = [b, a];                            // b first in the array: under a
  st.load(p);
  const z = () => Object.fromEntries([...root.querySelectorAll<HTMLElement>('.st-item')].map((e) => [e.dataset.id, e.style.zIndex]));
  expect(z()).toEqual({ b: '2', a: '4', f: '6', q: '8' });
  st.draw(3.5);
  expect(z()).toEqual({ b: '5', a: '4', f: '6', q: '8' });
  st.draw(4.5);
  expect(z().b).toBe('2');
  // in the usual order nothing is lifted
  st.load(project());
  st.draw(3.5);
  expect(z()).toEqual({ a: '2', b: '4', f: '6', q: '8' });
});

test('a picture window\'s dressing: the outline over the frame, the shadow on the layer, a text shape cut by its own clipPath', () => {
  const root = document.createElement('div');
  const st = new Stage(root, createRegistry([corePlugin]), fakeMedia());
  const p = project();
  Object.assign(p.tracks[0].items[0], { shape: { type: 'circle' }, outline: { width: 20, color: '#00ff00' }, shadow: true });
  Object.assign(p.tracks[0].items[1], { shape: { type: 'text', text: 'ROMA\nCITY' }, outline: {} });
  st.load(p);
  st.draw(0.5);
  const el = (id: string) => root.querySelector<HTMLElement>(`[data-id="${id}"]`)!;
  const a = el('a'), line = a.querySelector('svg.st-outline')!;
  // over the frame, its box and transform; the circle's line on its path, 20 px at 1080 → 20 × 50 / 1080 here
  expect(line.previousElementSibling).toBe(a.querySelector('.st-frame'));
  expect((line as unknown as HTMLElement).style.width).toBe('100px');
  expect(line.querySelector('path')!.getAttribute('d')).toMatch(/^M.*Z$/);
  expect([line.querySelector('path')!.getAttribute('stroke'), +line.querySelector('path')!.getAttribute('stroke-width')!]).toEqual(['#00ff00', +(20 * 50 / 1080).toFixed(2)]);
  expect(line.querySelector('rect')!.getAttribute('display')).toBe('none');
  expect((a as any)._c.filter).toMatch(/^drop-shadow\(0px [\d.]+px [\d.]+px rgba\(0, 0, 0, 0\.45\)\)$/);
  // the text shape: a clipPath of one <text> a line, the frame cut by it; its line under the frame, twice as wide
  st.draw(3.5);
  const b = el('b'), clip = b.querySelector('clipPath')!;
  expect([...clip.querySelectorAll('text')].map((t) => t.textContent)).toEqual(['ROMA', 'CITY']);
  expect((b.querySelector<HTMLElement>('.st-frame') as any)._c.clipPath).toBe(`url(#${clip.id})`);
  const under = b.querySelector('svg.st-outline')!;
  expect(under.nextElementSibling).toBe(b.querySelector('.st-frame'));
  expect([...under.querySelectorAll('g text')].map((t) => t.textContent)).toEqual(['ROMA', 'CITY']);
  expect(+under.querySelector('g')!.getAttribute('stroke-width')!).toBeCloseTo(2 * 8 * 50 / 1080, 1);
  expect((b as any)._c.filter).toBe('');
  // halfway through its dissolve: the layer fades as one, the frame and the line under it stay whole, so the line never shows
  // through the half-clear letters
  expect([parseFloat(b.style.opacity), b.querySelector<HTMLElement>('.st-frame')!.style.opacity, (under as unknown as HTMLElement).style.opacity]).toEqual([0.5, '', '']);
  // drawn again with nothing changed: the rows are not made again
  const rows = clip.querySelector('text');
  st.draw(3.6);
  expect(clip.querySelector('text')).toBe(rows);
});
