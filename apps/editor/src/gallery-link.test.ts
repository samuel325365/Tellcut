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

test('the round trip: the gallery asks the tab that opened it, which adds and answers; same origin only', async () => {
  const ed = await editor(), g = fakeWin(), e = fakeWin();
  link(g, e);
  const off = answerGallery(ed, e);
  expect(await askEditor(e, 'demo', { kind: 'block', type: 'x.card' }, { self: g })).toEqual({ ok: true });
  expect([e.sent, g.sent]).toEqual([[ORIGIN], [ORIGIN]]);
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
