// Video pool (port of the media.js of the hand-made films Tellcut grew out of). Scenes call video(ref, parent, local)
// each frame; sync() then either seeks exactly (render mode) or lets the element play and corrects drift.
import type { Crop } from '../schema.ts';
import type { MediaApi, MediaRef, StillRef } from '../plugin.ts';
import { coverPlacement } from '../geometry.ts';
import type { MediaResolver } from './resolvers.ts';
import { videoKey } from './refs.ts';
import { frameOf } from '../time.ts';

export function clampMediaTime(mt: number, duration: number, fps: number): number {
  const d = Number.isFinite(duration) ? duration : Infinity;
  return Math.max(0, Math.min(mt, d - 1 / fps));
}

/** render mode seeks the middle of the media frame `mt` lands on (frameOf: flooring 42/30 - 0.4 = 0.99999… showed the previous
 *  frame twice, about one frame in five) */
export function renderSeekTime(mt: number, fps: number): number {
  return (frameOf(mt, fps) + 0.5) / fps;
}

interface Use { v: HTMLVideoElement; mt: number; rate: number; url: string; held: boolean }

/** how long a media URL that failed to load is left alone before a preload tries it again (a proxy may be made meanwhile) */
const RETRY_MS = 5000;

export class MediaPool implements MediaApi {
  playing = false;
  /** elements per clip key; a use within one frame takes one no other use has taken (see video()) */
  private videos = new Map<string, HTMLVideoElement[]>();
  private used = new Map<HTMLVideoElement, Use>();
  /** per element, the one wait for its picture that every preload shares: the editor preloads on each drag frame, and each
   *  call used to add its own listeners, of which only the one that fired went away */
  private waits = new Map<HTMLVideoElement, Promise<boolean>>();
  /** URLs that failed to load, and when: a missing proxy was fetched again (one 404) on every drag frame */
  private failed = new Map<string, number>();
  constructor(private resolver: MediaResolver, private opts: { render: boolean; fps: number; seekTimeout?: number; preloadTimeout?: number }) {}

  /** Render: one element per clip (frame-exact seeks). Preview: one per media URL, so a trim or slip of a clip
   *  re-uses the already-loaded proxy instead of creating (and waiting for) a new element. */
  private keyOf(ref: MediaRef, url: string) { return this.opts.render ? videoKey(ref) : url; }

  /** The element for a use: `pick` chooses among the key's elements, a new one is made if it finds none. */
  private el(ref: MediaRef, url: string, pick: (list: HTMLVideoElement[]) => HTMLVideoElement | undefined): HTMLVideoElement {
    const key = this.keyOf(ref, url);
    const list = this.videos.get(key) ?? [];
    this.videos.set(key, list);
    let v = pick(list);
    if (!v) {
      v = document.createElement('video');
      v.src = url; v.muted = true; v.playsInline = true; v.preload = 'auto';
      v.dataset.key = key;
      list.push(v);
    }
    return v;
  }

  async preload(refs: MediaRef[]): Promise<void> {
    const limit = this.opts.preloadTimeout ?? (this.opts.render ? 30000 : 8000);
    await Promise.all(refs.map((ref) => new Promise<void>((res, rej) => {
      const url = this.resolver.video(ref, 0).url;
      const v = this.el(ref, url, (l) => l[0]);
      if (v.readyState >= 2) return res();
      const failedAt = this.failed.get(url);
      if (v.error && failedAt !== undefined && Date.now() - failedAt < RETRY_MS) return this.opts.render ? rej(new Error(`Failed to load ${url}`)) : res();
      // the browser may never fire either event (e.g. media deferred in a hidden window): never wait forever.
      // Preview carries on (sync() seeks later anyway); an export fails instead of capturing black frames.
      const timer = setTimeout(() => {
        if (this.opts.render) rej(new Error(`Timed out loading ${url}`));
        else { console.warn(`Video not ready after ${limit} ms, continuing: ${url}`); res(); }
      }, limit);
      // a missing clip must fail an export instead of rendering black frames
      void this.picture(v, url).then((ok) => { clearTimeout(timer); if (ok || !this.opts.render) res(); else rej(new Error(`Failed to load ${url}`)); });
      // only a failed or never-started element is (re)loaded: load() resets one that is loading or seeking to 0 s and fetches it again
      if (v.error || v.networkState === v.NETWORK_EMPTY) v.load();
    })));
  }

  /** true once the element has a picture, false if it fails; one set of listeners per element, all taken off by either */
  private picture(v: HTMLVideoElement, url: string): Promise<boolean> {
    let w = this.waits.get(v);
    if (w) return w;
    w = new Promise<boolean>((res) => {
      const end = (ok: boolean) => {
        for (const [e, f] of on) v.removeEventListener(e, f);
        this.waits.delete(v);
        if (ok) this.failed.delete(url); else this.failed.set(url, Date.now());
        res(ok);
      };
      // a seek to an unbuffered point drops a loaded element back to HAVE_METADATA: it ends with seeked, not loadeddata
      const on: Array<[string, () => void]> = [['loadeddata', () => end(true)], ['seeked', () => end(true)], ['error', () => end(false)]];
      for (const [e, f] of on) v.addEventListener(e, f);
    });
    this.waits.set(v, w);
    return w;
  }

