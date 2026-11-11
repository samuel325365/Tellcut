// The editor's live preview: one project at a time, updated in place on every edit (spec §2.1–2.3).
import { AudioEngine, MediaPool, Stage, clamp, createRegistry, parseProject, planAudio, usesThree, videoRefOf, type MediaResolver, type Plugin, type Project, type VideoItem } from '@tellcut/engine';
import { loadThreeKit, plugins as sharedPlugins } from '@tellcut/plugins';
import { importFx, registryWith } from '@tellcut/plugins/browser-fx';
import { CropView, cropFrameLocal, type CropChange } from './crop.ts';
import { SmoothClock } from './clock.ts';
import { drawFrame } from './frame.ts';

export type { CropSel } from '@tellcut/protocol';
import type { CropSel, PlayerError } from '@tellcut/protocol';

/** what the editor words an error by, in its language (err.<code>); the message is the fallback */
export type ErrorCode = Pick<PlayerError, 'code' | 'params' | 'path'>;

export interface SessionDeps {
  stageEl: HTMLElement; resolver: MediaResolver; projectUrl: string;
  onTime(t: number): void; onEnded(): void; onError(itemId: string | undefined, message: string, coded?: ErrorCode): void;
  /** master output peak in dBFS, about 10×/s while playing */
  onLevel?(db: number): void;
  /** after every still frame (seek, edit, pause) and when playback starts: the preview tools redraw */
  onDrawn?(): void;
  /** test seams */
  raf?: (f: () => void) => void; makeAudioContext?: () => AudioContext;
  /** wall clock in seconds (test seam; default performance.now) */
  wallClock?: () => number;
  /** crop mode: where the viewfinder sends its changes, and the size it may use */
  post?: (m: CropChange) => void; viewport?: () => { w: number; h: number };
  /** test seams: how three.js is loaded (default loadThreeKit) and the plugins (default the shared list) */
  loadThree?: () => Promise<unknown>; plugins?: Plugin[];
}

export class PreviewSession {
  /** the shared plugins, then plus the project's own fx once a project is loaded */
  registry;
  private plugins: Plugin[];
  /** the ThreeKit the current stage was built with (undefined: the project uses no 3D) */
  private three: unknown;
  /** three.js would not load for this project: it previews without it, and edits do not try again until the next load() */
  private threeFailed = false;
  private stage!: Stage;
  private pool!: MediaPool;
  private audio!: AudioEngine;
  private project!: Project;
  private t = 0;
  private playing = false;
  private base = 0;
  private from = 0;
  private restart: ReturnType<typeof setTimeout> | undefined;
  /** the audio clock moves in render quanta: frames read an even clock locked to it */
  private clock!: SmoothClock;
  private crop: CropView | null = null;
  private frames = 0;
  private cropSel: CropSel | null = null;
  /** load() is between the new project and its stage (fx, three.js load): a crop asked for then waits for the stage */
  private loading = false;
  private cropLater = false;
  private raf: (f: () => void) => void;
  private resolver: MediaResolver;
  private audioOffline = (url: string, e: Error) =>
    this.d.onError(undefined, `Audio not available (${e.message}): ${url}`, { code: 'player.audioOffline', params: { error: e.message, url } });
  constructor(private d: SessionDeps) {
    this.clock = new SmoothClock(d.wallClock);
    this.raf = d.raf ?? ((f) => { requestAnimationFrame(() => f()); });
    this.plugins = d.plugins ?? sharedPlugins;
    this.registry = createRegistry(this.plugins);
    this.resolver = d.resolver;
  }

  async load(raw: unknown): Promise<number> {
    this.loading = true;
    try { await this.build(raw); } finally { this.loading = false; }
    this.t = 0;
    await this.show();
    if (this.cropLater) { this.cropLater = false; if (this.cropSel) this.showCrop(); }
    return this.project.meta.duration;
  }

  private async build(raw: unknown) {
    this.pause();
    const p = parseProject(raw);
    const fx = await importFx(this.d.projectUrl, p.meta.fx, Date.now());
    for (const e of fx.errors) this.d.onError(undefined, `fx ${e.path}：${e.message}`, e.code ? { code: e.code, params: e.params, path: e.path } : undefined);
    this.registry = registryWith(this.plugins, fx);
    this.project = p;
    this.threeFailed = false;
    this.three = usesThree(p, this.registry) ? await this.loadThree() : undefined;
    // the old pool's <video> elements keep their buffered media until they are emptied
    this.pool?.dispose();
    this.pool = new MediaPool(this.resolver, { render: false, fps: p.meta.fps });
    // the old stage's items let go of their GPU things first: nothing else ever disposes them (a new stage starts empty)
    this.stage?.destroy();
    this.stage = new Stage(this.d.stageEl, this.registry, this.pool, { onError: (id, m, c) => this.d.onError(id, m, c), subpixelZoom: true, three: this.three });
    this.stage.load(p);
    this.audio?.dispose();
    this.audio = this.makeAudio(p);
    await Promise.all([this.pool.preload(this.stage.mediaRefs()), this.stage.ready(), this.audio.load(undefined, this.audioOffline)]);
    void this.audio.prepare().catch(() => {});   // decode now, not on the first play
  }

