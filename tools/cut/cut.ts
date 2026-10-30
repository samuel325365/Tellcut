// Helpers for a first-cut script, projects/<id>/cut.ts (spec 2026-10-14 §9). Every run starts from the project's
// sources and empty tracks, so a script can be re-run (another song, other picks) and always gives the same result.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';
import { addItem, deleteItems, magneticGaps, parseProject, r6, resolveTimes, SOUND_FILE, split, trimEnd, trimStart, type Crop, type Project, type ThemeInput, type VideoItem } from '@tellcut/engine';
import { loadAllStyles, parseNarration, phraseParts, probeDurationSync, STYLES, voiceFiles, wavDuration, writeProjectFile, type FacesProvider, type VoiceInfo } from '@tellcut/media-node';
import { plugins } from '@tellcut/plugins';
import { PANEL_RADIUS, panelFrame } from '@tellcut/plugin-common';
import { idOfHandle, normalizeHandle } from '@tellcut/protocol';
import { avoidCaptionCrop, BURNED_PAD, captionClear } from './avoid.ts';
import { viewCrop, viewRect, viewHits, type Rect } from './view.ts';
import type { Who } from './follow.ts';
import { parseContent, RECIPES } from './recipes/index.ts';
import { inventory, type Inventory } from './inventory.ts';
import { captionPlan, filmOf, linePlan, secs, wordSpans, type CaptionOptions, type Line, type SpeechPiece, type SrcTime } from './speech.ts';
import { tightenClip } from './tighten.ts';
import { addDucking, addScore, clipSpeech, QUIET_DB, type ScoreRequest } from './mix.ts';
import { resolveAutoFocus, resolveFollows, type FollowReq } from './focus.ts';

type Transition = { type: 'dissolve' | 'slide'; dur: number; dir?: 'l' | 'r' | 'u' | 'd' };
type Frame = [number, number, number, number];
/** A frame is fractions of the screen: pixels (a 1080 × 1920 rectangle) pushed the whole picture off screen with no error,
 *  and the r3b-baking chat spent several turns finding it from the contact sheet. Some bleed past the edges is allowed. */
export function checkFrame(f: Frame | undefined, what: string): void {
  if (!f) return;
  const [x, y, w, h] = f;
  if (f.length !== 4 || f.some((n) => typeof n !== 'number' || !Number.isFinite(n))) throw new Error(`${what} 的 frame 要是 [x, y, 寬, 高] 四個數字`);
  if (f.some((n) => Math.abs(n) > 1.5)) throw new Error(`${what} 的 frame [${f.join(', ')}] 看起來是像素：frame 是畫面的比例（0–1），例如 [0.08, 0.2, 0.84, 0.47]`);
  if (w <= 0 || h <= 0) throw new Error(`${what} 的 frame 寬、高要大於 0`);
  if (x >= 1 || y >= 1 || x + w <= 0 || y + h <= 0) throw new Error(`${what} 的 frame [${f.join(', ')}] 整個在畫面外`);
}
const STILL: Crop = { x: 0.5, y: 0.5, zoom: 1 };
/** a clip's crop: the full move, or the short form — where it starts (x, y, zoom; default the centre at 1) and what changes by the
 *  end (`to`: any of x, y, zoom; `push`: the zoom times this) — that every cut.ts used to write its own helper for */
export type CropIn = { from: Crop; to: Crop } | { x?: number; y?: number; zoom?: number; to?: Partial<Crop>; push?: number };
export function cropOf(c: CropIn | undefined, what: string): { from: Crop; to: Crop } | undefined {
  if (!c) return undefined;
  if ('from' in c) return c;
  const from: Crop = { x: c.x ?? 0.5, y: c.y ?? 0.5, zoom: c.zoom ?? 1 };
  const to: Crop = { x: c.to?.x ?? from.x, y: c.to?.y ?? from.y, zoom: c.to?.zoom ?? r6(from.zoom * (c.push ?? 1)) };
  for (const [k, v] of Object.entries({ x: from.x, y: from.y, zoom: from.zoom, 'to.x': to.x, 'to.y': to.y, 'to.zoom': to.zoom }))
    if (typeof v !== 'number' || !Number.isFinite(v) || (k.endsWith('zoom') && v <= 0)) throw new Error(`${what} 的 crop.${k} 要是數字${k.endsWith('zoom') ? '（大於 0）' : ''}，現在是 ${v}`);
  return { from, to };
}