  begin() { this.used.clear(); }

  video(ref: MediaRef, parent: HTMLElement, local: number, held = false): HTMLVideoElement {
    const r = this.resolver.video(ref, local);
    // the element this layer showed last frame (sync() takes unused ones out of the page), then one no layer showed, then any
    // free one: in a dissolve between two clips of one file the incoming clip kept switching to the outgoing one's element
    const free = (l: HTMLVideoElement[], ok: (x: HTMLVideoElement) => boolean) => l.find((x) => !this.used.has(x) && ok(x));
    const v = this.el(ref, r.url, (l) => free(l, (x) => x.parentNode === parent) ?? free(l, (x) => !x.parentNode) ?? free(l, () => true));
    if (v.parentNode !== parent) parent.appendChild(v);
    this.used.set(v, { v, mt: clampMediaTime(r.time, v.duration, this.opts.fps), rate: this.resolver.rate(ref), url: r.url, held });
    return v;
  }

  /** A photo source as an <img> inside parent (no seeking or syncing; an export waits for <img> elements to load). */
  image(source: string, parent: HTMLElement): HTMLImageElement {
    if (!this.resolver.image) throw new Error(`No image resolver for photo "${source}"`);
    const im = document.createElement('img');
    im.src = this.resolver.image(source); im.decoding = 'sync'; im.draggable = false;
    parent.appendChild(im);
    return im;
  }

  place(el: HTMLElement, w: number, h: number, crop: Crop, srcW = 1920, srcH = 1080) {
    const b = coverPlacement(srcW, srcH, w, h, crop);
    const s = el.style;
    s.position = 'absolute'; s.maxWidth = 'none';
    s.left = `${b.left}px`; s.top = `${b.top}px`; s.width = `${b.width}px`; s.height = `${b.height}px`;
  }

  /** Lets every video element go (another project is loaded): paused, its source dropped, reset so the browser frees it. */
  dispose() {
    for (const list of this.videos.values()) for (const v of list) { v.pause(); v.removeAttribute('src'); v.load(); v.remove(); }
    this.videos.clear(); this.used.clear(); this.waits.clear(); this.failed.clear();
  }

  stillUrl(ref: StillRef): string { return this.resolver.still(ref); }

  fileUrl(path: string): string {
    if (!this.resolver.file) throw new Error(`Project files are not reachable in this media mode (${path})`);
    return this.resolver.file(path);
  }

  private seek(v: HTMLVideoElement, target: number): Promise<boolean> {
    return new Promise((res) => {
      const done = () => { clearTimeout(timer); res(true); };
      const timer = setTimeout(() => { v.removeEventListener('seeked', done); res(false); }, this.opts.seekTimeout ?? 3000);
      v.addEventListener('seeked', done, { once: true });
      v.currentTime = target;
    });
  }

  /** Preview: resolves once every video used this frame has its picture at the time asked (no seek in flight), or after
   *  `timeout` ms. What reads a video's picture (a WebGL texture in late()) draws again then: sync() does not wait in preview. */
  settled(timeout = 600): Promise<void> {
    // a video that failed stays at readyState 0: it never gets a picture to wait for
    const busy = [...this.used.values()].map((u) => u.v).filter((v) => !v.error && v.networkState !== v.NETWORK_NO_SOURCE && (v.seeking || v.readyState < 2));
    if (!busy.length) return Promise.resolve();
    return new Promise<void>((res) => {
      let left = busy.length;
      const off: Array<() => void> = [];
      const timer = setTimeout(() => { for (const f of off) f(); res(); }, timeout);
      const one = () => { if (--left <= 0) { clearTimeout(timer); res(); } };
      for (const v of busy) {
        const stop = () => { v.removeEventListener('seeked', done); v.removeEventListener('loadeddata', done); };
        const done = () => { stop(); one(); };
        v.addEventListener('seeked', done); v.addEventListener('loadeddata', done);
        off.push(stop);
      }
    });
  }

  async sync(): Promise<void> {
    for (const list of this.videos.values()) for (const v of list) {
      if (!this.used.has(v)) {
        if (!v.paused) v.pause();
        if (v.parentNode) v.parentNode.removeChild(v);
      }
    }
    const fps = this.opts.fps;
    if (this.opts.render) {
      await Promise.all([...this.used.values()].map(async ({ v, mt, url }) => {
        const target = renderSeekTime(mt, fps);
        if (Math.abs(v.currentTime - target) <= 1e-4 && v.readyState >= 2) return;
        // spec §8: retry a stalled seek once, then fail instead of capturing a stale frame
        if (!(await this.seek(v, target)) && !(await this.seek(v, target))) throw new Error(`Seek timed out: ${url} at ${target.toFixed(4)} s`);
      }));
      return;
    }
    for (const { v, mt, rate, held } of this.used.values()) {
      v.playbackRate = rate;
      // a frozen clip shows one frame: played, it ran on and was pulled back every 0.18 s (a stutter that replays)
      if (this.playing && !held) {
        if (Math.abs(v.currentTime - mt) > 0.18) v.currentTime = mt;
        if (v.paused) v.play().catch(() => {});
      } else {
        if (!v.paused) v.pause();
        if (Math.abs(v.currentTime - mt) > 0.02) v.currentTime = mt;
      }
    }
  }
}
