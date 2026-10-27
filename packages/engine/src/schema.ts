import { ThemeZ } from './theme.ts';
import { z } from 'zod';

const sec = z.number().finite();
const nonneg = sec.min(0);
const db = z.number().min(-120).max(24);

export const CropZ = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), zoom: z.number().min(1).max(8) });
/** A crop keyframe between a clip's from (0) and to (its end), at clip-local seconds t. */
export const CropKeyZ = CropZ.extend({ t: sec });   // a head trim can leave one before 0: kept, inactive
export const EASES = ['linear', 'in', 'out', 'inOut'] as const;
/** Decaying camera shake inside a clip: from `at` for `dur` clip-local seconds, up to `px` frame pixels. */
export const ShakeZ = z.object({ at: sec, dur: z.number().positive(), px: z.number().positive(), hz: z.number().positive().default(18) });
/** Export-only stabilisation (vidstab): smoothing in frames, zoom in percent. */
export const StabilizeZ = z.object({ smoothing: z.number().int().min(1).max(100).default(20), zoom: z.number().min(0).max(20).default(3) });
/** One point of a moving layer's path (toolkit phase 5): at t seconds into the item, where and how big. */
export const TransformKeyZ = z.object({ t: sec, x: z.number().min(-1).max(1), y: z.number().min(-1).max(1), scale: z.number().min(0.05).max(10) });
/** Position and size of a scene/overlay layer: x, y in frame fractions, scale around (ox, oy) of the layer. With `keys` the layer
 *  moves along them (linear between points, held before the first and after the last); x, y, scale are then its place at the start. */
export const TransformZ = z.object({ x: z.number().min(-1).max(1), y: z.number().min(-1).max(1), scale: z.number().min(0.05).max(10),
  ox: z.number().min(0).max(1).default(0.5), oy: z.number().min(0).max(1).default(0.5), keys: z.array(TransformKeyZ).optional() });
export const Rect01Z = z.tuple([z.number(), z.number(), z.number().positive(), z.number().positive()]);
export const GainPointZ = z.tuple([sec, db]);
const Params = z.record(z.unknown());
const base = { id: z.string().min(1), start: sec, end: sec, parent: z.string().optional(), label: z.string().optional() };

export const VideoItemZ = z.object({
  ...base,
  source: z.string(), in: nonneg, speed: z.number().positive().max(16),
  frame: Rect01Z.default([0, 0, 1, 1]),
  crop: z.object({ from: CropZ, to: CropZ, keys: z.array(CropKeyZ).optional(), ease: z.enum(EASES).optional() }),
  transitionIn: z.object({ type: z.enum(['cut', 'dissolve', 'slide']), dur: nonneg, dir: z.enum(['l', 'r', 'u', 'd']).optional() }).optional(),
  grade: z.string().nullable().optional(),
  freezeAt: nonneg.nullable().optional(),
  defocus: z.object({ from: nonneg, to: nonneg, px: z.number().min(0), px0: z.number().min(0).optional() }).optional(),
  interp: z.enum(['none', 'blend', 'mci']).default('none'),
  opacity: z.number().min(0).max(1).optional(),
  radius: z.number().min(0).optional(),
  shake: z.array(ShakeZ).optional(),
  stabilize: StabilizeZ.optional(),
});
export const SceneItemZ = z.object({ ...base, type: z.string().min(1), params: Params, transform: TransformZ.optional() });
export const OverlayItemZ = SceneItemZ;
const audioCommon = { ...base, gain: db, envelope: z.array(GainPointZ).optional(), fadeIn: nonneg, fadeOut: nonneg, muted: z.boolean().optional() };
/** toEnd: on a project with a magnetic track the clip ends with the film (spec 2026-10-15-proposals-magnetic §4.2) */
export const MusicItemZ = z.object({ ...audioCommon, media: z.string(), in: nonneg, toEnd: z.boolean().optional() });
export const AudioItemZ = z.object({ ...audioCommon, source: z.string(), in: nonneg, rate: z.number().positive().max(4) });
export const SfxItemZ = z.object({ ...base, type: z.string().min(1), params: Params, gain: db });

