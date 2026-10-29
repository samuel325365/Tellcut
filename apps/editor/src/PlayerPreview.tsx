// The player in embed mode as a small looping preview (the gallery's detail panel, the save dialog of My blocks): the project
// goes in by postMessage; `src` picks where its fx modules are loaded from (a project's folder, an entry of My blocks).
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { PlayerBridge } from './bridge.ts';
import { t } from './i18n/index.ts';

const GALLERY_PLAYER = '/player/index.html?embed=1&media=api&id=_gallery';
/** the player for a project's own blocks (its fx load from the project folder) */
export const projectPlayer = (id: string) => `/player/index.html?embed=1&media=api&id=${encodeURIComponent(id)}`;
/** the player for an entry of My blocks (its module and fonts load from the entry's folder) */
export const libraryPlayer = (slug: string) => `/player/index.html?embed=1&project=${encodeURIComponent(`/api/library/blocks/${slug}/project.json`)}`;

/** The player in embed mode, playing `project` in a loop; a new project is patched in without reloading. Without autoplay it plays
 *  only when playKey changes (a sound: the panel always shows one, and opening the tab or searching must not make a noise). */
export function PlayerPreview({ project, loop = true, playKey, autoplay = true, src = GALLERY_PLAYER }: { project: unknown; loop?: boolean; playKey?: number; autoplay?: boolean; src?: string }) {
  const frame = useRef<HTMLIFrameElement>(null), bridge = useMemo(() => new PlayerBridge(location.origin), []);
  const [error, setError] = useState('');
  const loaded = useRef(false), lastKey = useRef(playKey), wanted = useRef(false);
  useEffect(() => {
    const win = frame.current?.contentWindow;
    if (!win) return;
    bridge.attach(win);
    const on = (e: MessageEvent) => { if (e.origin === location.origin && e.source === win) bridge.handle(e.data); };
    addEventListener('message', on);
    bridge.onError = (m) => setError(m);
    return () => removeEventListener('message', on);
  }, []);
  // loop by starting over just before the end: at the end the player shows the last frame without the block (an item ends there),
  // and a restart takes a moment, which would flash the bare ground
  useEffect(() => {
    let dur = 0, restarted = false;
    bridge.onReady = (d) => { dur = d; restarted = false; if (autoplay || wanted.current) bridge.play(0); wanted.current = false; };
    bridge.onTime = (t) => {
      if (t < 1) restarted = false;
      else if (loop && dur && !restarted && t >= dur - 0.12) { restarted = true; bridge.play(0); }
    };
    bridge.onEnded = () => { if (loop) bridge.play(0); };
  }, [loop]);
  useEffect(() => {
    setError('');
    const asked = playKey !== lastKey.current;
    lastKey.current = playKey;
    if (!loaded.current) { bridge.load(project); loaded.current = true; }
    else { bridge.patch(project); if (autoplay) bridge.play(0); }
    if (!autoplay && asked) { wanted.current = true; bridge.play(0); }   // not ready yet: played once it is
  }, [JSON.stringify(project), playKey]);
  return (
    <div class="g-player">
      <iframe ref={frame} title={t('gallery.previewTitle')} src={src} />
      {error && <p class="err">{t('gallery.previewError', { err: error })}</p>}
    </div>
  );
}
