import { keyAction } from './keys.ts';

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