const trackBase = { id: z.string().min(1), name: z.string().optional(), muted: z.boolean().optional() };
const mixBase = { gain: db.default(0), solo: z.boolean().optional(), envelope: z.array(GainPointZ).optional() };
export const TrackZ = z.discriminatedUnion('kind', [
  z.object({ ...trackBase, kind: z.literal('scene'), items: z.array(SceneItemZ) }),
  // magnetic: clips butt from 0 and edits ripple (one magnetic track per project)
  z.object({ ...trackBase, kind: z.literal('video'), magnetic: z.boolean().optional(), items: z.array(VideoItemZ) }),
  z.object({ ...trackBase, kind: z.literal('overlay'), items: z.array(OverlayItemZ) }),
  z.object({ ...trackBase, ...mixBase, kind: z.literal('music'), items: z.array(MusicItemZ) }),
  z.object({ ...trackBase, ...mixBase, kind: z.literal('audio'), items: z.array(AudioItemZ) }),
  z.object({ ...trackBase, ...mixBase, kind: z.literal('sfx'), items: z.array(SfxItemZ) }),
]);

export const MixZ = z.object({
  master: z.number().positive(),
  compressor: z.object({ threshold: z.number(), ratio: z.number(), attack: z.number(), release: z.number() }),
  reverb: z.object({ seconds: z.number().positive(), send: z.number().min(0) }),
});

const ProjectShape = z.object({
  version: z.literal(1),
  meta: z.object({
    name: z.string(),
    width: z.number().int().positive(), height: z.number().int().positive(),
    fps: z.number().int().positive(), duration: z.number().positive(),
    plugins: z.array(z.string()),
    /** project-local item types (toolkit phase 2a): ES modules in the project folder, each default-exporting an ItemType[] whose ids start with 'fx.' */
    fx: z.array(z.string()).optional(),
    /** the look shared by the common blocks (toolkit phase 2b); absent: the defaults */
    theme: ThemeZ.optional(),
    background: z.string().default('#000'),
    /** How Ken Burns zoom is rendered: transform (GPU-scaled will-change layer) or layout (video sized directly). */
    videoScale: z.enum(['transform', 'layout']).default('transform'),
    cut: z.object({ crf: z.number().int().min(0).max(51), preset: z.string() }).default({ crf: 18, preset: 'medium' }),
    /** integrated loudness target of an export in LUFS (absent: -14) */
    loudness: z.number().min(-30).max(-6).optional(),
    /** the home-page preset the project was made from (spec 2026-10-23-presets-and-languages §6.3) */
    // fields: the options set in its form (spec 2026-10-24-custom-preset §6)
    preset: z.object({ id: z.string(), styles: z.array(z.string()).default([]), fields: z.record(z.string()).optional() }).optional(),
    mix: MixZ,
  }),
  sources: z.record(z.object({ path: z.string(), duration: z.number().positive(), width: z.number().int().positive().default(1920), height: z.number().int().positive().default(1080),
    // optional (spec 2026-10-14 §4.2): a photo, when and where it was taken, whether a video has sound
    kind: z.enum(['video', 'image']).optional(), taken: z.string().optional(), takenOffset: z.string().optional(), takenGuess: z.boolean().optional(),
    gps: z.tuple([z.number(), z.number()]).optional(), audio: z.boolean().optional(),
    // a stitched map picture (`assets map`): Web Mercator, the world 256·2^zoom px wide, the picture's middle at center [lon, lat];
    // credit: the tiles' attribution (common.mapcam shows it)
    map: z.object({ center: z.tuple([z.number(), z.number()]), zoom: z.number(), credit: z.string().optional() }).optional() })),
  // duration: the music file's length in seconds when known (music ending with the film stops there)
  media: z.record(z.object({ path: z.string(), duration: z.number().positive().optional() })),
  grids: z.array(z.object({ id: z.string(), at: sec, bpm: z.number().positive(), until: sec.optional() })),
  markers: z.array(z.object({ t: sec, label: z.string() })).optional(),
  tracks: z.array(TrackZ),
});