  async patch(raw: unknown) {
    const p = parseProject(raw), prev = this.project;
    // a changed fx list needs a new registry, so a new stage: start over at the same time
    // so does the first 3D item: the stage is built with three.js
    // and plays on if it was playing: the editor still shows it playing (it only hears of an end), but no time came any more
    if (JSON.stringify(p.meta.fx ?? []) !== JSON.stringify(prev.meta.fx ?? []) || (this.three === undefined && !this.threeFailed && usesThree(p, this.registry))) {
      const t = this.t, was = this.playing || this.starting > 0;
      await this.load(raw);
      if (was) await this.play(t); else await this.seek(t);
      return;
    }
    this.project = p;
    this.stage.update(p);
    // the same engine with the new plan and settings: a magnetic edit changes meta.duration on every drag frame, and
    // recreating the engine closed the AudioContext and decoded every buffer again each time
    this.audio.setPlan(planAudio(p, this.stage.times, this.resolver, this.d.projectUrl), p.meta.mix, p.meta.duration);
    await Promise.all([this.pool.preload(this.stage.mediaRefs()), this.stage.ready(), this.audio.load(undefined, this.audioOffline)]);
    void this.audio.prepare().catch(() => {});   // decode now, not on the first play
    this.t = clamp(this.t, 0, p.meta.duration);
    if (this.cropSel) { this.showCrop(); return; }
    // spec §5: editing while playing rebuilds the audio 150 ms after the last change
    if (this.playing) { clearTimeout(this.restart); this.restart = setTimeout(() => { if (this.playing) void this.play(this.t).catch((e) => { const error = String((e as Error)?.message ?? e); this.d.onError(undefined, error, { code: 'player.playFailed', params: { error } }); }); }, 150); }
    else await this.show();
  }

  /** A source's media is there now (its analysis finished after the preview asked for it): the pool lets go of that source's
   *  elements that have no media yet (MediaPool.retry) and loads new ones, and the still frame is redrawn; the other sources' videos
   *  are left as they are, playing or not, and so is one of this source already showing its picture. Crop mode: its own video of
   *  this source is loaded again if it failed. */
  async mediaReady(source: string) {
    if (!this.stage) return;   // nothing loaded yet: the first load asks for it then
    const dropped = this.pool.retry(source);
    if (dropped) await this.pool.preload(this.stage.mediaRefs().filter((r) => r.source === source));
    // playing: the next frame takes the new element
    if (this.cropSel) { this.showCrop(source); return; }
    if (dropped && !this.busy) await this.show();
  }

  async seek(t: number) { this.pause(); this.t = clamp(t, 0, this.project.meta.duration); await this.show(); }

  /** Every play()/pause() takes a new token; a loop or a starting play() whose token is stale stops. */
  private token = 0;
  private starting = 0;

  async play(from: number): Promise<void> {
    const my = ++this.token;
    this.halt();
    const dur = this.project.meta.duration;
    this.t = clamp(from, 0, dur);
    if (this.t >= dur - 0.05) this.t = 0;
    this.from = this.t;
    this.starting++;
    const engine = this.audio;
    let base: number;
    // a failed start (audio device lost, engine replaced) must not leave the session busy
    try { base = await engine.play(this.t); }
    catch (e) {
      this.starting--;
      // a project-settings patch replaced the audio engine while it was starting: start again on the new one
      if (engine !== this.audio && my === this.token) return this.play(from);
      throw e;
    }
    this.starting--;
    if (my !== this.token) {
      // paused (or re-played) while the audio was starting: silence it unless a newer play is still starting
      if (!this.starting && !this.playing) this.audio.stop();
      return;
    }
    this.base = base;
    this.playing = true;
    this.pool.playing = true;
    this.clock.reset();
    this.d.onDrawn?.();
    this.raf(() => this.loop(my));
  }

  pause() {
    const was = this.playing;
    this.token++; this.halt(); this.audio?.stop();
    // the <video> elements were left playing: redraw the paused frame, which syncs them paused at this time
    // (show() also brings the preview tools back); the meter falls to silence
    if (was) { this.d.onLevel?.(-120); void this.show(); }
  }

  private halt() { clearTimeout(this.restart); this.playing = false; if (this.pool) this.pool.playing = false; }

