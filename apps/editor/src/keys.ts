// Keyboard shortcuts (spec §4.2, §4.5). Never active while typing in a text field.
export const ACTIONS = ['playPause', 'back', 'pause', 'play', 'prevFrame', 'nextFrame', 'home', 'end', 'split', 'delete', 'rippleDelete',
  'undo', 'redo', 'exitCrop', 'maxPreview', 'raise', 'lower', 'zoomFit', 'help'] as const;
export type Action = (typeof ACTIONS)[number];
interface KeyLike { key: string; code: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean; target?: EventTarget | null }

// a slider is not typed into: after dragging the timeline zoom, Space must still play
const typing = (t: any) => !!t && ((['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) && t.type !== 'range') || t.isContentEditable);

export function keyAction(e: KeyLike): Action | null {
  if (typing(e.target)) return null;
  // a focused slider keeps its arrow keys (the timeline zoom); Space, Home and End still drive the playhead
  const t: any = e.target;
  if (t && t.tagName === 'INPUT' && t.type === 'range' && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown'].includes(e.key)) return null;
  const mod = e.ctrlKey || e.metaKey, key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (mod) {
    if (key === 'z') return e.shiftKey ? 'redo' : 'undo';
    if (key === 'y') return 'redo';
    if (key === ']') return 'raise';
    if (key === '[') return 'lower';
    return null;
  }
  if (e.code === 'Space' || key === ' ') return 'playPause';
  switch (key) {
    case 'j': return 'back';
    case 'k': return 'pause';
    case 'l': return 'play';
    case 'ArrowLeft': return 'prevFrame';
    case 'ArrowRight': return 'nextFrame';
    case 'Home': return 'home';
    case 'End': return 'end';
    case 's': return 'split';
    case 'Delete': return e.shiftKey ? 'rippleDelete' : 'delete';
    case 'Backspace': return 'delete';
    case 'Escape': return 'exitCrop';
    case 'f': return 'maxPreview';
    case '?': return 'help';
    case 'F1': return 'help';
    case '\\': return 'zoomFit';
    default: return null;
  }
}