const TRACKS = () => [
  // the main track is magnetic (spec 2026-10-15-proposals-magnetic §4.1): later edits ripple
  { id: 'v1', kind: 'video', name: 'Main', magnetic: true, items: [] }, { id: 'text', kind: 'overlay', name: 'Text', items: [] },
  { id: 'music', kind: 'music', name: 'Music', gain: 0, items: [] }, { id: 'orig', kind: 'audio', name: 'Source', gain: 0, items: [] },
];
/** a narration scene on the timeline (Cut.voice) */
export interface VoicePlaced { id: string; start: number; end: number; phrases: Array<{ text: string; t0: number; t1: number; gloss?: string }> }
const hash = (s: string) => createHash('sha1').update(s).digest('hex');
/** the shared backgrounds (common.*, kind 'scene'): c.effect puts them under the video. Legacy full-screen scenes (kyoto.*) are not backgrounds */
const SCENE_TYPES = new Set(plugins.flatMap((p) => p.items ?? []).filter((t) => t?.kind === 'scene' && t.type.startsWith('common.')).map((t) => t!.type));
/** a gallery handle (MRK-03) where a type id belongs: handles are only for pointing, the project keeps type ids */
function notAHandle(type: string, call: string) {
  if (!normalizeHandle(type)) return;
  const id = idOfHandle(type);
  throw new Error(`${call}('${type}')：${type} 是圖鑑代號，cut.ts 要寫類型 id${id ? `：${call}('${id}', …)` : '（也沒有這個代號；查 npm run tellcut -- catalog --find <關鍵字>）'}`);
}
const stateFile = (dir: string) => join(dir, 'cache', 'cut-state.json');
/** c.effect / c.sfx `params: { … }`: the block's params whose names the call's own options take (at, len, who…) */
function ownParams(v: unknown, call: string): Record<string, unknown> {
  if (v === undefined) return {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error(`${call} 的 params 要是物件（積木參數，例如 { at: '0.5,1.2' }），現在是 ${JSON.stringify(v)}`);
  return v as Record<string, unknown>;
}

/** project.json changed since the last cut wrote it (edited in the editor). A torn cut-state.json is no record, like none. */
export function editedSinceCut(dir: string): boolean {
  const f = join(dir, 'project.json');
  if (!existsSync(stateFile(dir)) || !existsSync(f)) return false;
  let was: unknown;
  try { was = JSON.parse(readFileSync(stateFile(dir), 'utf8'))?.hash; } catch { return false; }
  return was !== hash(readFileSync(f, 'utf8'));
}
const fileHash = (dir: string) => { const f = join(dir, 'project.json'); return existsSync(f) ? hash(readFileSync(f, 'utf8')) : null; };
/** project.json changed while the cut ran (save() refuses to write over it): tools/cut.ts prints the message */
export class EditedDuringCut extends Error {}

export class Cut {
  private cursor = 0;
  private end = 0;
  /** set by panel(): the rectangle the picture lives in, so clips come with it and save() adds the backdrop and the frame */
  private layout: { frame: [number, number, number, number]; radius: number; backdrop: Record<string, unknown> | false | 'blur'; border: Record<string, unknown> | false } | null = null;
  /** set by score(): generated at save() to the film's length */
  private scoreReq: ScoreRequest | null = null;
  private duckDb: number | false = -10;
  /** duck under the speech in the clips too, not only under the narration */
  private duckSpeech = true;
  /** drops of the music asked for with dip() */
  private dips: Array<{ at: number; len: number; db: number }> = [];
  /** the music's level over the film (level()): [film seconds, gain as a multiple], smoothstep between */
  private curve: Array<[number, number]> = [];
  private song: { media: string; from: number; gain: number; fadeIn: number; fadeOut: number } | null = null;
  /** stickers to put on a mouth or a face at save() (effect({ follow })) */
  private follows: FollowReq[] = [];
  /** clips without a crop of their own: their focus goes to the faces in them at save() */
  private autoFocus: string[][] = [];
  /** clip(…, { duck }) by clip id (the pieces tighten() makes of one get its value): true, false or the dB its speech ducks to */
  private duckOf = new Map<string, boolean | number>();
  /** what save() did on its own (auto-focus, stickers following faces): tools/cut.ts prints it */
  readonly notes: string[] = [];

  constructor(readonly p: Project, readonly inv: Inventory, readonly dir: string) {
    this.p.tracks = TRACKS() as Project['tracks'];
    this.p.grids = [];
    // what an earlier run of the script set is the script's to set again: a removed c.theme()/c.fx() must not linger
    // (generated narration/music no item uses any more is dropped at save(), see pruneGenerated)
    delete this.p.meta.theme;
    delete this.p.meta.fx;
  }
  /** Generated narration and music (media/voice/…, media/score-…) that no item uses: an earlier run's, dropped. Imported media
   *  stays, and so does a score made by `npm run score` that the script uses through c.music(). */
  private pruneGenerated() {
    const used = new Set(this.p.tracks.flatMap((t) => (t.items as Array<{ media?: string }>).map((i) => i.media).filter(Boolean)));
    for (const [k, m] of Object.entries(this.p.media)) if (/^media\/(voice\/|score-)/.test(m.path) && !used.has(k)) delete this.p.media[k];
  }
  /** project.json as open() read it, and whether save() may write over a change since (--force) */
  private opened?: { hash: string | null; force: boolean };
  static async open(dir: string, o: { transcribe?: boolean; log?: (s: string) => void; force?: boolean } = {}) {
    // read in the same tick as inventory()'s own read of project.json, before any analysis awaits
    const opened = { hash: fileHash(dir), force: !!o.force };
    const inv = await inventory(dir, o);
    const c = new Cut(structuredClone(inv.project), inv, dir);
    c.opened = opened;
    // the score-library's and the project's own music styles: beatLen needs their bpm before the music is composed
    try { for (const s of Object.values((await loadAllStyles(dir)).styles)) c.styleBpm[s.id] = s.defaults.bpm; } catch { /* a broken style is score()'s to report */ }
    return c;
  }
  /** default bpm of the music styles that are not built in (open() fills it) */
  private styleBpm: Record<string, number> = {};
  /** a music style's own tempo: built in, the score library's or the project's (undefined: no such style) */
  bpmOf(style: string): number | undefined { return STYLES[style]?.defaults.bpm ?? this.styleBpm[style]; }

  get time() { return this.cursor; }
  at(t: number) { this.cursor = r6(Math.max(0, t)); return this; }
  private bump(t: number) { this.end = Math.max(this.end, r6(t)); }
  private src(id: string) { const s = this.p.sources[id]; if (!s) throw new Error(`No source "${id}"`); return s; }
  /** The crop that keeps the footage's own burned-in caption out of the frame, when this stretch of the source has one in view (toolkit phase 2d). */
  private avoidBurned(source: string, from: number, to: number, crop: { from: Crop; to: Crop }): { from: Crop; to: Crop } {
    const cap = this.inv.sources.find((x) => x.id === source)?.burned?.caption, src = this.p.sources[source];
    if (!cap || !src || !cap.spans.some(([a, b]) => a - BURNED_PAD < to && b + BURNED_PAD > from)) return crop;
    const [, , fw, fh] = this.layout?.frame ?? [0, 0, 1, 1], o = { srcW: src.width, srcH: src.height, frameW: fw * this.p.meta.width, frameH: fh * this.p.meta.height, captionTop: cap.rect[1] };
    const fix = (c: Crop): Crop => {
      if (captionClear(o, c)) return c;
      const r = avoidCaptionCrop({ ...o, want: c });
      if (!r) console.error(`avoidBurned: ${source} ${from.toFixed(1)}–${to.toFixed(1)} s：放大到 2.2 倍也避不開燒進去的字幕，沒有改裁切`);
      return r ?? c;
    };
    return { ...crop, from: fix(crop.from), to: fix(crop.to) };
  }
  private frameFields(frame?: Frame) { return frame ? { frame } : this.layout ? { frame: this.layout.frame, radius: this.layout.radius } : {}; }
  /** a transition overlaps the previous clip by its own length: it stays linked to the overlap */
  private startFor(tr?: Transition) { return tr ? r6(Math.max(0, this.cursor - tr.dur)) : this.cursor; }

  /**
   * `frame` [x, y, w, h]: the rectangle of the screen the picture lives in (a window of common.postcard / common.frame, a band…), instead of the whole screen or the panel.
   * `from` may be written as the player shows it ('1:23.5'). `duck`: whether speech in this clip's own sound ducks the music — true,
   * false, or the dB to duck to (default: it does unless the clip's sound is at QUIET_DB or lower, room tone under a montage).
   */
  clip(source: string, o: { from?: SrcTime; len: number; speed?: number; crop?: CropIn; transition?: Transition; sound?: boolean; gain?: number; avoidBurned?: boolean; frame?: Frame; duck?: boolean | number }): string {
    checkFrame(o.frame, `c.clip('${source}')`);
    const s = this.src(source), crop0 = cropOf(o.crop, `c.clip('${source}')`);
    if (s.kind === 'image') {
      // a photo among clips (a recipe's shot list): its crop / focus is kept, not dropped
      const id = this.photo(source, { len: o.len, transition: o.transition, frame: o.frame });
      if (crop0) (this.p.tracks.find((t) => t.id === 'v1')!.items.find((i) => i.id === id) as { crop: unknown }).crop = crop0;
      return id;
    }
    const speed = o.speed ?? 1, from = secs(o.from ?? 0, `c.clip('${source}') 的 from`), len = r6(Math.min(o.len, (s.duration - from) / speed));
    if (!(len > 0)) throw new Error(`A clip of "${source}" from ${from} s has no length`);
    const start = this.startFor(o.transition);
    const crop = o.avoidBurned ? this.avoidBurned(source, from, from + len * speed, crop0 ?? { from: STILL, to: STILL }) : (crop0 ?? { from: STILL, to: STILL });
    const id = addItem(this.p, { track: 'v1', item: { source, in: from, speed, start, end: r6(start + len), crop, ...this.frameFields(o.frame), ...(o.transition ? { transitionIn: o.transition } : {}) } });
    // no crop asked for and the picture does not fit the frame's shape: at save() its focus goes to the faces in it (phase 5)
    if (!crop0) this.autoFocus.push([id]);
    if (o.duck !== undefined) this.duckOf.set(id, o.duck);
    if ((o.sound ?? true) && s.audio !== false) {
      const edge = r6(Math.min(0.1, len / 4));
      addItem(this.p, { track: 'orig', item: { source, in: from, rate: speed, start: 0, end: len, gain: o.gain ?? 0, fadeIn: edge, fadeOut: edge, parent: id } });
    }
    this.cursor = r6(start + len); this.bump(this.cursor);
    return id;
  }

  /**
   * Shorten the pauses in a talk clip (an idea from OpenMontage's silence cutter, done on the transcript's word times): every
   * silence longer than `maxGap` between two words — and before the first / after the last — shrinks to `keep` seconds (half
   * on each side). The clip is cut with the engine's split and the pauses ripple-deleted; the clip's own sound is cut with it
   * (a short fade at every join), its crop is spread over the pieces so the move runs on without a jump, a transition into it
   * stays, and an automatic face focus is worked out once for all the pieces. Only the newest clip on the main track, before
   * anything is attached to it (captions, stickers come after). Returns the pieces, in order.
   */
  tighten(clipId: string, o: { maxGap?: number; keep?: number } = {}): string[] {
    const r = tightenClip(this.p, clipId, (s) => this.transcriptOf(s), o, this.autoFocus);
    if (r.note) this.notes.push(r.note);
    const duck = this.duckOf.get(clipId);
    if (duck !== undefined) for (const id of r.ids) this.duckOf.set(id, duck);
    if (!r.cut) return r.ids;
    const v1 = this.p.tracks.find((t) => t.id === 'v1')!.items as VideoItem[];
    this.cursor = r6(v1.find((c) => c.id === r.ids[r.ids.length - 1])!.end);
    // other items (an effect laid over the clip, a title) did not move: the film ends where the last thing ends
    const times = resolveTimes(this.p), music = new Set(this.p.tracks.filter((t) => t.kind === 'music').flatMap((t) => (t.items as Array<{ id: string; toEnd?: boolean }>).filter((i) => i.toEnd).map((i) => i.id)));
    this.end = r6(Math.max(this.cursor, ...this.p.tracks.flatMap((t) => (t.items as Array<{ id: string; parent?: string }>).filter((i) => i.parent === undefined && !music.has(i.id)).map((i) => times.get(i.id)!.end))));
    return r.ids;
  }

  photo(source: string, o: { len?: number; zoom?: [number, number]; focus?: [number, number]; transition?: Transition; frame?: Frame } = {}): string {
    checkFrame(o.frame, `c.photo('${source}')`);
    if (this.src(source).kind !== 'image') throw new Error(`"${source}" is not a photo`);
    const len = o.len ?? 3, [z0, z1] = o.zoom ?? [1, 1.1], [x, y] = o.focus ?? [0.5, 0.5], start = this.startFor(o.transition);
    const id = addItem(this.p, { track: 'v1', item: { source, in: 0, speed: 1, start, end: r6(start + len), crop: { from: { x, y, zoom: z0 }, to: { x, y, zoom: z1 } }, ...this.frameFields(o.frame), ...(o.transition ? { transitionIn: o.transition } : {}) } });
    this.cursor = r6(start + len); this.bump(this.cursor);
    return id;
  }

  /**
   * The crop that shows the part of `source` centred on `at` [x, y] (fractions of the source) at `zoom` (1 = the frame just covered by
   * the whole picture), kept inside the picture: one camera cut into virtual ones (a close-up and a medium shot of a two-shot, each person
   * of a split screen). `frame` is the [x, y, w, h] the clip plays in (default: the panel's, else the whole screen). It throws when the
   * view would show a `keepOut` rectangle [left, top, right, bottom] of the source (a watermark…) or — unless `burned: false` — the
   * footage's own burned-in caption row the inventory found. Pass the result as a clip's crop: { from: c.view(…), to: c.view(…, zoom 1.05) }.
   */
  view(source: string, o: { at: [number, number]; zoom?: number; frame?: Frame; keepOut?: Rect[]; burned?: boolean; what?: string }): Crop {
    checkFrame(o.frame, `c.view('${source}')`);
    const s = this.src(source), [, , fw, fh] = o.frame ?? this.layout?.frame ?? [0, 0, 1, 1], W = fw * this.p.meta.width, H = fh * this.p.meta.height;
    const crop = viewCrop(s.width, s.height, W, H, o.at[0], o.at[1], o.zoom ?? 1), view = viewRect(s.width, s.height, W, H, crop);
    const cap = o.burned === false ? null : this.inv.sources.find((x) => x.id === source)?.burned?.caption;
    const keep: Array<[Rect, string]> = [...(o.keepOut ?? []).map((r) => [r, '禁區'] as [Rect, string]),
      ...(cap ? [[[cap.rect[0], cap.rect[1] - 0.012, cap.rect[0] + cap.rect[2], cap.rect[1] + cap.rect[3]], '原片燒進去的字幕'] as [Rect, string]] : [])];
    const f = (r: Rect) => r.map((x) => x.toFixed(3)).join(', ');
    for (const [r, name] of keep) if (viewHits(view, [r]).length)
      throw new Error(`view(${source}${o.what ? `，${o.what}` : ''})：畫面會露出${name}（看到的範圍 ${f(view)}，${name} ${f(r)}）；把 at 移開或放大 zoom`);
    return crop;
  }

  /**
   * A landscape shot as `count` cinemascope bands stacked across a tall frame (the uk-beat short's Arc de Triomphe): band 0 goes on the
   * main track at the cursor (the cursor moves on by `len`), the others on video tracks of their own (v2, v3…, made right above v1 when
   * missing), each slamming in `every` seconds after the one before (default: the length split evenly, one more step than bands), all
   * ending together. Each band shows its own stretch of the source (`from`) and its own crop (a wide view, a close-up of a detail…).
   * `ratio` is a band's width ÷ height (2.7 ≈ 1080 × 400 in a 9:16 film), `gap` the space between bands as a share of the frame height;
   * the stack is centred. No sound (cut to the music). Returns the ids, top band first.
   */
  bands(source: string, o: { len: number; from?: SrcTime[]; crops?: Array<{ from: Crop; to: Crop }>; count?: number; every?: number; ratio?: number; gap?: number }): string[] {
    const s = this.src(source), n = Math.max(1, Math.round(o.count ?? o.from?.length ?? o.crops?.length ?? 3)), { width: W, height: H } = this.p.meta;
    const gap = o.gap ?? 20 / 1920, bh = Math.min((1 - (n - 1) * gap) / n, W / (o.ratio ?? 2.7) / H), top = (1 - n * bh - (n - 1) * gap) / 2;
    const frame = (i: number): Frame => [0, r6(top + i * (bh + gap)), 1, r6(bh)], every = o.every ?? o.len / (n + 1), t0 = this.cursor;
    const at = (i: number) => secs(o.from?.[i] ?? 0, `c.bands('${source}') 的 from[${i}]`);
    const ids = [this.clip(source, { from: at(0), len: o.len, crop: o.crops?.[0], sound: false, frame: frame(0) })];
    const end = this.cursor, v1 = this.p.tracks.findIndex((t) => t.id === 'v1');
    for (let i = 1; i < n; i++) {
      const track = `v${i + 1}`, start = r6(Math.min(end - 1 / this.p.meta.fps, t0 + i * every));
      if (!this.p.tracks.some((t) => t.id === track)) this.p.tracks.splice(v1 + i, 0, { id: track, kind: 'video', name: `Layer ${i + 1}`, items: [] } as Project['tracks'][number]);
      const from = Math.max(0, Math.min(at(i), s.duration - (end - start)));
      ids.push(addItem(this.p, { track, item: { source, in: r6(from), speed: 1, start, end, crop: o.crops?.[i] ?? { from: STILL, to: STILL }, frame: frame(i) } }));
    }
    return ids;
  }

  private text(type: string, at: number, len: number, params: Record<string, unknown>, parent?: string): string {
    const id = addItem(this.p, { track: 'text', item: { type, start: r6(at), end: r6(at + len), params, ...(parent ? { parent } : {}) } });
    if (!parent) this.bump(at + len);
    return id;
  }
  title(text: string, o: { at?: number; len?: number; [k: string]: unknown } = {}) { const { at = this.cursor, len = 3, ...rest } = o; return this.text('core.title', at as number, len as number, { text, ...rest }); }
  caption(text: string, o: { at: number; len: number; [k: string]: unknown }) { const { at, len, ...rest } = o; return this.text('core.caption', at, len, { text, ...rest }); }
  lowerThird(main: string, sub: string, o: { at?: number; len?: number; [k: string]: unknown } = {}) {
    const { at = this.cursor, len = 3, ...rest } = o; return this.text('core.lowerThird', at as number, len as number, { text: main, sub, ...rest });
  }
  /** after everything else */
  endCard(lines: string[], o: { len?: number; [k: string]: unknown } = {}) { const { len = 5, ...rest } = o; return this.text('core.endCard', this.end, len as number, { text: lines.join('\n'), ...rest }); }

  /**
   * Lay out a whole kind of video from a data object (toolkit phase 4): travel, hook, montage. `npm run tellcut -- recipe <id>` shows the
   * content to fill in. Everything it makes is ordinary timeline items: add more after it, or change any of it in the editor.
   */
  recipe(id: string, content: unknown): Record<string, unknown> {
    const data = parseContent(id, content);
    return RECIPES[id].run(this, data);
  }

  /**
   * Change an item already on the timeline (one a recipe made, say): `params` are merged into its params, `transform` replaces its
   * transform, `start`/`end` trim it — in the item's own times (relative to its clip when it is attached to one), and through the
   * engine's trim, so what is attached to it follows and it never gets shorter than a frame. Returns the item.
   */
  update(id: string, patch: { params?: Record<string, unknown>; transform?: { x: number; y: number; scale: number }; start?: number; end?: number }) {
    const it = this.p.tracks.flatMap((t) => t.items as Array<{ id: string; start: number; end: number; params?: Record<string, unknown>; transform?: unknown }>).find((i) => i.id === id);
    if (!it) throw new Error(`時間軸上沒有「${id}」`);
    if (patch.params) it.params = { ...(it.params ?? {}), ...patch.params };
    if (patch.transform) it.transform = { ox: 0.5, oy: 0.5, ...patch.transform };
    if (patch.end !== undefined) trimEnd(this.p, { id, dt: r6(patch.end - it.end) });
    if (patch.start !== undefined) trimStart(this.p, { id, dt: r6(patch.start - it.start) });
    return it;
  }
  /** Take an item off the timeline (and anything attached to it). */
  remove(id: string) { deleteItems(this.p, { ids: [id] }); return this; }

  /** The look the common blocks share (palette, fonts, safe, radius, stroke): only the fields given are changed. */
  theme(t: ThemeInput) {
    const cur = (this.p.meta.theme ??= {});
    for (const [key, v] of Object.entries(t)) (cur as Record<string, unknown>)[key] = v && typeof v === 'object' ? { ...((cur as Record<string, any>)[key] ?? {}), ...v } : v;
    return this;
  }
  /**
   * The panel layout: the picture shrinks into `frame` (x, y, w, h as fractions of the screen; default: one that fits the film's shape) with rounded corners, a patterned backdrop
   * goes under it and a border over it. Declare it before the first clip. `backdrop` / `border` are params for common.backdrop / common.panel, or false to leave one out.
   * `backdrop: 'blur'`: under each clip its own picture fills the screen, blurred and dimmed — landscape footage in a portrait film
   * leaves no empty band then.
   */
  panel(o: { frame?: [number, number, number, number]; radius?: number; backdrop?: Record<string, unknown> | false | 'blur'; border?: Record<string, unknown> | false } = {}) {
    checkFrame(o.frame, 'c.panel');
    this.layout = { frame: o.frame ?? panelFrame(this.p.meta.width, this.p.meta.height), radius: o.radius ?? PANEL_RADIUS, backdrop: o.backdrop ?? {}, border: o.border ?? {} };
    return this;
  }
  /** Register a project-local effect module (projects/<id>/fx/<name>.js, toolkit phase 2a); its types start with fx. */
  fx(path: string) { const l = (this.p.meta.fx ??= []); if (!l.includes(path)) l.push(path); return this; }
  /**
   * Any item type (an fx or a built-in effect) on the text track, `len` seconds from `at` (default: the cursor).
   * `follow: 'mouth' | 'face'` (toolkit phase 5): it sits on the mouth (or face) of a person in the clip under it (or `clip`) and
   * moves with them — `who` picks the person when there are several (largest, left, right, center). Worked out at save().
   * `layer: 'under'` puts it under the video like the shared backgrounds (a project's own paper or stage fx: its kind does not
   * decide, since a project 'scene' can as well be a full-screen picture meant on top).
   * Other keys are the block's params; `params: { … }` holds params whose names the options above take (common.progress's `at`,
   * common.quote's `who`): they win over the loose keys.
   */
  effect(type: string, o: { at?: number; len: number; layer?: 'top' | 'under'; transform?: { x: number; y: number; scale: number }; follow?: 'mouth' | 'face'; who?: Who; clip?: string; params?: Record<string, unknown>; [k: string]: unknown }) {
    notAHandle(type, 'c.effect');
    const { at = this.cursor, len, layer, transform, follow, who, clip, params: own, ...rest } = o, params = { ...rest, ...ownParams(own, `c.effect('${type}')`) };
    let id: string;
    if (layer !== undefined && layer !== 'top' && layer !== 'under') throw new Error(`c.effect('${type}')：layer 只能是 'top' 或 'under'`);
    if (SCENE_TYPES.has(type) || layer === 'under') {
      // a background (common.ambient…) goes under the video, on its own scene track; it fills the frame, so it cannot move or follow
      const odd = Object.entries({ transform, follow, who, clip }).filter(([, v]) => v !== undefined).map(([k]) => k);
      if (odd.length) throw new Error(`${type} 是背景積木，鋪滿整個畫面、放在影片下面：不能給 ${odd.join('／')}`);
      if (SCENE_TYPES.has(type) && layer === 'top') throw new Error(`${type} 是背景積木，一定在影片下面：不能給 layer: 'top'`);
      this.track('bgfx', 'scene', 'Background FX', 0);
      id = addItem(this.p, { track: 'bgfx', item: { type, start: r6(at as number), end: r6((at as number) + len), params } });
      this.bump((at as number) + len);
    } else if (layer !== 'top') { id = this.text(type, at as number, len, params); if (transform) this.setTransform(id, transform); }
    else {
      // `layer: 'top'` puts it on its own overlay track above the text (film grain, vignette, flashes over the captions)
      this.track('top', 'overlay', 'Top', this.p.tracks.findIndex((t) => t.id === 'text') + 1);
      id = addItem(this.p, { track: 'top', item: { type, start: r6(at as number), end: r6((at as number) + len), params, ...(transform ? { transform } : {}) } });
      this.bump((at as number) + len);
    }
    if (follow) this.follows.push({ id, follow, who: who ?? 'largest', clip });
    return id;
  }
  /**
   * Camera shake (toolkit phase 5): the picture of whatever clip plays at film time `at` shakes for `dur` seconds, up to `px`
   * pixels, dying away. A shake across a cut is given to both clips. Impacts, slams, a punchline.
   */
  shake(at: number, o: { dur?: number; px?: number; hz?: number } = {}) {
    const dur = o.dur ?? 0.4, px = o.px ?? 24, hz = o.hz ?? 18, times = resolveTimes(this.p);
    const clips = (this.p.tracks.find((t) => t.id === 'v1')?.items ?? []) as VideoItem[];
    const hit = clips.filter((c) => { const ct = times.get(c.id)!; return ct.start < at + dur && ct.end > at; });
    if (!hit.length) throw new Error(`shake：${at} 秒沒有影片片段`);
    for (const c of hit) (c.shake ??= []).push({ at: r6(at - times.get(c.id)!.start), dur, px, hz });   // clip-local seconds
    return this;
  }
  /**
   * Attach an item to a clip: its times become relative to the clip, so it moves (and is deleted) with it when the main track
   * is edited later — a bleep, a censor sticker or a badge must never drift off the moment it belongs to. Returns the item id.
   */
  attach(id: string, clipId: string): string {
    const it = this.p.tracks.flatMap((t) => t.items as Array<{ id: string; start: number; end: number; parent?: string }>).find((i) => i.id === id);
    const at = resolveTimes(this.p).get(clipId);
    if (!it || !at) throw new Error(`attach：時間軸上沒有「${!it ? id : clipId}」`);
    if (it.parent) return id;
    it.start = r6(it.start - at.start); it.end = r6(it.end - at.start); it.parent = clipId;
    return id;
  }
  /**
   * Freeze the moment playing at `at` into an instant photo (common.polaroid): the clip under it gives the source and the source
   * second; a shutter goes with it (`sound: false` for none). Both ride on the clip. Other keys are the block's params.
   */
  polaroid(o: { at?: number; len?: number; sound?: boolean; [k: string]: unknown } = {}): string {
    const { at = this.cursor, len = 2.5, sound = true, ...params } = o, times = resolveTimes(this.p);
    const clip = (this.p.tracks.find((t) => t.id === 'v1')?.items as VideoItem[] | undefined)?.find((c) => { const ct = times.get(c.id)!; return ct.start <= (at as number) + 1e-6 && ct.end > (at as number); });
    if (!clip) throw new Error(`polaroid：${at} 秒沒有片段可以定格`);
    const t = r6(clip.in + ((at as number) - times.get(clip.id)!.start) * clip.speed);
    const id = this.attach(this.effect('common.polaroid', { at: at as number, len: len as number, ...params, source: clip.source, t }), clip.id);
    if (sound) this.attach(this.sfx('common.shutter', { at: at as number, len: 0.2, gain: -6 }), clip.id);
    return id;
  }
  private setTransform(id: string, transform: { x: number; y: number; scale: number }) {
    const it = this.p.tracks.flatMap((t) => t.items as Array<{ id: string; transform?: unknown }>).find((i) => i.id === id);
    if (it) it.transform = { ox: 0.5, oy: 0.5, ...transform };
  }
  /** A sound effect (an sfx type such as common.beep) `len` seconds from `at` (default: the cursor); `gain` in dB, other keys are its
   *  params — `params: { … }` for one named like an option (common.shing's `len`). */
  sfx(type: string, o: { at?: number; len?: number; gain?: number; params?: Record<string, unknown>; [k: string]: unknown }) {
    notAHandle(type, 'c.sfx');
    const { at = this.cursor, len = 1, gain = -8, params: own, ...rest } = o, params = { ...rest, ...ownParams(own, `c.sfx('${type}')`) };
    this.track('sfx', 'sfx', 'SFX', this.p.tracks.length);
    return addItem(this.p, { track: 'sfx', item: { type, start: r6(at as number), end: r6((at as number) + len), params, gain } });
  }
  /**
   * A sound file of the project as a sound effect at `at` (default: the cursor): `path` is relative to the project folder (e.g.
   * media/sfx/ding.wav, a WAV the project synthesised itself). It goes on the same sound-effect track as sfx(), so it is never
   * ducked under speech and the check does not take it for music. `len` defaults to the file's length (never longer); `gain` in dB.
   */
  sfxFile(path: string, o: { at?: number; gain?: number; len?: number } = {}) {
    const rel = path.replace(/\\/g, '/').replace(/^(\.\/)+/, ''), file = resolve(this.dir, rel), r = relative(resolve(this.dir), file);
    if (!rel || isAbsolute(path) || !r || r.startsWith('..') || isAbsolute(r)) throw new Error(`sfxFile：「${path}」要是專案資料夾裡的相對路徑（例如 media/sfx/ding.wav）`);
    if (!existsSync(file)) throw new Error(`sfxFile：找不到音效檔 ${rel}（${file}）。先把它產生出來（例如 node projects/${basename(this.dir)}/sfx/make.mjs），路徑相對於專案資料夾`);
    const full = this.fileLen(file), at = r6(o.at ?? this.cursor), len = r6(Math.min(o.len ?? full, full));
    if (!(len > 0)) throw new Error(`sfxFile：${rel} 的長度是 ${len} 秒`);
    this.track('sfx', 'sfx', 'SFX', this.p.tracks.length);
    return addItem(this.p, { track: 'sfx', item: { type: SOUND_FILE, label: basename(rel).replace(/\.[^.]+$/, ''), start: at, end: r6(at + len), params: { path: rel }, gain: o.gain ?? -8 } });
  }
  /** seconds of a sound file (a WAV from its header, anything else through ffprobe), once per file */
  private fileLens = new Map<string, number>();
  private fileLen(file: string): number {
    let d = this.fileLens.get(file);
    if (d === undefined) { d = wavDuration(readFileSync(file)) ?? probeDurationSync(file); this.fileLens.set(file, d); }
    if (!Number.isFinite(d)) throw new Error(`sfxFile：讀不出 ${file} 的長度（不是音檔？）`);
    return d;
  }
  /** Cut the original sound out of the clips for `len` seconds from `at` (default: the cursor), so a bleep (common.beep) replaces the word. */
  bleepOut(o: { at?: number; len: number }) {
    const a = r6(o.at ?? this.cursor), b = r6(a + o.len), orig = (this.p.tracks.find((t) => t.id === 'orig')?.items ?? []) as Array<{ id: string }>;
    const ids = orig.map((i) => i.id);
    if (!ids.length) return this;
    split(this.p, { t: a, ids });
    split(this.p, { t: b, ids: (this.p.tracks.find((t) => t.id === 'orig')!.items as Array<{ id: string }>).map((i) => i.id) });
    // split will not cut less than a frame from an edge: such a sliver goes with the cut-out part (the word reaches the edge)
    const times = resolveTimes(this.p), m = 1 / this.p.meta.fps + 1e-3;
    const inside = (this.p.tracks.find((t) => t.id === 'orig')!.items as Array<{ id: string }>).filter((i) => { const t = times.get(i.id)!; return t.start >= a - m && t.end <= b + m; }).map((i) => i.id);
    if (inside.length) deleteItems(this.p, { ids: inside });
    return this;
  }
  /** a source's transcript (null/undefined: none yet) */
  private transcriptOf(source: string) { return this.inv.sources.find((s) => s.id === source)?.transcript; }
  private addLayout(duration: number) {
    const l = this.layout;
    if (!l) return;
    const [x, y, w, h] = l.frame;
    if (l.backdrop === 'blur') {
      // each clip's own picture, full screen, blurred and dimmed, under it; it rides on the clip, so later edits carry it along
      // over the film's own backgrounds (common.ambient…), under the clips
      this.track('bgv', 'video', 'Blurred fill', this.p.tracks.findIndex((t) => t.id === 'v1'));
      for (const it of this.p.tracks.find((t) => t.id === 'v1')!.items as VideoItem[]) {
        const z = (k: 'from' | 'to') => ({ ...it.crop[k], zoom: Math.max(1.15, it.crop[k].zoom) });
        addItem(this.p, { track: 'bgv', item: { source: it.source, in: it.in, speed: it.speed, start: 0, end: r6(it.end - it.start), parent: it.id,
          frame: [0, 0, 1, 1], crop: { from: z('from'), to: z('to') }, defocus: { from: 0, to: 0, px: 40, px0: 40 }, opacity: 0.55 } });
      }
    } else if (l.backdrop !== false) {
      this.track('bg', 'scene', 'Background', 0);
      addItem(this.p, { track: 'bg', item: { type: 'common.backdrop', start: 0, end: duration, params: l.backdrop } });
    }
    if (l.border !== false) {
      this.track('panel', 'overlay', 'Panel frame', this.p.tracks.findIndex((t) => t.id === 'v1') + 1);
      addItem(this.p, { track: 'panel', item: { type: 'common.panel', start: 0, end: duration, params: { x, y, w, h, radius: l.radius, ...l.border } } });
    }
  }
  /**
   * At save(): what lies within one clip of the main track — a card or a background over that shot, a flash at its start, a sound
   * on its moment, a band of c.bands — rides on that clip, so trimming, moving or ripple-deleting the clip in the editor carries it
   * along (or takes it away) instead of leaving it over another shot. What runs across a cut keeps its place in the film: a title
   * over two shots, film grain over all of them, a whoosh on the cut, music and narration belong to no one clip, and hanging
   * them on the first would make a trim of that clip drag them off the others. The script itself works in film seconds
   * throughout (c.update's start / end are relative to a clip only for what it attached itself). The panel layout's own
   * backdrop and frame span the film and stay; sound on the source and narration tracks is placed by film time on purpose.
   */
  private attachToShots() {
    const times = resolveTimes(this.p), eps = 1e-6;
    const shots = (this.p.tracks.find((t) => t.id === 'v1')!.items as VideoItem[]).map((c) => ({ id: c.id, ...times.get(c.id)! })).sort((a, b) => a.start - b.start);
    for (const t of this.p.tracks) {
      if (t.id === 'v1' || t.id === 'bg' || t.id === 'panel' || !['overlay', 'scene', 'sfx', 'video'].includes(t.kind)) continue;
      for (const it of t.items as Array<{ id: string; start: number; end: number; parent?: string }>) {
        if (it.parent !== undefined) continue;
        // within a dissolve's overlap: the later clip, like the editor's own hanging (the clip under its start)
        const home = shots.filter((c) => it.start >= c.start - eps && it.end <= c.end + eps).pop();
        if (home) { it.start = r6(it.start - home.start); it.end = r6(it.end - home.start); it.parent = home.id; }
      }
    }
  }
  /** make the track when the cut does not have it yet */
  private track(id: string, kind: string, name: string, index: number) {
    if (!this.p.tracks.some((t) => t.id === id)) this.p.tracks.splice(index, 0, (kind === 'sfx' || kind === 'music' ? { id, kind, name, gain: 0, items: [] } : { id, kind, name, items: [] }) as Project['tracks'][number]);
  }

  /**
   * The clip's speech as captions attached to it (they move with the clip). `type`/`params` pick the caption block (default core.caption);
   * `fix` corrects words the transcript misheard ({ 肉蔥: '肉鬆' }); words in `highlight` are wrapped in 【】 and words in `censor` in {}
   * (common.caption shows them highlighted / bleeped). `chunk` splits each sentence into captions of that many words, or a number by the transcript's language
   * ({ zh: 6, ja: 6, '*': 3 }: Whisper gives Chinese and Japanese a character a word; '*' for any other; neither, whole sentences) (a lone last
   * word joins the one before), each timed from its first word: big word-by-word captions. Only the words the clip plays are shown
   * (a sentence the in or out point cuts keeps the part inside); `drop` leaves fillers out (['um', 'uh']); `maxChars` caps a caption's
   * length; `pause` starts a new one where the speaker stops that long; with `speakers` a caption never runs across a change of
   * speaker; when chunked, never past a sentence's end. Two captions are never up at once.
   */
  speechCaptions(clipIds: string | string[], o: { type?: string; params?: Record<string, unknown> } & CaptionOptions = {}): string[] {
    const pieces = this.pieces(clipIds, 'speechCaptions');
    if (!pieces.length) return [];
    const tr = this.transcriptOf(pieces[0].source);
    if (!tr) return [];
    return captionPlan(tr, pieces, o).map((c) => this.text(o.type ?? 'core.caption', c.at, c.len, { ...(o.params ?? {}), ...c.extra, text: c.text }, c.home.id));
  }

  /** the clips (the pieces tighten() made of one: one source, one after another) as source and film spans, in film order */
  private pieces(clipIds: string | string[], call: string): SpeechPiece[] {
    const times = resolveTimes(this.p);
    const pieces = (Array.isArray(clipIds) ? clipIds : [clipIds]).map((id) => {
      const found = this.p.tracks.flatMap((t) => (t.items as any[]).map((i) => ({ t, i }))).find((x) => x.i.id === id);
      if (!found) throw new Error(`No item "${id}"`);
      const it = found.i, rate: number = found.t.kind === 'video' ? it.speed : it.rate;
      return { id, source: it.source as string, in: it.in as number, out: it.in + (it.end - it.start) * rate, start: times.get(id)!.start, end: times.get(id)!.end, rate };
    }).sort((x, y) => x.start - y.start);
    if (pieces.some((x) => x.source !== pieces[0].source)) throw new Error(`${call}：一次給的片段要是同一支素材（tighten 切出來的那幾段）`);
    return pieces;
  }

  /**
   * Hand-written captions over a clip, timed in the source's own seconds (as the transcript and the player show them, '1:23.5' too):
   * a translation, a line cleaned up, a song. Each line is [from, to, text, params?]; they hang on the clip and move with it.
   * `type`/`params` as in speechCaptions; `hold` keeps each up that much longer while the next has not begun (never past the clip).
   * A line outside the clip is an error.
   */
  lines(clipIds: string | string[], lines: Line[], o: { type?: string; params?: Record<string, unknown>; hold?: number } = {}): string[] {
    const pieces = this.pieces(clipIds, 'c.lines');
    if (!pieces.length) return [];
    return linePlan(pieces, lines, o).map((c) => this.text(o.type ?? 'core.caption', c.at, c.len, { ...(o.params ?? {}), ...c.extra, text: c.text }, c.home.id));
  }

  /** Where a moment of a clip's source plays in the film ('1:23.5' or seconds; over the pieces tighten() made, a cut pause gives the next piece's start). */
  filmTime(clipIds: string | string[], t: SrcTime): number {
    const pieces = this.pieces(clipIds, 'c.filmTime'), s = secs(t, 'c.filmTime 的時間');
    if (!pieces.length) throw new Error('c.filmTime：沒有給片段');
    const lo = Math.min(...pieces.map((x) => x.in)), hi = Math.max(...pieces.map((x) => x.out));
    if (s < lo - 1e-3 || s > hi + 1e-3) throw new Error(`c.filmTime：素材 ${s} 秒不在片段裡（片段是素材的 ${pieces.map((x) => `${r6(x.in)}–${r6(x.out)}`).join('、')} 秒）`);
    return r6(filmOf(pieces, s, 'start'));
  }

  /**
   * A source's own sound alone, `len` seconds of it from `from`, at film time `at` (default: the cursor; the cursor does not move):
   * a J-cut (the next shot's sound comes in before its picture) or an L-cut (a voice carries on over the next shot). Give the clip
   * `sound: false` (or start it later) where the two would play the same words twice. It goes on the source track, so it ducks the
   * music and a bleep cuts it like a clip's own sound.
   */
  audio(source: string, o: { from: SrcTime; len: number; at?: number; gain?: number; fadeIn?: number; fadeOut?: number }): string {
    const s = this.src(source), from = secs(o.from, `c.audio('${source}') 的 from`);
    if (s.kind === 'image' || s.audio === false) throw new Error(`c.audio：「${source}」沒有聲音`);
    const at = r6(o.at ?? this.cursor), len = r6(Math.min(o.len, s.duration - from));
    if (!(len > 0)) throw new Error(`c.audio：「${source}」從 ${from} 秒起沒有長度`);
    const edge = r6(Math.min(0.1, len / 4));
    const id = addItem(this.p, { track: 'orig', item: { source, in: r6(from), rate: 1, start: at, end: r6(at + len), gain: o.gain ?? 0, fadeIn: o.fadeIn ?? edge, fadeOut: o.fadeOut ?? edge } });
    this.bump(at + len);
    return id;
  }

  /**
   * Where a word is said inside a clip, as film times: the transcript's words spread over their characters, the word found in them.
   * Use it to bleep a word: censorSpeech does the whole job.
   */
  wordTimes(clipId: string | string[], word: string): Array<[number, number]> {
    if (Array.isArray(clipId)) return clipId.flatMap((id) => this.wordTimes(id, word));   // the pieces tighten() made
    const found = this.p.tracks.flatMap((t) => (t.items as any[]).map((i) => ({ t, i }))).find((x) => x.i.id === clipId);
    if (!found) throw new Error(`No item "${clipId}"`);
    const it = found.i, tr = this.transcriptOf(it.source);
    if (!tr || !word) return [];
    return wordSpans(tr, it, found.t.kind === 'video' ? it.speed : it.rate, word);
  }

  /**
   * Bleep a word everywhere the clip says it: the original sound cut out, a beep in its place, a censor sticker over the picture.
   * `sticker` may be an emoji (e.g. '🤐'): that emoji instead of the 消音 label.
   */
  censorSpeech(clipId: string | string[], word: string, o: { sticker?: boolean | string; label?: string; gain?: number; follow?: boolean; who?: Who } = {}): Array<[number, number]> {
    if (Array.isArray(clipId)) return clipId.flatMap((id) => this.censorSpeech(id, word, o));   // the pieces tighten() made
    const spans = this.wordTimes(clipId, word);
    for (const [a, b] of spans) {
      const len = r6(Math.max(0.2, b - a));
      this.bleepOut({ at: a, len });
      // beep and sticker ride on the clip (like its captions): a later edit of the main track cannot slide them off the word
      this.attach(this.sfx('common.beep', { at: a, len, dur: len, gain: o.gain ?? -10 }), clipId);
      // follow: the sticker sits on the speaker's mouth and moves with it (toolkit phase 5)
      const follow = o.follow ? { follow: 'mouth' as const, who: o.who, clip: clipId } : {};
      if (typeof o.sticker === 'string') this.attach(this.effect('common.emoji', { at: a, len: r6(len + 0.5), char: o.sticker, ...follow }), clipId);
      else if (o.sticker !== false) this.attach(this.effect('common.censor', { at: a, len: r6(len + 0.5), label: o.label ?? '消音', ...follow }), clipId);
    }
    return spans;
  }

  /** Music under the whole edit, from `from` s into the file; laid out at save(). */
  music(media: string, o: { from?: number; gain?: number; fadeIn?: number; fadeOut?: number } = {}) {
    if (!this.p.media[media]) throw new Error(`No music "${media}"`);
    if (this.scoreReq) throw new Error('已經用 score() 產生配樂：music() 和 score() 選一個');
    this.song = { media, from: o.from ?? 0, gain: o.gain ?? 0, fadeIn: o.fadeIn ?? 0, fadeOut: o.fadeOut ?? 2 };
    return this;
  }
  /**
   * Generated background music under the whole edit (toolkit phase 3; styles: npm run score -- --styles <專案>). It is composed at save(),
   * when the film's length is known, so it closes on its last chord as the film ends. Gain in dB.
   */
  score(style: string, o: { bpm?: number; key?: string; seed?: number; name?: string; gain?: number; fadeIn?: number; fadeOut?: number; /** moments the style may answer, film seconds by name (its ctx.cues) */ cues?: Record<string, number> } = {}) {
    for (const [k, v] of Object.entries(o.cues ?? {})) if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`c.score 的 cues.${k} 要是影片秒數，現在是 ${v}`);
    if (this.song) throw new Error('已經用 music() 放了配樂：music() 和 score() 選一個');
    this.scoreReq = { style, ...o };
    return this;
  }
  /** How far music dips under the narration and under speech in the clips (dB), or false for no dip. Default -10; `speech: false`: only under the narration. */
  duck(db: number | false, o: { speech?: boolean } = {}) { this.duckDb = db; if (o.speech !== undefined) this.duckSpeech = o.speech; return this; }
  /**
   * The music's level over the whole film (the brand spike's shape.mjs): points [film seconds, gain 0–1.5], eased (smoothstep) from
   * one to the next and held before the first and after the last. Dips and the ducking under speech still go lower where they say.
   */
  level(points: Array<[number, number]>) {
    for (let i = 0; i < points.length; i++) {
      const [t, g] = points[i];
      if (!(g >= 0 && g <= 1.5)) throw new Error(`c.level：音量倍數要在 0–1.5 之間（第 ${i + 1} 個點是 ${g}）`);
      if (i && t < points[i - 1][0]) throw new Error(`c.level：點要照時間順序（第 ${i + 1} 個點 ${t} 秒在前一個之前）`);
    }
    this.curve = points.map(([t, g]) => [r6(t), g]);
    return this;
  }
  /** The music drops by `db` for `len` seconds from `at` (a breath of silence at the emotional peak), then comes back. */
  dip(at: number, o: { len?: number; db?: number } = {}) { this.dips.push({ at: r6(at), len: o.len ?? 1.5, db: o.db ?? -18 }); return this; }

  /**
   * One narration scene (made by npm run voice) on the narration track at `at` (default: the cursor). Returns its place and its caption
   * phrases on the timeline; the cursor does not move (pictures are laid out separately).
   */
  voice(scene: string, o: { at?: number; gain?: number } = {}): VoicePlaced {
    const f = voiceFiles(this.dir, scene);
    if (!existsSync(f.info) || !existsSync(f.wav)) throw new Error(`沒有旁白「${scene}」：先寫 narration.json，再跑 npm run voice -- ${basename(this.dir)}`);
    const v = JSON.parse(readFileSync(f.info, 'utf8')) as VoiceInfo, media = `voice-${scene}`;
    this.p.media[media] = { path: `media/voice/${scene}.wav`, duration: v.dur };
    this.track('voice', 'music', 'Narration', this.p.tracks.findIndex((t) => t.id === 'music') + 1);
    const start = r6(o.at ?? this.cursor), end = r6(start + v.dur);
    const id = addItem(this.p, { track: 'voice', item: { media, in: 0, start, end, gain: o.gain ?? 0, fadeIn: 0, fadeOut: 0.03 } });
    this.bump(end);
    const gloss = this.glossOf(scene, v);
    return { id, start, end, phrases: v.phrases.map((ph, i) => ({ text: ph.text, t0: r6(start + ph.t0), t1: r6(start + ph.t1), ...(gloss ? { gloss: gloss[i] } : {}) })) };
  }
  /** The narration's translation of each of a scene's phrases (bilingual captions), or null. Phrases are matched by their text, in order:
   *  a voice made before the phrases were cut the way they are now cannot be matched and has to be made again. */
  private glossOf(scene: string, v: VoiceInfo): string[] | null {
    const file = join(this.dir, 'narration.json');
    if (!existsSync(file)) return null;
    // only this scene's gloss is checked: a mistake in another (or a hand-made narration.json) does not stop this one
    const raw = JSON.parse(readFileSync(file, 'utf8')) as { scenes?: Array<{ id?: string; gloss?: unknown }> };
    const mine = raw.scenes?.find((x) => x?.id === scene);
    if (!mine?.gloss) return null;
    const s = parseNarration({ ...raw, scenes: [mine] }).scenes[0];
    if (!s.gloss) return null;
    const parts = phraseParts(s.text), out: string[] = [];
    let k = 0;
    for (const ph of v.phrases) {
      while (k < parts.length && parts[k] !== ph.text) k++;
      if (k === parts.length) throw new Error(`旁白「${scene}」的字幕句子和 narration.json 對不上（旁白是舊的切句方式做的）：npm run voice -- ${basename(this.dir)} ${scene} --force`);
      out.push(s.gloss[k++]);
    }
    return out;
  }
  /** Captions from a narration scene's phrases (common.caption by default; other keys are its params). Each stays up until the next begins.
   *  A phrase with a translation (the scene's gloss) gets it under the line, at 0.75 of its size in the caption's own colour unless the params say otherwise. */
  voiceCaptions(v: VoicePlaced, o: { type?: string; [k: string]: unknown } = {}): string[] {
    const { type = 'common.caption', ...params } = o;
    return v.phrases.map((ph, i) => {
      const next = v.phrases[i + 1], end = next ? Math.max(ph.t1, Math.min(next.t0, ph.t1 + 0.5)) : ph.t1 + 0.3;
      const gloss = ph.gloss !== undefined ? { glossSize: 0.75, glossColor: (params.color as string | undefined) ?? '#ffffff', ...params, gloss: ph.gloss } : params;
      // at least 0.6 s, but a short phrase never stays up over the next one
      return this.text(type, ph.t0, r6(Math.min(Math.max(0.6, end - ph.t0), next ? next.t0 - ph.t0 : Infinity)), { ...gloss, text: ph.text });
    });
  }

  private beatInfo() {
    // generated music: its beats are known before it exists (first beat at 0, a beat every 60/bpm s)
    const req = this.scoreReq, bpm = req ? (req.bpm ?? this.bpmOf(req.style)) : undefined;
    if (req && bpm) return { s: { media: '', from: 0, gain: 0, fadeIn: 0, fadeOut: 0 }, b: { bpm, offset: 0, beats: Array.from({ length: Math.ceil((3600 * bpm) / 60) }, (_, i) => r6((i * 60) / bpm)) } };
    if (req) throw new Error(`找不到配樂風格「${req.style}」，beatLen 不知道它的 bpm（npm run score -- --styles ${basename(this.dir)}；或在 score() 裡給 bpm）`);
    const s = this.song, b = s && this.inv.music.find((m) => m.id === s.media)?.beats;
    return s && b?.beats.length ? { s, b } : null;
  }

  /** Seconds from the cursor to the every-th beat after it (cut on the beat). */
  beatLen(every = 4): number {
    const m = this.beatInfo();
    if (!m) throw new Error('beatLen needs music() with detected beats');
    const tl = m.b.beats.map((x) => x - m.s.from).filter((x) => x >= 0), i = tl.findIndex((x) => x >= this.cursor - 1e-3);
    const beat = 60 / m.b.bpm;
    if (i < 0) return r6(beat * every);
    return i + every < tl.length ? r6(tl[i + every] - this.cursor) : r6(tl[i] + beat * every - this.cursor);
  }

  /** `n` beats of the music in seconds (a length counted in beats: c.clip(src, { len: c.beats(3) })); score() or music() with detected beats first. */
  beats(n: number): number {
    const m = this.beatInfo();
    if (!m) throw new Error('c.beats 要先有 score() 或偵測得到拍點的 music()');
    return r6((n * 60) / m.b.bpm);
  }

  /** `count` picks spread over the source's scenes: at least minLen long, 0.3 s clear of cuts, at most maxLen. */
  bestSegments(source: string, o: { count: number; minLen?: number; maxLen?: number }): Array<[number, number]> {
    const s = this.inv.sources.find((x) => x.id === source);
    if (!s) throw new Error(`No source "${source}" in the inventory`);
    const minLen = o.minLen ?? 1.5, maxLen = o.maxLen ?? 4;
    const ok = s.segments.map(([a, b]) => [r6(a + 0.3), r6(b - 0.3)] as [number, number]).filter(([a, b]) => b - a >= minLen);
    if (ok.length <= o.count) return ok.map(([a, b]) => [a, r6(Math.min(b, a + maxLen))]);
    return Array.from({ length: o.count }, (_, k) => ok[Math.round((k * (ok.length - 1)) / Math.max(1, o.count - 1))]).map(([a, b]) => [a, r6(Math.min(b, a + maxLen))]);
  }

  /** the face detector save() uses (a test gives a stand-in; default: tellcut/providers.json's) */
  facesProvider?: FacesProvider;
  private faceCtx() { return { p: this.p, dir: this.dir, provider: this.facesProvider, notes: this.notes }; }

  async save(): Promise<Project> {
    const duration = r6(Math.max(this.end, 0.5));
    this.p.meta.duration = duration;
    await resolveAutoFocus(this.faceCtx(), this.autoFocus);   // the crops first: a sticker follows a face through the final crop, a blur backdrop copies it
    this.addLayout(duration);
    await resolveFollows(this.faceCtx(), this.follows);
    const m = this.song;
    if (m) {
      const info = this.inv.music.find((x) => x.id === m.media), len = r6(Math.min(duration, info?.duration ? info.duration - m.from : duration));
      addItem(this.p, { track: 'music', item: { media: m.media, in: m.from, start: 0, end: len, gain: m.gain, fadeIn: Math.min(m.fadeIn, len / 2), fadeOut: Math.min(m.fadeOut, len / 2), toEnd: true } });
      // the music file's length: music ending with the film stops there
      if (info?.duration) this.p.media[m.media] = { ...this.p.media[m.media], duration: info.duration };
      const first = info?.beats?.beats.find((x) => x >= m.from);
      if (info?.beats && first !== undefined) this.p.grids = [{ id: 'music', at: r6(first - m.from), bpm: info.beats.bpm }];
    }
    if (this.scoreReq) await addScore(this.p, this.dir, this.scoreReq, duration);
    // speech in the clips' own sound: as duck() says, a clip's duck option over that, room tone (QUIET_DB or lower) left out
    const byDefault = this.duckDb !== false && this.duckSpeech, fallback = this.duckDb === false ? -10 : this.duckDb;
    const speech = clipSpeech(this.p, (src) => this.transcriptOf(src), (it, level) => {
      const own = this.duckOf.get(it.parent ?? '');
      if (own === false) return null;
      if (own === true) return fallback;
      if (typeof own === 'number') return own;
      return byDefault && level > QUIET_DB ? undefined : null;
    });
    addDucking(this.p, { duckDb: this.duckDb, speech, dips: this.dips, curve: this.curve });
    this.pruneGenerated();
    this.attachToShots();
    // a magnetic track is packed from 0 by the editor's first command: a main track with gaps left on purpose (3D over nothing,
    // c.at) would close up under the items placed over the gaps, so it is saved as an ordinary track
    const mag = this.p.tracks.find((t: any) => t.magnetic);
    if (mag) {
      const g = magneticGaps(this.p, mag.id);
      if (g.count) { delete (mag as any).magnetic; this.notes.push(`主軌有 ${g.count} 個空檔（共 ${g.shift} 秒）：存成一般軌（不磁吸），編輯器裡的修改不會把空檔合起來`); }
    }
    const p = parseProject(this.p);
    // a cut runs for minutes (transcribing, faces, score): an edit the editor saved meanwhile is not the script's to overwrite
    if (this.opened && !this.opened.force && fileHash(this.dir) !== this.opened.hash)
      throw new EditedDuringCut('初剪執行期間這個專案被編輯過（編輯器存檔或其他工具），沒有寫入，那些修改都還在。確定要覆蓋請加上 --force 重跑');
    writeProjectFile(this.dir, p, 'cut');
    mkdirSync(join(this.dir, 'cache'), { recursive: true });
    writeFileSync(stateFile(this.dir), JSON.stringify({ hash: hash(readFileSync(join(this.dir, 'project.json'), 'utf8')) }));
    return p;
  }
}