export const ProjectZ = ProjectShape.superRefine((p, ctx) => {
  const ids = new Set<string>();
  for (const tr of p.tracks) for (const it of tr.items) ids.add(it.id);
  const mags = p.tracks.filter((t: any) => t.kind === 'video' && t.magnetic).map((t) => t.id);
  if (mags.length > 1) ctx.addIssue({ code: 'custom', path: ['tracks'], message: `only one magnetic track allowed (${mags.join(', ')})` });
  const seen = new Set<string>();
  p.tracks.forEach((tr, ti) => {
    if (seen.has(tr.id)) ctx.addIssue({ code: 'custom', path: ['tracks', ti, 'id'], message: `duplicate id "${tr.id}"` });
    seen.add(tr.id);
    tr.items.forEach((it: any, ii) => {
      const path = ['tracks', ti, 'items', ii];
      if (seen.has(it.id)) ctx.addIssue({ code: 'custom', path: [...path, 'id'], message: `duplicate id "${it.id}"` });
      seen.add(it.id);
      if (!(it.end > it.start)) ctx.addIssue({ code: 'custom', path: [...path, 'end'], message: 'end must be greater than start' });
      if (it.parent !== undefined && !ids.has(it.parent)) ctx.addIssue({ code: 'custom', path: [...path, 'parent'], message: `unknown parent "${it.parent}"` });
      if ('source' in it && !(it.source in p.sources)) ctx.addIssue({ code: 'custom', path: [...path, 'source'], message: `unknown source "${it.source}"` });
      if ('source' in it && it.source in p.sources && it.in >= p.sources[it.source].duration)
        ctx.addIssue({ code: 'custom', path: [...path, 'in'], message: `in (${it.in} s) is past the end of source "${it.source}" (${p.sources[it.source].duration} s)` });
      if ('media' in it && !(it.media in p.media)) ctx.addIssue({ code: 'custom', path: [...path, 'media'], message: `unknown media "${it.media}"` });
    });
  });
  // a loop of parents has no time: the file was written, then opened nowhere (player, editor, export all threw)
  const parent = new Map<string, string>(), looped = new Set<string>();
  for (const tr of p.tracks) for (const it of tr.items as Array<{ id: string; parent?: string }>) if (it.parent !== undefined) parent.set(it.id, it.parent);
  p.tracks.forEach((tr, ti) => tr.items.forEach((it, ii) => {
    const chain = [it.id];
    for (let x = parent.get(it.id); x !== undefined && !looped.has(x); x = parent.get(x)) {
      if (x === it.id) {
        chain.forEach((id) => looped.add(id));
        ctx.addIssue({ code: 'custom', path: ['tracks', ti, 'items', ii, 'parent'], message: `parent loop: ${[...chain, x].join(' -> ')}` });
        break;
      }
      if (chain.includes(x)) break;   // a loop further up: reported from one of its own items
      chain.push(x);
    }
  }));
});

export type Project = z.infer<typeof ProjectShape>;
export type Track = Project['tracks'][number];
export type TrackKind = Track['kind'];
export type VideoItem = z.infer<typeof VideoItemZ>;
export type SceneItem = z.infer<typeof SceneItemZ>;
export type OverlayItem = SceneItem;
export type MusicItem = z.infer<typeof MusicItemZ>;
export type AudioItem = z.infer<typeof AudioItemZ>;
export type SfxItem = z.infer<typeof SfxItemZ>;
export type AnyItem = VideoItem | SceneItem | MusicItem | AudioItem | SfxItem;
export type Crop = z.infer<typeof CropZ>;
export type Transform = z.infer<typeof TransformZ>;
export type GainPoint = z.infer<typeof GainPointZ>;
export type Rect01 = z.infer<typeof Rect01Z>;
export type Mix = z.infer<typeof MixZ>;

export class ProjectError extends Error {
  constructor(public issues: string[]) { super(`Invalid project:\n${issues.join('\n')}`); }
}

/** the project.json format this Tellcut writes */
export const PROJECT_VERSION = 1;
type Migration = (p: any) => any;
/** version n → n + 1, each one step (none yet: version 1 is the first). A step returns the project with `version` raised. */
const MIGRATIONS: Record<number, Migration> = {};

/**
 * An older project.json brought up to PROJECT_VERSION, one step at a time; a newer one is refused in words (review3 R3-H8:
 * a project from a newer Tellcut failed as "Invalid literal value"). Anything that is not a versioned object is left to the schema.
 */
export function migrateProject(json: unknown, steps: Record<number, Migration> = MIGRATIONS): unknown {
  let p = json as any;
  if (!p || typeof p !== 'object' || typeof p.version !== 'number') return json;
  if (p.version > PROJECT_VERSION) throw new ProjectError([`這個專案是用較新的 Tellcut 存的（版本 ${p.version}，這個 Tellcut 只認到 ${PROJECT_VERSION}）：請先更新 Tellcut`]);
  while (p.version < PROJECT_VERSION) {
    const step = steps[p.version];
    if (!step) throw new ProjectError([`不認得專案格式版本 ${p.version}（沒有從它升級的方法）`]);
    p = step(p);
  }
  return p;
}

export function parseProject(json: unknown): Project {
  const r = ProjectZ.safeParse(migrateProject(json));
  if (r.success) return r.data;
  throw new ProjectError(r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));
}

export function allItems(p: Project): Array<{ track: Track; item: AnyItem; index: number }> {
  const out: Array<{ track: Track; item: AnyItem; index: number }> = [];
  for (const track of p.tracks) track.items.forEach((item, index) => out.push({ track, item: item as AnyItem, index }));
  return out;
}

