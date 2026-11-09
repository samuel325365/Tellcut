// Helpers for a first-cut script, projects/<id>/cut.ts (spec 2026-10-14 §9). Every run starts from the project's
// sources and empty tracks, so a script can be re-run (another song, other picks) and always gives the same result.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';
import { addItem, allItems, createRegistry, OLD_BLOCKS, deleteItems, magneticGaps, parseProject, r6, resolveTheme, resolveTimes, SOUND_FILE, split, trimEnd, trimStart, type Crop, type Project, type ThemeInput, type VideoItem } from '@tellcut/engine';
import { loadAllStyles, timecode1, parseNarration, phraseParts, probeDurationSync, STYLES, voiceFiles, wavDuration, writeProjectFile, type FacesProvider, type VoiceInfo } from '@tellcut/media-node';
import { plugins } from '@tellcut/plugins';
import { lineColorKey, PANEL_RADIUS, panelFrame, templateOf, titleTemplateOf } from '@tellcut/plugin-common';
import { idOfHandle, normalizeHandle } from '@tellcut/protocol';
import { avoidBurnedMove, BURNED_PAD, burnedZoomCap } from './avoid.ts';
import type { Who } from './follow.ts';
import { parseContent, RECIPES } from './recipes/index.ts';
import { inventory, type Inventory } from './inventory.ts';
import { captionPlan, filmOf, linePlan, secs, wordSpans, type CaptionOptions, type Line, type SpeechPiece, type SrcTime } from '@tellcut/plugin-common/speech';
import { tightenClip } from './tighten.ts';
import { captionHeight, isCaption, placeCaptions, UNDER_GAP, type CaptionItem } from './under-panel.ts';
import { addDucking, addScore, clipSpeech, QUIET_DB, type ScoreRequest } from './mix.ts';
import { resolveAutoFocus, resolveBurnedFaces, resolveFollows, type BurnedAsk, type FollowReq } from './focus.ts';
import { addBands, addBeside, addFlatlayClip, addTrack, checkFrame, cropOf, frameFields, STILL, viewOf, type BandsOpts, type BesideOpts, type CropIn, type Frame, type Shape, type ViewOpts } from './frames.ts';
export { cropOf, type CropIn };

export { checkFrame };

type Transition = { type: 'dissolve' | 'slide'; dur: number; dir?: 'l' | 'r' | 'u' | 'd' };
/** why avoidBurned left a clip as asked: the zoom it needs is past the cap, the detection has not run, or no caption was detected
 *  near it (`fix`: the crop that would clear the caption row anyway, `cap` when even that is past the zoom cap) */
type BurnedSkip = { kind: 'zoom' | 'pending' | 'unseen'; from: number; to: number; cap?: number; rows?: [number, number]; fix?: { from: Crop; to: Crop } };
/** clips listed in one avoidBurned note at most */
const MAX_SKIPS = 8;
const cropText = (c: Crop) => `{ x: ${+c.x.toFixed(3)}, y: ${+c.y.toFixed(3)}, zoom: ${+c.zoom.toFixed(3)} }`;
/** A time or a length given to a call: a finite number (`min` or more; more than `above`), else an error naming the call. A missing
 *  len used to surface only at save() as "end: Expected number, received nan", and len: '2' made 1 + '2' = '12', a 12-second film. */
