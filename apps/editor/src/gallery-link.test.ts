// "Add to project" from the block gallery: the request through window.opener, and the editor's answer (one undo step at its playhead).
import { corePlugin, createRegistry } from '@tellcut/engine';
import { Editor } from './editor.ts';
import { fakes } from './editor-test-kit.ts';
import { addFromGallery, answerGallery, askEditor, galleryUrl } from './gallery-link.ts';

const ORIGIN = 'http://127.0.0.1:5174';
/** a window as both sides use it: message listeners, an origin, and a postMessage that `link` wires to the other side */
function fakeWin(origin = ORIGIN) {
  const w: any = new EventTarget();
  w.location = { origin }; w.closed = false; w.sent = [];
  w.deliver = (data: unknown, from: any, o = from.location.origin) => { const e: any = new Event('message'); Object.assign(e, { data, origin: o, source: from }); w.dispatchEvent(e); };
  return w;
}
/** gallery ↔ editor: each one's postMessage lands on the other */
function link(gallery: any, editor: any) {
  editor.postMessage = (data: unknown, target: string) => { editor.sent.push(target); editor.deliver(data, gallery); };
  gallery.postMessage = (data: unknown, target: string) => { gallery.sent.push(target); gallery.deliver(data, editor); };
}
const block = (type: string, kind: string) => ({ type, label: type, kind, params: [{ key: 'text', label: 'text', type: 'string', default: '' }], build: () => null, draw: () => {} });
const registry = () => createRegistry([corePlugin, { id: 'x', items: [block('x.card', 'overlay'), block('x.paper', 'scene')],
  sfx: [{ type: 'x.tick', label: 'tick', params: [{ key: 'len', label: 'len', type: 'number', default: 0.2 }], duration: (p: any) => p.len, synth: () => {} }] } as any]);
async function editor() {
  const { api, bridge } = fakes({ useLibrary: async () => ({ file: 'fx/lib/box/_entry.js', fx: 's1' }) });
  const ed = new Editor('demo', { api, bridge, registry: registry() });
  await ed.open();
  ed.seek(2);
  return ed;
}
const items = (ed: Editor) => ed.store.get().project!.tracks.flatMap((t) => t.items as any[]);

test('the gallery link keeps the project in its address', () => {
  expect(galleryUrl('my trip')).toBe('./?gallery&project=my%20trip');
});

test('a block from the gallery goes in at the playhead as one undo step, with the values changed there; a sound too', async () => {
  const ed = await editor(), before = items(ed).length;
  expect(await addFromGallery(ed, 'demo', { kind: 'block', type: 'x.card', params: { text: 'hi', nope: 1 } })).toEqual({ ok: true });
  const added = items(ed).find((x) => x.id === ed.store.get().selection[0]);
  expect(added).toMatchObject({ type: 'x.card', start: 2, params: { text: 'hi' } });
  expect('nope' in added.params).toBe(false);
  expect(await addFromGallery(ed, 'demo', { kind: 'sfx', type: 'x.tick', params: { len: 0.5 } })).toEqual({ ok: true });
  expect(items(ed).find((x) => x.id === ed.store.get().selection[0])).toMatchObject({ type: 'x.tick', start: 2, end: 2.5 });
  ed.undo(); ed.undo();
  expect(items(ed).length).toBe(before);
});

test('refusals come back with their reason: another project, an unknown type, a background, the playhead at the end', async () => {
  const ed = await editor();
  expect(await addFromGallery(ed, 'other', { kind: 'block', type: 'x.card' })).toMatchObject({ ok: false, notice: expect.any(String) });
  expect(await addFromGallery(ed, 'demo', { kind: 'block', type: 'fx.gone' })).toMatchObject({ ok: false, notice: expect.stringContaining('fx.gone') });
  expect(await addFromGallery(ed, 'demo', { kind: 'sfx', type: 'x.card' })).toMatchObject({ ok: false });
  expect(await addFromGallery(ed, 'demo', { kind: 'block', type: 'x.paper' })).toMatchObject({ ok: false, notice: expect.any(String) });
  ed.seek(20);
  const a = await addFromGallery(ed, 'demo', { kind: 'block', type: 'x.card' });
  expect(a).toEqual({ ok: false, notice: ed.store.get().notice });
  expect(a.notice).not.toBe('');
});

test('one of My blocks is copied in first; one the project already has is just added (its copy is not updated)', async () => {
  const ed = await editor(), used: string[] = [];
  const target = { id: ed.id, registry: ed.registry, store: ed.store, addOverlay: (t: string) => ed.addOverlay(t), addSfx: () => false,
    useLibraryBlock: async (slug: string) => { used.push(slug); return true; } };
  expect(await addFromGallery(target, 'demo', { kind: 'mine', type: 'fx.box', slug: 'box' })).toEqual({ ok: true });
  expect(await addFromGallery(target, 'demo', { kind: 'mine', type: 'x.card', slug: 'card' })).toEqual({ ok: true });
  expect(used).toEqual(['box']);
});

