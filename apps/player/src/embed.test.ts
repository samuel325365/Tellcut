// @vitest-environment jsdom
import { blocksDefault, createDispatcher, keyMessage, shouldForwardKey, type SessionApi } from './embed.ts';

const flush = () => new Promise((r) => setTimeout(r, 0));

function fake() {
  const calls: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const s: SessionApi = {
    load: async () => { calls.push('load'); await gate; return 12; },
    patch: async (p: any) => { calls.push(`patch ${p.n}`); },
    seek: async (t) => { calls.push(`seek ${t}`); },
    play: async (from) => { calls.push(`play ${from}`); },
    pause: () => { calls.push('pause'); },
    cropMode: () => {},
    quality: (v: string) => { calls.push(`quality ${v}`); },
    select: (id: string | null) => { calls.push(`select ${id}`); },
    mediaReady: async (src: string) => { calls.push(`media ${src}`); },
  };
  return { s, calls, release };
}

test('messages run in order and queued patches collapse to the newest', async () => {
  const { s, calls, release } = fake(), posted: any[] = [];
  const send = createDispatcher(s, (m) => posted.push(m));
  send({ type: 'load', project: {} });
  send({ type: 'patch', project: { n: 1 } });
  send({ type: 'patch', project: { n: 2 } });
  send({ type: 'seek', t: 3 });
  release(); await flush();
  expect(calls).toEqual(['load', 'patch 2', 'seek 3']);
  expect(posted).toEqual([{ type: 'ready', duration: 12 }]);
});

test('a source whose media is there now waits for the load before it, and a newer seek or patch does not drop it', async () => {
  const { s, calls, release } = fake();
  const send = createDispatcher(s, () => {});
  send({ type: 'load', project: {} });
  send({ type: 'mediaReady', source: 's1' });
  send({ type: 'mediaReady', source: 's2' });
  send({ type: 'seek', t: 3 });
  send({ type: 'patch', project: { n: 1 } });
  release(); await flush();
  expect(calls).toEqual(['load', 'media s1', 'media s2', 'seek 3', 'patch 1']);
});

test('pause acts immediately and drops a queued play; failures are posted as errors', async () => {
  const { s, calls, release } = fake(), posted: any[] = [];
  const send = createDispatcher(s, (m) => posted.push(m));
  send({ type: 'load', project: {} });
  send({ type: 'play', from: 2 });
  send({ type: 'pause' });
  release(); await flush();
  expect(calls).toEqual(['load', 'pause']);
  s.patch = async () => { throw new Error('Invalid project:\nmeta: Required'); };
  send({ type: 'patch', project: {} }); await flush();
  // coded by what failed, the error's own words as its param, for the editor to word in its language
  expect(posted.at(-1)).toEqual({ type: 'error', message: 'Invalid project:\nmeta: Required', code: 'player.updateFailed', params: { error: 'Invalid project:\nmeta: Required' } });
  s.seek = async () => { throw 'gone'; };
  send({ type: 'seek', t: 1 }); await flush();
  expect(posted.at(-1)).toEqual({ type: 'error', message: 'gone', code: 'player.seekFailed', params: { error: 'gone' } });
  // an error with a code of its own (a project from a newer Tellcut) keeps it
  s.load = async () => { throw Object.assign(new Error('Invalid project:\nnewer'), { code: 'project.tooNew', params: { version: 9, max: 1 } }); };
  send({ type: 'load', project: {} }); await flush();
  expect(posted.at(-1)).toEqual({ type: 'error', message: 'Invalid project:\nnewer', code: 'project.tooNew', params: { version: 9, max: 1 } });
});

test('queued transport messages collapse to the newest play or seek', async () => {
  const { s, calls, release } = fake(), posted: any[] = [];
  const send = createDispatcher(s, (m) => posted.push(m));
  send({ type: 'load', project: {} });
  send({ type: 'play', from: 1 });
  send({ type: 'seek', t: 2 });
  send({ type: 'play', from: 3 });
  release(); await flush();
  expect(calls).toEqual(['load', 'play 3']);
});

test('key presses inside the preview are forwarded to the editor', () => {
  const e = { key: ' ', code: 'Space', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false } as KeyboardEvent;
  expect(keyMessage(e)).toEqual({ type: 'key', key: ' ', code: 'Space', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false });
});

test('cropMode is passed to the session at once', () => {
  const { s } = fake();
  const modes: any[] = [];
  (s as any).cropMode = (m: any) => modes.push(m);
  const send = createDispatcher(s, () => {});
  send({ type: 'cropMode', sel: { itemId: 'c1', which: 'to' } });
  send({ type: 'cropMode', sel: null });
  expect(modes).toEqual([{ itemId: 'c1', which: 'to' }, null]);
});

test('the preview quality applies at once', () => {
  const { s, calls } = fake();
  const send = createDispatcher(s, () => {});
  send({ type: 'quality', value: 'draft' });
  expect(calls).toEqual(['quality draft']);
});

test('the selection is passed to the preview tools at once', () => {
  const { s, calls } = fake();
  const send = createDispatcher(s, () => {});
  send({ type: 'select', itemId: 'f' });
  send({ type: 'select', itemId: null });
  expect(calls).toEqual(['select f', 'select null']);
});

test('typing in the preview text box is not forwarded as shortcuts', () => {
  const input = document.createElement('input');
  expect(shouldForwardKey({ target: input } as any)).toBe(false);
  expect(shouldForwardKey({ target: document.createElement('div') } as any)).toBe(true);
});

test('in the preview, the browser does not act on Space, the arrows or the timeline\'s Ctrl keys (bookmark, page zoom)', () => {
  const e = (key: string, o: Record<string, unknown> = {}) => ({ key, code: key === ' ' ? 'Space' : '', ctrlKey: false, metaKey: false, ...o }) as any;
  expect([e(' '), e('ArrowUp'), e('d', { ctrlKey: true }), e('=', { ctrlKey: true }), e('+', { ctrlKey: true }), e('-', { metaKey: true })].map(blocksDefault)).toEqual([true, true, true, true, true, true]);
  expect([e('d'), e('c', { ctrlKey: true }), e('q'), e('D', { ctrlKey: true, shiftKey: true })].map(blocksDefault)).toEqual([false, false, false, false]);   // Ctrl+C still copies in the page
});
