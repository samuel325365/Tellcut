// Files dragged in from Explorer or Finder (spec 2026-11-10-media-panel-visual §4): the browser's own drag and drop, unlike the
// library cards (media/drag.ts, mouse events). While they are dragged only their types are known, not their names.
import type { DropKind } from '../timeline/drop.ts';

/** the drag carries files from the PC (not text or a picture dragged within the page) */
export const hasFiles = (dt: DataTransfer | null | undefined) => !!dt && [...(dt.types ?? [])].includes('Files');

/** what the dragged files will make, for the "+ New track" strip: all sound → music, anything else → video */
export function draggedKind(dt: DataTransfer): DropKind {
  const types = [...(dt.items ?? [])].filter((i) => i.kind === 'file').map((i) => i.type);
  return types.length && types.every((t) => t.startsWith('audio/')) ? 'music' : 'video';
}

/** the files let go, and how many folders among them (a folder goes in by Import: its files are not given to a page) */
export function droppedFiles(dt: DataTransfer): { files: File[]; folders: number } {
  const files: File[] = [];
  let folders = 0;
  for (const i of [...(dt.items ?? [])]) {
    if (i.kind !== 'file') continue;
    if ((i as any).webkitGetAsEntry?.()?.isDirectory) { folders++; continue; }
    const f = i.getAsFile();
    if (f) files.push(f);
  }
  return { files, folders };
}

/** a file let go where nothing takes it would be opened by the browser in place of the editor; returns the undo */
export function guardFileDrops(): () => void {
  // one the timeline or the media panel took (it prevented the default first) is theirs: its drop effect stays copy
  const stop = (e: DragEvent) => {
    if (e.defaultPrevented || !hasFiles(e.dataTransfer)) return;
    e.preventDefault();
    if (e.type === 'dragover' && e.dataTransfer) e.dataTransfer.dropEffect = 'none';
  };
  addEventListener('dragover', stop as EventListener);
  addEventListener('drop', stop as EventListener);
  return () => { removeEventListener('dragover', stop as EventListener); removeEventListener('drop', stop as EventListener); };
}
