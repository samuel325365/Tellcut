// postMessage protocol between the editor and the embedded player (spec §2.3, plus 'boot').
import type { MediaResolver } from '@tellcut/engine';
import type { CropSel, EditorMsg, PlayerMsg } from '@tellcut/protocol';
import { PreviewSession } from './session.ts';
import { fitStage } from './fit.ts';
import { StageTools } from './tools.ts';

export type { EditorMsg, PlayerMsg };
export interface SessionApi { load(p: unknown): Promise<number>; patch(p: unknown): Promise<void>; seek(t: number): Promise<void>; play(from: number): Promise<void>; pause(): void; cropMode(sel: CropSel | null): void; quality(v: 'full' | 'draft'): void; select(id: string | null): void }

/** Keys typed into the preview's text box stay there (Space must not start playback). */
export const shouldForwardKey = (e: Pick<KeyboardEvent, 'target'>) => !(e.target as HTMLElement | null)?.closest?.('input, textarea');

/** keys whose browser action must not happen while the preview has focus: Space and the arrows (scrolling), and the
 *  timeline's Ctrl+D (bookmark) and Ctrl+= / + / - (page zoom); the editor still gets them */
export const blocksDefault = (e: Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'metaKey'>) =>
  e.code === 'Space' || e.key.startsWith('Arrow') || ((e.ctrlKey || e.metaKey) && ['d', 'D', '=', '+', '-'].includes(e.key));

export const keyMessage = (e: KeyboardEvent): PlayerMsg =>
  ({ type: 'key', key: e.key, code: e.code, ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey, altKey: e.altKey });

/** Runs editor messages one after another; queued patches collapse to the newest, pause acts at once. */
export function createDispatcher(s: SessionApi, post: (m: PlayerMsg) => void) {
  let queue: EditorMsg[] = [];
  let busy = false;
  async function pump() {
    if (busy) return;
    busy = true;
    while (queue.length) {
      const m = queue.shift()!;
      try {
        if (m.type === 'load') post({ type: 'ready', duration: await s.load(m.project) });
        else if (m.type === 'patch') await s.patch(m.project);
        else if (m.type === 'seek') await s.seek(m.t);
        else if (m.type === 'play') await s.play(m.from);
      } catch (e) { post({ type: 'error', message: String((e as Error)?.message ?? e) }); }
    }
    busy = false;
  }
  return (m: EditorMsg) => {
    if (m.type === 'cropMode') { s.cropMode(m.sel); return; }
    if (m.type === 'quality') { s.quality(m.value); return; }
    if (m.type === 'select') { s.select(m.itemId); return; }
    if (m.type === 'pause') { queue = queue.filter((x) => x.type !== 'play'); s.pause(); return; }
    if (m.type === 'load') queue = [];
    if (m.type === 'patch') queue = queue.filter((x) => x.type !== 'patch');
    // scrubbing during playback sends a play per mouse move: only the newest transport request matters
    if (m.type === 'play' || m.type === 'seek') queue = queue.filter((x) => x.type !== 'play' && x.type !== 'seek');
    queue.push(m);
    void pump();
  };
}

export function startEmbed(win: Window, stageEl: HTMLElement, viewport: HTMLElement, deps: { resolver: MediaResolver; projectUrl: string }) {
  const post = (m: PlayerMsg) => win.parent.postMessage(m, win.location.origin);
  const fit = () => fitStage(stageEl, viewport);
  let tools: StageTools | null = null;
  const session = new PreviewSession({
    stageEl, ...deps,
    onTime: (t) => post({ type: 'time', t }), onEnded: () => post({ type: 'ended' }),
    onError: (itemId, message) => post({ type: 'error', itemId, message }),
    onLevel: (db) => post({ type: 'level', db }),
    onDrawn: () => tools?.refresh(),
    post, viewport: () => ({ w: viewport.clientWidth, h: viewport.clientHeight }),
  });
  tools = new StageTools(stageEl, viewport, post, { project: () => session.current, get registry() { return session.registry; }, busy: () => session.busy });
  const api: SessionApi = {
    load: async (p) => { const d = await session.load(p); fit(); return d; },
    patch: async (p) => { await session.patch(p); fit(); },
    seek: (t) => session.seek(t), play: (f) => session.play(f), pause: () => session.pause(),
    cropMode: (sel) => session.cropMode(sel),
    quality: (v) => { win.document.body.classList.toggle('draft', v === 'draft'); },
    select: (id) => tools!.select(id),
  };
  const send = createDispatcher(api, post);
  win.addEventListener('message', (e) => { if (e.origin === win.location.origin && e.source === win.parent) send(e.data as EditorMsg); });
  win.addEventListener('resize', () => { fit(); tools?.refresh(); });
  // once the preview has focus, shortcuts must still reach the editor
  win.addEventListener('keydown', (e) => {
    if (!shouldForwardKey(e)) return;
    if (blocksDefault(e)) e.preventDefault();
    post(keyMessage(e));
  });
  post({ type: 'boot' });
}
