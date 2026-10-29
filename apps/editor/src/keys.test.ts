import { clipboardFree, editorTakes, keyAction } from './keys.ts';

const k = (key: string, o: Partial<{ code: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean; target: any }> = {}) =>
  keyAction({ key, code: o.code ?? '', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...o });

test('shortcuts map to editor actions', () => {
  expect(k(' ', { code: 'Space' })).toBe('playPause');
  expect([k('j'), k('k'), k('l')]).toEqual(['back', 'pause', 'play']);
  expect([k('ArrowLeft'), k('ArrowRight'), k('Home'), k('End')]).toEqual(['prevFrame', 'nextFrame', 'home', 'end']);
  expect([k('s'), k('Delete'), k('Backspace'), k('Delete', { shiftKey: true })]).toEqual(['split', 'delete', 'delete', 'rippleDelete']);
  expect([k('z', { ctrlKey: true }), k('Z', { ctrlKey: true, shiftKey: true }), k('y', { ctrlKey: true })]).toEqual(['undo', 'redo', 'redo']);
  expect(k('s', { ctrlKey: true })).toBeNull();
});

test('typing in a text field never triggers edits', () => {
  const input = { tagName: 'INPUT', isContentEditable: false };
  expect(k(' ', { code: 'Space', target: input })).toBeNull();
  expect(k('Delete', { target: { tagName: 'DIV', isContentEditable: true } })).toBeNull();
});

test('Escape leaves crop mode', () => { expect(k('Escape')).toBe('exitCrop'); });

test('F toggles the large preview', () => { expect(k('f')).toBe('maxPreview'); });

test('a slider (the timeline zoom) keeps its arrow keys; Space, Home and End still drive the playhead', () => {
  const range = { tagName: 'INPUT', type: 'range', isContentEditable: false };
  expect([k(' ', { code: 'Space', target: range }), k('Home', { target: range }), k('ArrowLeft', { target: range }), k('PageUp', { target: range })])
    .toEqual(['playPause', 'home', null, null]);
});

test('Ctrl+] and Ctrl+[ move the selected item a layer up or down', () => {
  expect([k(']', { ctrlKey: true }), k('[', { ctrlKey: true })]).toEqual(['raise', 'lower']);
});
test('\\ zooms the timeline to the whole project', () => { expect(k('\\')).toBe('zoomFit'); });

test('Ctrl+\\ cycles the layout; \\ alone still zooms to fit', () => {
  expect(k('\\', { ctrlKey: true })).toBe('layout');
  expect(k('\\')).toBe('zoomFit');
});

test('new timeline keys', () => {
  expect([k('q'), k('w'), k('ArrowUp'), k('ArrowDown')]).toEqual(['deleteLeft', 'deleteRight', 'prevCut', 'nextCut']);
  expect([k('ArrowLeft', { shiftKey: true }), k('ArrowRight', { shiftKey: true })]).toEqual(['back10', 'forward10']);
  expect([k('c', { ctrlKey: true }), k('v', { ctrlKey: true }), k('d', { ctrlKey: true }), k('a', { ctrlKey: true })]).toEqual(['copy', 'paste', 'duplicate', 'selectAll']);
  expect([k('m'), k('=', { ctrlKey: true }), k('+', { ctrlKey: true, shiftKey: true }), k('-', { ctrlKey: true })]).toEqual(['muteItem', 'zoomIn', 'zoomIn', 'zoomOut']);
  expect([k('s'), k('f'), k('ArrowLeft'), k('ArrowRight')]).toEqual(['split', 'maxPreview', 'prevFrame', 'nextFrame']);   // unchanged
  expect(k('ArrowUp', { target: { tagName: 'INPUT', type: 'range' } })).toBeNull();                                         // a focused slider keeps its arrows
});

test('clipboardFree: a text selection or focus in chat / export log / help hands Ctrl+C/V/A to the browser', () => {
  const doc = (collapsed: boolean) => ({ getSelection: () => ({ isCollapsed: collapsed }) }) as any;
  const el = (inside: string | null) => ({ closest: (sel: string) => (inside && sel.includes(inside) ? {} : null) }) as any;
  expect(clipboardFree(doc(true), el(null))).toBe(true);
  expect(clipboardFree(doc(false), el(null))).toBe(false);                 // text is selected somewhere on the page
  for (const inside of ['[data-chat]', '[data-export-panel]', '[data-help-panel]', '[data-ask]']) expect(clipboardFree(doc(true), el(inside))).toBe(false);
  expect(clipboardFree(doc(true), null)).toBe(true);
});

test('Ctrl+Shift+C / V / D / A / - belong to the browser (tab search, bookmark all tabs…), not the timeline; Ctrl+Shift+Z still redoes', () => {
  const cs = (key: string) => k(key, { ctrlKey: true, shiftKey: true });
  expect([cs('C'), cs('V'), cs('D'), cs('A'), cs('_'), cs('Z')]).toEqual([null, null, null, null, null, 'redo']);
  expect(cs('+')).toBe('zoomIn');   // + needs Shift on most layouts
});

test('while the help is open only ? / F1 and Esc go to the editor; the rest (arrows to scroll it) keep their browser action', () => {
  expect([editorTakes('help', true), editorTakes('exitCrop', true), editorTakes('nextCut', true), editorTakes('playPause', true)]).toEqual([true, true, false, false]);
  expect(editorTakes('nextCut', false)).toBe(true);
});