export function num(v: unknown, what: string, o: { min?: number; above?: number } = {}): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${what} 要是數字，現在是 ${typeof v === 'number' ? v : JSON.stringify(v) ?? String(v)}`);
  if (o.above !== undefined && !(v > o.above)) throw new Error(`${what} 要大於 ${o.above}，現在是 ${v}`);
  if (o.min !== undefined && v < o.min) throw new Error(`${what} 不能小於 ${o.min}，現在是 ${v}`);
  return v;
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

/** project.json changed since the last cut wrote it (edited in the editor). With no record of the last cut (none, or a torn
 *  cut-state.json: a project copied without cache/, the cache cleared) a project that has anything on its tracks counts as edited,
 *  since nothing says it is not: only a fresh one (npm run new, nothing cut yet) is safe to cut without --force. */
export function editedSinceCut(dir: string): boolean {
  const f = join(dir, 'project.json');
  if (!existsSync(f)) return false;
  const text = readFileSync(f, 'utf8');
  let was: unknown;
  try { was = JSON.parse(readFileSync(stateFile(dir), 'utf8'))?.hash; } catch { was = undefined; }
  if (typeof was === 'string') return was !== hash(text);
  try { return (JSON.parse(text)?.tracks ?? []).some((t: { items?: unknown[] }) => (t?.items?.length ?? 0) > 0); } catch { return false; }
}
const fileHash = (dir: string) => { const f = join(dir, 'project.json'); return existsSync(f) ? hash(readFileSync(f, 'utf8')) : null; };
/** project.json changed while the cut ran (save() refuses to write over it): tools/cut.ts prints the message */
export class EditedDuringCut extends Error {}

export class Cut {
  private cursor = 0;
  private end = 0;
  /** set by panel(): the rectangle the picture lives in, so clips come with it and save() adds the backdrop and the frame */
  private layout: { frame: [number, number, number, number]; radius: number; backdrop: Record<string, unknown> | false | 'blur'; border: Record<string, unknown> | false } | null = null;
  /** the rows reserved under the panel (underPanel), as a share of the frame height: the captions go below them */
  private reserved = 0;
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
  /** clips avoidBurned cropped: at save() the crop is worked out again so the faces in them stay in frame */
  private burnedAsks: BurnedAsk[] = [];
  /** clip(…, { duck }) by clip id (the pieces tighten() makes of one get its value): true, false or the dB its speech ducks to */
  private duckOf = new Map<string, boolean | number>();
  /** what save() did on its own (auto-focus, stickers following faces): tools/cut.ts prints it */
  readonly notes: string[] = [];
  /** speechCaptions ran before captionTemplate (its captions have no word times to light up) */
  private plainSpeech = false;

  constructor(readonly p: Project, readonly inv: Inventory, readonly dir: string) {
    this.p.tracks = TRACKS() as Project['tracks'];
    this.p.grids = [];
    // what an earlier run of the script set is the script's to set again: a removed c.theme()/c.fx() must not linger
    // (generated narration/music no item uses any more is dropped at save(), see pruneGenerated)
    delete this.p.meta.theme;
    delete this.p.meta.fx;
    delete this.p.meta.captionTemplate;   // likewise c.captionTemplate(); the project's own copies (captionTemplates) stay
    delete this.p.meta.titleTemplate;     // and c.titleTemplate()
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
  at(t: number) { this.cursor = r6(Math.max(0, num(t, 'c.at 的時間'))); return this; }
  private bump(t: number) {
    // a NaN here made the film's length NaN, and save() failed far from the call that caused it
    if (!Number.isFinite(t)) throw new Error(`片長算出來不是數字（${t}）：檢查前一個呼叫的 at、len`);
    this.end = Math.max(this.end, r6(t));
  }
  private src(id: string) { const s = this.p.sources[id]; if (!s) throw new Error(`No source "${id}"`); return s; }
  /**
   * The crop that keeps the footage's own burned-in caption out of the frame, when this stretch of the source has one in view (toolkit
   * phase 2d): zoomed no further than the footage's resolution allows (burnedZoomCap), else the crop stays as asked and a note says
   * so (check reports the caption then). `ask`: what save() needs to work it out again around the faces in the clip.
   */
  private avoidBurned(source: string, from: number, to: number, crop: { from: Crop; to: Crop }, frame?: Frame): { crop: { from: Crop; to: Crop }; ask?: Omit<BurnedAsk, 'ids'>; skip?: BurnedSkip } {
    const s = this.inv.sources.find((x) => x.id === source), src = this.p.sources[source];
    if (!s || !src) return { crop };
    // no detection result (the analysis still on it, or it failed): nothing to go by, which the agent must hear
    if (s.burned === null) return { crop, skip: { kind: 'pending', from, to } };
    const cap = s.burned?.caption;
    if (!cap) return { crop };   // looked at, and the footage has no caption row
    const [, , fw, fh] = frame ?? this.layout?.frame ?? [0, 0, 1, 1], frameW = fw * this.p.meta.width, frameH = fh * this.p.meta.height;
    const geo = { srcW: src.width, srcH: src.height, frameW, frameH, captionTop: cap.rect[1], maxZoom: burnedZoomCap(src.width, src.height, frameW, frameH) };
    const r = avoidBurnedMove(geo, crop), { why: _, ...move } = r, same = !r.why && JSON.stringify(move) === JSON.stringify(crop);
    // the detection samples one frame a second and misses short lines (a word or two on screen for 2–3 s: a travel vlog lost most
    // of its captions to that), so a stretch with no span near it is left alone but said, with the crop that would clear it
    if (!cap.spans.some(([a, b]) => a - BURNED_PAD < to && b + BURNED_PAD > from))
      return same ? { crop } : { crop, skip: { kind: 'unseen', from, to, rows: [cap.rect[1], cap.rect[1] + cap.rect[3]], ...(r.why ? { cap: geo.maxZoom } : { fix: move }) } };
    if (r.why) return { crop, skip: { kind: 'zoom', from, to, cap: geo.maxZoom } };
    return { crop: move, ...(same ? {} : { ask: { source, from, to, want: crop, geo } }) };
  }
  /** clips avoidBurned left as asked, by source: said once per source at save() (a recipe asks it of every clip) */
  private burnedSkips = new Map<string, Array<BurnedSkip & { ids: string[] }>>();
  private burnedSkipNotes() {
    // source times as the script writes them ('9:46.0')
    const span = (k: { ids: string[]; from: number; to: number }, more = '') => `${k.ids.join('、')}（素材 ${timecode1(k.from)}–${timecode1(k.to)}${more}）`;
    const list = <T,>(xs: T[], f: (x: T) => string) => xs.slice(0, MAX_SKIPS).map(f).join('、') + (xs.length > MAX_SKIPS ? `…（還有 ${xs.length - MAX_SKIPS} 段）` : '');
    const live = new Set(allItems(this.p).map((x) => (x.item as { id: string }).id));
    for (const [source, asked] of this.burnedSkips) {
      // a clip the script removed again is not news
      const all = asked.map((k) => ({ ...k, ids: k.ids.filter((id) => live.has(id)) })).filter((k) => k.ids.length);
      const src = this.p.sources[source], by = (kind: BurnedSkip['kind']) => all.filter((k) => k.kind === kind);
      const zoom = by('zoom'), pending = by('pending'), unseen = by('unseen');
      if (zoom.length) this.notes.push(`avoidBurned：${source} 有 ${zoom.length} 段要放大超過 ${zoom[0].cap} 倍才避得開燒進去的字幕（素材 ${src.width}×${src.height}，再放大會糊），沒有改裁切：${list(zoom, (k) => span(k))}；字幕改放畫面上方或換鏡頭`);
      if (pending.length) this.notes.push(`avoidBurned：${source} 沒有燒字偵測的結果（分析還沒跑完或失敗了），${pending.length} 段沒有裁：${list(pending, (k) => span(k))}；分析完再重跑 cut`);
      if (unseen.length) {
        const [top, bottom] = unseen[0].rows!, pct = (x: number) => Math.round(x * 100);
        // `crop: …` ready to paste into the clip call
        const how = (k: BurnedSkip) => k.fix ? (JSON.stringify(k.fix.from) === JSON.stringify(k.fix.to) ? `crop: ${cropText(k.fix.from)}` : `crop: { from: ${cropText(k.fix.from)}, to: ${cropText(k.fix.to)} }`) : `要放大超過 ${k.cap} 倍，裁不掉`;
        this.notes.push(`avoidBurned：${source} 有 ${unseen.length} 段前後 ${BURNED_PAD} 秒內沒偵測到原片字幕，沒有放大：${list(unseen, (k) => span(k, `，${how(k)}`))}；偵測一秒只看一格，一兩個字的短句常漏掉：畫面下方 ${pct(top)}–${pct(bottom)}% 高度看得到字的話，照括號裡的 crop 自己裁`);
      }
    }
    this.burnedSkips.clear();   // said once, even if save() runs again
  }
  private frameFields(frame?: Frame, shape?: Shape) { return frameFields(this.layout, frame, shape); }
  /** a transition overlaps the previous clip by its own length: it stays linked to the overlap */
  private startFor(tr?: Transition) { return tr ? r6(Math.max(0, this.cursor - tr.dur)) : this.cursor; }

  /**
   * `frame` [x, y, w, h]: the rectangle of the screen the picture lives in (a window of common.duo / common.magazine, a band…), instead of the whole screen or the panel.
   * `from` may be written as the player shows it ('1:23.5'). `duck`: whether speech in this clip's own sound ducks the music — true,
   * false, or the dB to duck to (default: it does unless the clip's sound is at QUIET_DB or lower, room tone under a montage).
   */
  clip(source: string, o: { from?: SrcTime; len: number; speed?: number; crop?: CropIn; transition?: Transition; sound?: boolean; gain?: number; avoidBurned?: boolean; frame?: Frame; shape?: Shape; duck?: boolean | number }): string {
    checkFrame(o.frame, `c.clip('${source}')`);
    const s = this.src(source), crop0 = cropOf(o.crop, `c.clip('${source}')`);
    if (s.kind === 'image') {
      // a photo among clips (a recipe's shot list): its crop / focus is kept, not dropped
      const id = this.photo(source, { len: o.len, transition: o.transition, frame: o.frame, shape: o.shape });
      if (crop0) (this.p.tracks.find((t) => t.id === 'v1')!.items.find((i) => i.id === id) as { crop: unknown }).crop = crop0;
      return id;
    }
    const speed = o.speed ?? 1, from = secs(o.from ?? 0, `c.clip('${source}') 的 from`), len = r6(Math.min(num(o.len, `c.clip('${source}') 的 len`, { above: 0 }), (s.duration - from) / speed));
    if (!(len > 0)) throw new Error(`A clip of "${source}" from ${from} s has no length`);
    const start = this.startFor(o.transition);
    const avoided = o.avoidBurned ? this.avoidBurned(source, from, from + len * speed, crop0 ?? { from: STILL, to: STILL }, o.frame) : undefined;
    const crop = avoided?.crop ?? crop0 ?? { from: STILL, to: STILL };
    const id = addItem(this.p, { track: 'v1', item: { source, in: from, speed, start, end: r6(start + len), crop, ...this.frameFields(o.frame, o.shape), ...(o.transition ? { transitionIn: o.transition } : {}) } });
    // no crop asked for and the picture does not fit the frame's shape: at save() its focus goes to the faces in it (phase 5)
    if (!crop0) this.autoFocus.push([id]);
    if (avoided?.ask) this.burnedAsks.push({ ids: [id], ...avoided.ask });
    if (avoided?.skip) this.burnedSkips.set(source, [...(this.burnedSkips.get(source) ?? []), { ids: [id], ...avoided.skip }]);
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
    for (const a of this.burnedAsks) if (a.ids.includes(clipId)) a.ids = r.ids;
    for (const k of [...this.burnedSkips.values()].flat()) if (k.ids.includes(clipId)) k.ids = r.ids;
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

  photo(source: string, o: { len?: number; zoom?: [number, number]; focus?: [number, number]; transition?: Transition; frame?: Frame; shape?: Shape } = {}): string {
    checkFrame(o.frame, `c.photo('${source}')`);
    if (this.src(source).kind !== 'image') throw new Error(`"${source}" is not a photo`);
    const len = num(o.len ?? 3, `c.photo('${source}') 的 len`, { above: 0 }), [z0, z1] = o.zoom ?? [1, 1.1], [x, y] = o.focus ?? [0.5, 0.5], start = this.startFor(o.transition);
    const id = addItem(this.p, { track: 'v1', item: { source, in: 0, speed: 1, start, end: r6(start + len), crop: { from: { x, y, zoom: z0 }, to: { x, y, zoom: z1 } }, ...this.frameFields(o.frame, o.shape), ...(o.transition ? { transitionIn: o.transition } : {}) } });
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
  view(source: string, o: ViewOpts): Crop {
    checkFrame(o.frame, `c.view('${source}')`);
    const s = this.src(source), [, , fw, fh] = o.frame ?? this.layout?.frame ?? [0, 0, 1, 1];
    const cap = o.burned === false ? null : this.inv.sources.find((x) => x.id === source)?.burned?.caption;
    return viewOf(s, [fw * this.p.meta.width, fh * this.p.meta.height], source, o, cap);
  }

  /**
   * A landscape shot as `count` cinemascope bands stacked across a tall frame (the uk-beat short's Arc de Triomphe): band 0 goes on the
   * main track at the cursor (the cursor moves on by `len`), the others on video tracks of their own (v2, v3…, made right above v1 when
   * missing), each slamming in `every` seconds after the one before (default: the length split evenly, one more step than bands), all
   * ending together. Each band shows its own stretch of the source (`from`) and its own crop (a wide view, a close-up of a detail…).
   * `ratio` is a band's width ÷ height (2.7 ≈ 1080 × 400 in a 9:16 film), `gap` the space between bands as a share of the frame height;
   * the stack is centred. No sound (cut to the music). Returns the ids, top band first.
   */
  bands(source: string, o: BandsOpts): string[] {
    return addBands(this.p, this.src(source), source, o, this.cursor,
      (from, frame) => ({ id: this.clip(source, { from, len: o.len, crop: o.crops?.[0], sound: false, frame }), end: this.cursor }));
  }

  /**
   * A second picture beside clips already on the main track: for each clip (the pieces of a tighten too) the same stretch of `source`
   * (default the clip's own; `offset` seconds later in it — a second camera's file that started that much later) on a video track of
   * its own (`track`, default v2, made right above the main track), in `frame`, from the clip's start to its end at its speed, with
   * no sound (the main clip carries it): the other person of a split screen cut from the same wide shot (common.duo's
   * duoWindow('b', …)), a listener's face in a picture-in-picture. `crop` is one move spread over the pieces, as tighten spreads a
   * clip's. At save() each rides on its clip, so trimming or ripple-deleting the clip in the editor carries it along. Returns the ids.
   */
  beside(clipIds: string | string[], o: BesideOpts): string[] { return addBeside(this.p, (id) => this.src(id), clipIds, o); }

  private text(type: string, at: number, len: number, params: Record<string, unknown>, parent?: string, call = `c.effect('${type}')`): string {
    num(at, `${call} 的 at`, parent ? {} : { min: 0 });
    num(len, `${call} 的 len`, { above: 0 });
    const id = addItem(this.p, { track: 'text', item: { type, start: r6(at), end: r6(at + len), params, ...(parent ? { parent } : {}) } });
    if (!parent) this.bump(at + len);
    return id;
  }
  // c.title and c.caption make the shared blocks, so the film's title / caption template applies (2026-11-05: the old core.title and
  // core.caption stay only so older projects open; new films never get one — see OLD_BLOCKS)
  title(text: string, o: { at?: number; len?: number; [k: string]: unknown } = {}) {
    const { at = this.cursor, len = 3, ...rest } = o;
    this.unknownParams('c.title', 'common.heading', text, rest);
    return this.text('common.heading', at as number, len as number, { text, ...rest }, undefined, 'c.title');
  }
  caption(text: string, o: { at: number; len: number; [k: string]: unknown }) {
    const { at, len, ...rest } = o;
    this.unknownParams('c.caption', 'common.caption', text, rest);
    return this.text('common.caption', at, len, { text, ...rest }, undefined, 'c.caption');
  }
  /** a param the block does not have would be dropped without a word (2026-11-01): say so */
  private unknownParams(call: string, type: string, text: string, params: Record<string, unknown>) {
    const own = new Set(createRegistry(plugins).item(type)?.params.map((p) => p.key) ?? []);
    const odd = Object.keys(params).filter((k) => !own.has(k));
    if (odd.length) this.notes.push(`${call}('${text.slice(0, 20)}')：${call} 放的是 ${type}，它沒有 ${odd.join('、')} 參數，畫面上不會有效果（npm run tellcut -- catalog ${type} 列出它的參數）`);
  }
  lowerThird(main: string, sub: string, o: { at?: number; len?: number; [k: string]: unknown } = {}) {
    const { at = this.cursor, len = 3, ...rest } = o; return this.text('core.lowerThird', at as number, len as number, { text: main, sub, ...rest }, undefined, 'c.lowerThird');
  }
  /** after everything else */
  endCard(lines: string[], o: { len?: number; [k: string]: unknown } = {}) { const { len = 5, ...rest } = o; return this.text('core.endCard', this.end, len as number, { text: lines.join('\n'), ...rest }, undefined, 'c.endCard'); }

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
   * leaves no empty band then. Captions that are not given a place of their own (no `y` or `position`, no transform) go right under
   * the panel at save(), while that keeps them above the bottom safe margin; else they stay on the margin (with a note when they cover the panel).
   */
  panel(o: { frame?: [number, number, number, number]; radius?: number; backdrop?: Record<string, unknown> | false | 'blur'; border?: Record<string, unknown> | false } = {}) {
    checkFrame(o.frame, 'c.panel');
    this.layout = { frame: o.frame ?? panelFrame(this.p.meta.width, this.p.meta.height), radius: o.radius ?? PANEL_RADIUS, backdrop: o.backdrop ?? {}, border: o.border ?? {} };
    return this;
  }
  /**
   * Reserve a row `h` high (a share of the frame height) under the panel, below the rows reserved before; returns its top. The
   * captions save() places under the panel go below it (the hook recipe's chapter dots).
   */
  underPanel(h: number): number {
    if (!this.layout) throw new Error('c.underPanel：沒有面板版面，先呼叫 c.panel()');
    if (!(h >= 0)) throw new Error(`c.underPanel 的高度要是 0 以上的數字（畫面高的比例），現在是 ${h}`);
    const top = this.layout.frame[1] + this.layout.frame[3] + this.reserved;
    this.reserved += h;
    return top;
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
    num(at, `c.effect('${type}') 的 at`, { min: 0 });
    num(len, `c.effect('${type}') 的 len`, { above: 0 });
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
  /**
   * The main-track clip under a common.flatlay item for object `index` (from 0): that object's shot, from the item's start + the
   * object's `at` until it has left the desk (its exit over, when it has one) or the item ends — the length plugin-common's
   * flatlayClip gives, cut short only by the end of the source — cropped so that when the camera has flown into the picture it shows exactly what the picture
   * shows (the hand-off has no seam), with its own sound (the desk's pictures are silent). The main track must be free then. Over a
   * see-through desk (surface none) the clip would show through it, so it runs only while the picture covers the screen (from the end
   * of the fly into that object to the pull back, its leaving or the item's end).
   */
  flatlayClip(itemId: string, index: number, o: { gain?: number } = {}): string {
    const { id, end } = addFlatlayClip(this.p, (x) => this.src(x), itemId, index, o);
    this.bump(end);
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
    num(at, `c.sfx('${type}') 的 at`, { min: 0 });
    num(len, `c.sfx('${type}') 的 len`, { above: 0 });
    num(gain, `c.sfx('${type}') 的 gain`);
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
  /** At save(), in a panel layout: the captions nobody placed hang right under the panel (see under-panel.ts). */
  private captionsUnderPanel() {
    const l = this.layout;
    if (!l) return;
    const { width: W, height: H } = this.p.meta, theme = resolveTheme(this.p.meta.theme, this.p.meta), reg = createRegistry(plugins);
    const withDefaults = (it: CaptionItem) => ({ ...Object.fromEntries((reg.item(it.type)?.params ?? []).map((d) => [d.key, d.default])), ...it.params });
    const all = this.p.tracks.filter((t) => t.kind === 'overlay').flatMap((t) => t.items as unknown as CaptionItem[]).filter((it) => isCaption(it.type));
    const panelBottom = l.frame[1] + l.frame[3];
    const { moves, covering } = placeCaptions(all.map((it) => ({ ...it, params: it.params ?? {} })), {
      top: panelBottom + this.reserved, bottom: 1 - theme.safe.bottom, panelBottom, gap: (UNDER_GAP * Math.min(W, H)) / 1080 / H,
      heightOf: (it) => captionHeight(it.type, withDefaults(it), W, H, theme.stroke),
    });
    for (const m of moves) {
      const it = all.find((x) => x.id === m.id)!;
      if ('y' in m) it.params = { ...(it.params ?? {}), y: m.y }; else it.transform = { ox: 0.5, oy: 0.5, ...m.transform };
    }
    // a wide film's own default panel is meant to have its captions over the picture's lower edge (panelFrame): no note for that
    const designed = W > H && l.frame.every((v, i) => v === panelFrame(W, H)[i]);
    if (covering.length && !designed)
      this.notes.push(`c.panel：面板下緣 ${panelBottom.toFixed(3)} 到畫面安全區下緣 ${(1 - theme.safe.bottom).toFixed(3)} 之間放不下兩行字幕，${covering.length} 張字幕留在安全區下緣、蓋到面板下緣；要字幕排在面板正下方，給 c.panel 一個底邊高一點的 frame（hook 配方的直式面板底邊在 0.62），或給字幕自己的 y`);
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
  private track(id: string, kind: string, name: string, index: number) { addTrack(this.p, id, kind, name, index); }

  /**
   * The clip's speech as captions attached to it (they move with the clip). `type`/`params` pick the caption block (default common.caption);
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
    // a film with a caption template (captionTemplate) captions speech in it, lighting up word by word unless told otherwise
    const tpl = !o.type && !!this.p.meta.captionTemplate, opts = tpl && o.karaoke === undefined ? { ...o, karaoke: true } : o;
    if (!o.type && !tpl) this.plainSpeech = true;
    return captionPlan(tr, pieces, opts).map((c) => this.text(o.type ?? 'common.caption', c.at, c.len, { ...(o.params ?? {}), ...c.extra, text: c.text }, c.home.id));
  }

  /** The film's caption template (an id from `catalog CAP`, or its handle CAP-xx): every common.caption that names none of its own
   *  draws with it, and speechCaptions without a type makes common.caption captions lighting up word by word. */
  captionTemplate(id: string) {
    const by = idOfHandle(id), want = by?.startsWith('caption:') ? by.slice(8) : id;
    if (!templateOf(want) && !(this.p.meta.captionTemplates as Record<string, unknown> | undefined)?.[want]) throw new Error(`沒有「${id}」這個字幕範本：npm run tellcut -- catalog CAP 列出全部`);
    this.p.meta.captionTemplate = want;
    // speech captions made before this call take the template when drawn, but were made without the word times that light them up
    if (this.plainSpeech) this.notes.push(`c.captionTemplate('${want}') 在 speechCaptions 之後才呼叫：之前做的講話字幕不會逐字亮起，請把它移到 cut.ts 前面`);
    return this;
  }

  /** The film's title template (an id from `catalog TTL`, or its handle TTL-xx): every common.heading that names none of its own
   *  draws with it. */
  titleTemplate(id: string) {
    const by = idOfHandle(id), want = by?.startsWith('title:') ? by.slice(6) : id;
    if (!titleTemplateOf(want) && !(this.p.meta.titleTemplates as Record<string, unknown> | undefined)?.[want]) throw new Error(`沒有「${id}」這個標題範本：npm run tellcut -- catalog TTL 列出全部`);
    this.p.meta.titleTemplate = want;
    return this;
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
    return linePlan(pieces, lines, o).map((c) => this.text(o.type ?? 'common.caption', c.at, c.len, { ...(o.params ?? {}), ...c.extra, text: c.text }, c.home.id));
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
    const call = `c.music('${media}')`, from = num(o.from ?? 0, `${call} 的 from`, { min: 0 }), long = this.inv.music.find((x) => x.id === media)?.duration;
    // past the song's end the music had no length, and save() failed with "fadeIn ≥ 0"
    if (long && from >= long) throw new Error(`${call} 的 from ${from} 秒超過這首歌的長度（${long} 秒）`);
    this.song = { media, from, gain: num(o.gain ?? 0, `${call} 的 gain`), fadeIn: num(o.fadeIn ?? 0, `${call} 的 fadeIn`, { min: 0 }), fadeOut: num(o.fadeOut ?? 2, `${call} 的 fadeOut`, { min: 0 }) };
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
      if (k === parts.length) throw new Error(`旁白「${scene}」的字幕句子和 narration.json 對不上（旁白是舊的切句方式做的）：npm run voice -- ${basename(this.dir)} ${scene} 會照現在的規則重切（聲音不用重做）`);
      out.push(s.gloss[k++]);
    }
    return out;
  }
  /** whether the project's own fx `type` certainly never reads `word`: the one c.fx() file that names the type, importing nothing,
   *  does not have the word anywhere (false when that cannot be told) */
  private fxNeverSays(type: string, word: string): boolean {
    const files = (this.p.meta.fx ?? []).map((f) => join(this.dir, f)).filter((f) => existsSync(f)).map((f) => readFileSync(f, 'utf8'))
      .filter((s) => [`'${type}'`, `"${type}"`, `\`${type}\``].some((q) => s.includes(q)));
    return files.length === 1 && !/\bimport\b|\bexport\s*(?:\*|\{[^}]*\}\s*from)/.test(files[0]) && !files[0].includes(word);
  }
  /** Captions from a narration scene's phrases (common.caption by default; other keys are its params). Each stays up until the next begins.
   *  A phrase with a translation (the scene's gloss) gets it under the line, at 0.75 of its size in the caption's own colour unless the params say otherwise. */
  voiceCaptions(v: VoicePlaced, o: { type?: string; [k: string]: unknown } = {}): string[] {
    const { type = 'common.caption', ...params } = o;
    // a block without a gloss parameter would never draw the translation: say so rather than lose it. A project's own fx may read
    // a param it does not list, so it is only refused when its file (one c.fx() named, importing nothing) never says "gloss"
    const def = plugins.flatMap((p) => p.items ?? []).find((t) => t?.type === type);
    const deaf = def ? !def.params?.some((d) => d.key === 'gloss') : type.startsWith('fx.') && this.fxNeverSays(type, 'gloss');
    if (deaf && v.phrases.some((ph) => ph.gloss !== undefined))
      throw new Error(`c.voiceCaptions：${type} 沒有 gloss 參數，這個場景的翻譯（narration.json 的 gloss）不會顯示；雙語字幕用 common.caption（style 選它的樣式）${def ? '' : `、在 ${type} 裡畫出 params.gloss`}，或拿掉 gloss`);
    // the line's own colour: common.caption prints it in its ink on paper styles and in hl for big; left to the caption (its
    // default) when the params do not set that colour, except plain white, the colour of `color`
    const key = type === 'common.caption' ? lineColorKey(String(params.style ?? 'outline')) : 'color';
    const own = (params[key] as string | undefined) ?? (key === 'color' ? '#ffffff' : undefined);
    return v.phrases.map((ph, i) => {
      const next = v.phrases[i + 1], end = next ? Math.max(ph.t1, Math.min(next.t0, ph.t1 + 0.5)) : ph.t1 + 0.3;
      const gloss = ph.gloss !== undefined ? { glossSize: 0.75, ...(own ? { glossColor: own } : {}), ...params, gloss: ph.gloss } : params;
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
    this.burnedSkipNotes();
    await resolveBurnedFaces(this.faceCtx(), this.burnedAsks, this.autoFocus);   // before the focus: it may take a clip's focus over
    await resolveAutoFocus(this.faceCtx(), this.autoFocus);   // the crops first: a sticker follows a face through the final crop, a blur backdrop copies it
    this.addLayout(duration);
    this.captionsUnderPanel();
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
    // the old core.title / core.caption (c.effect or a type: option asked for one): new films use the shared blocks
    const old = allItems(this.p).map((x) => (x.item as { type?: string }).type ?? '').filter((type) => OLD_BLOCKS[type]);
    for (const type of new Set(old)) this.notes.push(`${type} 是舊積木（只為了讓舊專案打得開）：這支片有 ${old.filter((x) => x === type).length} 個，請改用 ${OLD_BLOCKS[type]}`);
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
