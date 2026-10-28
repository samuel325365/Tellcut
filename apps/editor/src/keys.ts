// Keyboard shortcuts (spec §4.2, §4.5). Never active while typing in a text field.
export const ACTIONS = ['playPause', 'back', 'pause', 'play', 'prevFrame', 'nextFrame', 'home', 'end', 'split', 'delete', 'rippleDelete',
  'undo', 'redo', 'exitCrop', 'maxPreview', 'raise', 'lower', 'zoomFit', 'help', 'layout',
  // the timeline's cutting keys (spec 2026-10-28-timeline-refresh A2)
  'deleteLeft', 'deleteRight', 'prevCut', 'nextCut', 'back10', 'forward10', 'copy', 'paste', 'duplicate', 'selectAll', 'muteItem', 'zoomIn', 'zoomOut'] as const;
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
    if (key === '\\') return 'layout';
    if (key === 'c') return 'copy';
    if (key === 'v') return 'paste';
    if (key === 'd') return 'duplicate';
    if (key === 'a') return 'selectAll';
    if (key === '=' || key === '+') return 'zoomIn';
    if (key === '-') return 'zoomOut';
    return null;
  }
  if (e.code === 'Space' || key === ' ') return 'playPause';
  switch (key) {
    case 'j': return 'back';
    case 'k': return 'pause';
    case 'l': return 'play';
    case 'ArrowLeft': return e.shiftKey ? 'back10' : 'prevFrame';
    case 'ArrowRight': return e.shiftKey ? 'forward10' : 'nextFrame';
    case 'ArrowUp': return 'prevCut';
    case 'ArrowDown': return 'nextCut';
    case 'q': return 'deleteLeft';
    case 'w': return 'deleteRight';
    case 'm': return 'muteItem';
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

/** Ctrl+C / V / A that the page itself should have: they act on the timeline only while no text is selected on the page and
 *  the focus is not in the chat, the export log, the help or the Ask Agent dialog (all text people copy from). */
export const CLIPBOARD_ACTIONS = new Set<Action>(['copy', 'paste', 'selectAll']);
const TEXT_PANELS = '[data-chat], .chat-tab, [data-export-panel], [data-help-panel], [data-ask]';
export function clipboardFree(doc: Pick<Document, 'getSelection'>, target: EventTarget | null): boolean {
  if (doc.getSelection()?.isCollapsed === false) return false;
  return !(target as Element | null)?.closest?.(TEXT_PANELS);
}