  private loop(my: number) {
    if (my !== this.token || !this.playing) return;
    const dur = this.project.meta.duration;
    // the audio is scheduled 50 ms ahead of `base`: the first frames would read a time before the start
    this.t = Math.max(this.from, this.from + (this.clock.at(this.audio.now()) - this.base));
    // pause() draws the last frame (it was playing)
    if (this.t >= dur) { this.t = dur; this.pause(); this.d.onEnded(); return; }
    this.stage.draw(this.t);
    void this.pool.sync();
    // the playing videos run on by themselves: their current picture is near enough without waiting for the sync
    this.stage.late(this.t);
    this.d.onTime(this.t);
    if (++this.frames % 6 === 0) this.d.onLevel?.(this.audio.level());
    this.raf(() => this.loop(my));
  }

  /** Crop mode (spec §4.3): the stage is hidden behind the full source frame and its viewfinder. */
  cropMode(sel: CropSel | null) {
    this.cropSel = sel;
    // edits made while cropping were not drawn: redraw on the way out
    if (!sel) { this.crop?.hide(); this.d.stageEl.style.visibility = ''; if (this.stage) void this.show(); return; }
    this.pause();
    this.showCrop();
    this.d.onDrawn?.();
  }

  /** `retry`: a source whose media is there now (mediaReady): the crop view's video of it loads again if it has none */
  private showCrop(retry?: string) {
    if (this.loading) { this.cropLater = true; return; }
    const sel = this.cropSel!, p = this.project;
    const found = p.tracks.flatMap((t) => (t.kind === 'video' ? (t.items as VideoItem[]) : [])).find((i) => i.id === sel.itemId);
    if (!found) { this.cropMode(null); this.d.onError(sel.itemId, 'Crop mode: the clip no longer exists', { code: 'player.cropGone' }); return; }
    // a keyframe deleted while its crop mode is open ends crop mode
    const key = typeof sel.which === 'number' ? found.crop.keys?.[sel.which] : undefined;
    if (typeof sel.which === 'number' && !key) { this.cropMode(null); return; }
    const crop = key ? { x: key.x, y: key.y, zoom: key.zoom } : found.crop[sel.which as 'from' | 'to'];
    const tm = this.stage.times.get(found.id)!, len = tm.end - tm.start;
    // the frame the chosen Ken Burns end point applies to: the first or the last of the clip
    const local = cropFrameLocal(found, len, sel.which, p.meta.fps);
    const r = this.resolver.video(videoRefOf(found, tm.start, tm.end), local);
    const src = p.sources[found.source], [, , fw, fh] = found.frame, image = src.kind === 'image' && !!this.resolver.image;
    this.crop ??= new CropView(this.d.stageEl.parentElement!, (m) => this.d.post?.(m));
    this.d.stageEl.style.visibility = 'hidden';
    this.crop.show({ itemId: found.id, which: sel.which, url: image ? this.resolver.image!(found.source) : r.url, image, time: r.time, srcW: src.width, srcH: src.height,
      frameW: fw * p.meta.width, frameH: fh * p.meta.height, crop, view: this.d.viewport?.() ?? { w: 960, h: 540 }, retry: retry === found.source });
  }

  private async show() {
    const t = this.t;
    await drawFrame(this.stage, this.pool, t);
    // a preview seek lands after sync() returned: a 3D item copying a video's picture draws again once it has
    if (this.three !== undefined) { await this.pool.settled(); if (!this.playing && this.t === t) this.stage.late(t); }
    this.d.onTime(this.t); this.d.onDrawn?.();
  }

  get current(): Project | null { return this.project ?? null; }
  /** playing or cropping: the preview tools stay out of the way */
  get busy() { return this.playing || this.starting > 0 || !!this.cropSel; }

  /** three.js for a project with 3D items; a failed load (an offline chunk) previews without it: the 3D items draw flat */
  private async loadThree(): Promise<unknown> {
    try { return await (this.d.loadThree ?? loadThreeKit)(); }
    catch (e) {
      this.threeFailed = true;
      const error = String((e as Error)?.message ?? e);
      this.d.onError(undefined, `3D not available, previewing flat (${error})`, { code: 'player.noThreeD', params: { error } });
      return undefined;
    }
  }

  private makeAudio(p: Project) {
    const a = new AudioEngine(planAudio(p, this.stage.times, this.resolver, this.d.projectUrl), this.registry.sfx, p.meta.mix, p.meta.duration, this.d.makeAudioContext);
    a.onDecodeError = (k, e) =>
      this.d.onError(undefined, `Audio could not be decoded, skipped when playing (${k}): ${e.message}`, { code: 'player.audioDecode', params: { key: k, error: e.message } });
    return a;
  }
}