/** an editor whose registry has fx.box only while meta.fx loads its copy, with the library's link to that copy */
async function libraryEditor(o: { boxKind?: string; ownBox?: boolean } = {}) {
  const box = { id: 'fx', items: [block('fx.box', o.boxKind ?? 'overlay')] } as any;
  const base = createRegistry(o.ownBox ? [corePlugin, box] : [corePlugin]), withBox = createRegistry([corePlugin, box]);
  const used: string[] = [];
  const { api, bridge } = fakes({ useLibrary: async (_: string, b: any) => { used.push(b.slug); return { file: 'fx/lib/box/_entry.js', fx: 's1' }; },
    projectLibrary: async () => ({ links: [{ slug: 'box', file: 'fx/lib/box/_entry.js', types: ['fx.box'] }], savedFiles: [], savedStyles: [], styles: [] }),
    library: async () => ({ blocks: [], styles: [] }) });
  const ed = new Editor('demo', { api, bridge, registry: base, registryFor: async (p) => (p.meta.fx ?? []).includes('fx/lib/box/_entry.js') ? withBox : base });
  await ed.open();
  ed.seek(2);
  return { ed, used };
}
const boxes = (ed: Editor) => items(ed).filter((x) => x.type === 'fx.box').length;
const settle = () => new Promise((r) => setTimeout(r, 0));

test('one of My blocks added, undone, then added again from the gallery is copied into meta.fx again', async () => {
  const { ed, used } = await libraryEditor();
  expect(await ed.useLibraryBlock('box', 'fx.box')).toBe(true);
  ed.undo();
  await settle();
  expect([ed.store.get().project!.meta.fx ?? [], !!ed.registry?.item('fx.box')]).toEqual([[], false]);   // the registry follows the undo
  expect(await addFromGallery(ed, 'demo', { kind: 'mine', type: 'fx.box', slug: 'box' })).toEqual({ ok: true });
  expect(ed.store.get().project!.meta.fx).toEqual(['fx/lib/box/_entry.js']);
  expect([boxes(ed), used]).toEqual([1, ['box', 'box']]);
  // a redo past an undo brings the module back too
  ed.undo(); await settle(); ed.redo(); await settle();
  expect(!!ed.registry?.item('fx.box')).toBe(true);
});

test('one of My blocks whose type a block of the project\'s own already has is still asked of the library, not added as the own one', async () => {
  const { ed, used } = await libraryEditor({ ownBox: true });
  await addFromGallery(ed, 'demo', { kind: 'mine', type: 'fx.box', slug: 'box' });
  expect(used).toEqual(['box']);
});

test('a background of My blocks is refused from the gallery, copied or not', async () => {
  const { ed, used } = await libraryEditor({ boxKind: 'scene' });
  expect(await addFromGallery(ed, 'demo', { kind: 'mine', type: 'fx.box', slug: 'box', blockKind: 'scene' })).toMatchObject({ ok: false, notice: expect.any(String) });
  expect(used).toEqual([]);
  // the gallery did not say (an older page): the copy is loaded, seen to be a background, and nothing is added
  expect(await addFromGallery(ed, 'demo', { kind: 'mine', type: 'fx.box', slug: 'box' })).toMatchObject({ ok: false });
  await settle();
  expect([boxes(ed), ed.store.get().project!.meta.fx ?? [], !!ed.registry?.item('fx.box')]).toEqual([0, [], false]);
});

test('the round trip: the gallery asks the tab that opened it, which adds and answers; same origin only', async () => {
  const ed = await editor(), g = fakeWin(), e = fakeWin();
  link(g, e);
  const off = answerGallery(ed, e);
  expect(await askEditor(e, 'demo', { kind: 'block', type: 'x.card' }, { self: g })).toEqual({ ok: true });
  expect([e.sent, g.sent]).toEqual([[ORIGIN], [ORIGIN, ORIGIN]]);   // the editor says it has the request, then answers
  expect(items(ed).some((x) => x.type === 'x.card')).toBe(true);
  // a page of another origin is not heard
  const n = items(ed).length;
  e.deliver({ type: 'tellcut:gallery-add', req: 'r', project: 'demo', add: { kind: 'block', type: 'x.card' } }, g, 'http://evil.example');
  await Promise.resolve();
  expect(items(ed).length).toBe(n);
  off();
});

test('no editor tab to ask (closed, never opened from one, or not answering): the gallery says so', async () => {
  vi.useFakeTimers();
  try {
    const g = fakeWin(), closed = fakeWin();
    closed.closed = true;
    expect(await askEditor(null, 'demo', { kind: 'block', type: 'x.card' }, { self: g })).toMatchObject({ ok: false, notice: expect.any(String) });
    expect(await askEditor(closed, 'demo', { kind: 'block', type: 'x.card' }, { self: g })).toMatchObject({ ok: false });
    const silent = fakeWin();
    silent.postMessage = () => {};
    const p = askEditor(silent, 'demo', { kind: 'block', type: 'x.card' }, { self: g, timeout: 1000 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(await p).toMatchObject({ ok: false, notice: expect.any(String) });
  } finally { vi.useRealTimers(); }
});

test('an editor that has the request is waited for past the first wait (copying one of My blocks in takes a while)', async () => {
  vi.useFakeTimers();
  try {
    const g = fakeWin(), e = fakeWin();
    link(g, e);
    let finish!: (ok: boolean) => void;
    const slow = { id: 'demo', registry: createRegistry([corePlugin]), store: { get: () => ({ notice: '', project: null, library: { project: null } }) } as any,
      addOverlay: () => false, addSfx: () => false, useLibraryBlock: () => new Promise<boolean>((r) => { finish = r; }) };
    const off = answerGallery(slow, e);
    const p = askEditor(e, 'demo', { kind: 'mine', type: 'fx.box', slug: 'box' }, { self: g, timeout: 1000 });
    await vi.advanceTimersByTimeAsync(5000);
    finish(true);
    expect(await p).toEqual({ ok: true });
    off();
  } finally { vi.useRealTimers(); }
});
