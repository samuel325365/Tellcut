// @vitest-environment jsdom
import { draggedKind, droppedFiles, guardFileDrops, hasFiles } from './file-drop.ts';

/** a DataTransfer as the browser gives one for files from the PC (jsdom has none) */
function transfer(items: Array<{ type: string; name?: string; dir?: boolean }>, types = ['Files']): any {
  const list = items.map((i) => ({ kind: 'file', type: i.type, getAsFile: () => (i.dir ? null : new File(['x'], i.name ?? 'f')), webkitGetAsEntry: () => ({ isDirectory: !!i.dir }) }));
  return { types, items: list, files: list.flatMap((i) => (i.getAsFile() ? [i.getAsFile()] : [])), dropEffect: 'none' };
}

test('files from the PC: their kind while dragged (all sound → music, else video), folders counted apart', () => {
  expect(hasFiles(transfer([]))).toBe(true);
  expect(hasFiles(transfer([], ['text/plain']))).toBe(false);
  expect(draggedKind(transfer([{ type: 'audio/wav' }, { type: 'audio/mpeg' }]))).toBe('music');
  expect(draggedKind(transfer([{ type: 'audio/wav' }, { type: 'video/mp4' }]))).toBe('video');
  expect(draggedKind(transfer([{ type: '' }]))).toBe('video');
  const got = droppedFiles(transfer([{ type: 'video/mp4', name: 'a.mp4' }, { type: '', dir: true }]));
  expect([got.files.map((f) => f.name), got.folders]).toEqual([['a.mp4'], 1]);
});

test('a file let go anywhere else on the page is not opened by the browser', () => {
  const off = guardFileDrops();
  const ev = (type: string, dt: any) => { const e = new Event(type, { cancelable: true }); (e as any).dataTransfer = dt; dispatchEvent(e); return e; };
  expect(ev('dragover', transfer([])).defaultPrevented).toBe(true);
  expect(ev('drop', transfer([])).defaultPrevented).toBe(true);
  expect(ev('drop', transfer([], ['text/plain'])).defaultPrevented).toBe(false);   // a text drag is left alone
  // over the timeline, which took it: the drop effect it set is kept
  const dt = transfer([]), e = new Event('dragover', { cancelable: true });
  (e as any).dataTransfer = dt; e.preventDefault(); dt.dropEffect = 'copy'; dispatchEvent(e);
  expect(dt.dropEffect).toBe('copy');
  off();
  expect(ev('drop', transfer([])).defaultPrevented).toBe(false);
});
