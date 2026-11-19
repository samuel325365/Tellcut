import type { Crop, Project, SceneItem } from './schema.ts';
import type { Theme } from './theme.ts';
import type { MotionKit } from './motion.ts';
import type { ReportText } from './report.ts';

/** `theme`: a dotted path into the project theme ("palette.accent") the default comes from when the project sets one.
 *  `themeIfSet`: take that field only when the project's own theme sets it, never the theme's built-in default — for a block whose
 *  look predates that default (the `mono` params keep JetBrains Mono unless the project picks `fonts.mono`, whose default is Consolas). */
export type ParamDef = ParamDefBase & { theme?: string; themeIfSet?: boolean };
type ParamDefBase =
  | { key: string; label: string; type: 'number'; min?: number; max?: number; step?: number; default: number }
  | { key: string; label: string; type: 'string' | 'text' | 'color'; default: string }
  | { key: string; label: string; type: 'bool'; default: boolean }
  | { key: string; label: string; type: 'enum'; options: string[]; default: string }
  | { key: string; label: string; type: 'source-ref' | 'media-ref'; default: string }
  | { key: string; label: string; type: 'json'; default: unknown };

/** every ParamDef type: the editor draws a field by it and the catalog describes it by it. A project's own fx is plain JS, so
 *  nothing stops it from writing another (common.token came from one with `textarea` and `boolean`: JSON fields in the editor,
 *  "undefined" in the catalog). */
export const PARAM_TYPES = ['number', 'string', 'text', 'color', 'bool', 'enum', 'source-ref', 'media-ref', 'json'] as const satisfies readonly ParamDef['type'][];
// every type of the union is in the list (a new one added to ParamDef must be added here too)
const _allParamTypes: Exclude<ParamDef['type'], (typeof PARAM_TYPES)[number]> extends never ? true : never = true;
void _allParamTypes;
/** the ParamDef type a mistaken one most likely meant (textarea → text, boolean → bool), when there is one */
const MEANT: Record<string, ParamDef['type']> = {
  textarea: 'text', multiline: 'text', boolean: 'bool', checkbox: 'bool', toggle: 'bool', switch: 'bool', select: 'enum', choice: 'enum',
  int: 'number', integer: 'number', float: 'number', range: 'number', slider: 'number', colour: 'color', str: 'string', object: 'json', array: 'json',
};
/** the params of a block (or sound) whose type is not a ParamDef type, with the one it most likely meant */
export function badParamTypes(t: { params?: readonly unknown[] }): Array<{ key: string; type: string; meant?: ParamDef['type'] }> {
  return (t.params ?? []).flatMap((d) => {
    const def = d as { key?: unknown; type?: unknown }, type = String(def.type);
    if ((PARAM_TYPES as readonly string[]).includes(type)) return [];
    const meant = Object.hasOwn(MEANT, type.toLowerCase()) ? MEANT[type.toLowerCase()] : undefined;
    return [{ key: String(def.key), type, ...(meant ? { meant } : {}) }];
  });
}

/** stab: export-time stabilisation of the cut (vidstab), when the clip asks for it */
export interface MediaRef { source: string; in: number; out: number; speed: number; interp: 'none' | 'blend' | 'mci'; stab?: { smoothing: number; zoom: number } }
export interface StillRef { source: string; t: number; w?: number; square?: number; strip?: { n: number; dur: number } }
export interface AudioRef { source: string; in: number; out: number }
/** a source's sound level: `rate` values a second, each the loudest |sample| of its window, 0..1 (the analysis' peaks.json) */
export interface SourcePeaks { rate: number; peaks: number[] }

export interface MediaApi {
  /** Attach the clip for `ref` inside `parent`, showing `local` timeline-seconds after the ref's start.
   *  `held`: the clip shows one frame (past its freezeAt), so a playing preview keeps it paused there. */
  video(ref: MediaRef, parent: HTMLElement, local: number, held?: boolean): HTMLVideoElement;
  /** Position a video as cover inside a w×h box using the unified crop geometry. */
  place(video: HTMLVideoElement, w: number, h: number, crop: Crop, srcW?: number, srcH?: number): void;
  stillUrl(ref: StillRef): string;
  /** URL of a file inside the project folder, by its path relative to project.json (e.g. 'media/fonts/x.ttf'). */
  fileUrl(path: string): string;
  /** A source's sound level (common.audiogram), fetched once and shared. A preview gets null while the source is not analysed;
   *  an export rejects (prepare made it, see media().peaks). Optional: a test's stand-in may leave it out. */
  peaks?(source: string): Promise<SourcePeaks | null>;
}

export interface ItemCtx<P = Record<string, any>> {
  t: number; local: number; dur: number;
  item: SceneItem; params: P; root: HTMLElement;
  /** the item's further layers, one for each blend mode after the first (ItemType.blend as a list); empty otherwise */
  layers?: HTMLElement[];
  /** Container above every item (e.g. screen-recording touch indicators); shown only while the item is. */
  top: HTMLElement;
  project: Project; media: MediaApi; W: number; H: number; fps: number;
  /** the project theme with every missing field filled (toolkit phase 2b) */
  theme: Theme;
  /** another registered item type, by id: a block that hosts others draws them inside itself (common.card's picture window) */
  types?: (type: string) => ItemType | undefined;
  /** grade id → its CSS filter (the registry's grades): a block that redraws a clip applies the clip's grade itself */
  grades: Record<string, string>;
  /** the ThreeKit of @tellcut/plugin-common, set for every item once the project uses a type marked `three` */
  three?: unknown;
  /** springs, easings, stagger and interpolate (motion.ts), all in seconds: how fx, which may not import, get them */
  motion: MotionKit;
  /** words drawn on a canvas (or in WebGL) are invisible to check, which measures DOM text: call it right after each fillText /
   *  strokeText with the same arguments (ctx.reportText(g, text, x, y)), or with a box of your own ({ text, x, y, w, h, size } in
   *  the item's frame pixels). A no-op except while check measures the frame; it never changes the picture (report.ts). */
  reportText: ReportText;
}

/** one named template of a block (templates.ts): `label` / `doc` in Traditional Chinese like the block's own (English and Japanese in
 *  the editor's blocks.en.ts / blocks.ja.ts, keyed `<type>#<id>`); `doc` says the occasion it is for; `params` only what differs
 *  from the defaults (no colour unless the colour is the point: colours come from the theme) */
export interface BlockTemplate { id: string; label: string; doc: string; params: Record<string, unknown> }

/** a shared block's group in the catalog and in the page chat's block index (names: BLOCK_CATEGORY in @tellcut/protocol) */
export type BlockCategory = 'caption' | 'title' | 'text' | 'chapter' | 'card' | 'number' | 'travel' | 'frame' | 'photo' | 'phone' | 'mark' | 'background' | 'look' | 'moment';

export interface ItemType<P = Record<string, any>, S = any> {
  type: string; label: string; kind: 'scene' | 'overlay';
  /** one line for the block catalog (`npm run tellcut -- catalog`): what it looks like and when to use it */
  doc?: string;
  /** every common block has one (a test checks): it puts the block in the catalog's groups and the chat's index */
  category?: BlockCategory;
  /** the agent never picks it on its own (Tellcut's dachshund): the catalog lists it apart, under 只在使用者指名時用, and the chat's
   *  block index leaves it out; search, the gallery and `catalog <type>` find it as usual */
  onRequest?: boolean;
  /** can take footage but works without it (common.dachshund draws empty film frames): the gallery does not mark it as needing
   *  footage, though it has a media() hook */
  footage?: 'optional';
  params: ParamDef[];
  /** named sets of this block's params (templates.ts): choosing one writes its params into the item, which keeps no template name.
   *  At most MAX_TEMPLATES. Never on common.caption / common.heading, whose `template` PARAM is the other kind (caption and title
   *  templates, resolved at draw time). A project's own fx may carry it too. */
  templates?: BlockTemplate[];
  /** CSS mix-blend-mode for the whole item layer against the items below it (layers are otherwise isolated). Several modes: one
   *  layer each, stacked in order at the item's place, each blending with the picture the ones before made (common.grade's deep:
   *  'color', then 'multiply'); the further layers are ctx.layers, which the stage shows, moves and removes with the item. */
  blend?: string | string[];
  /** The layer is built on fixed element ids (styled by #id): only one item of this type per project. */
  unique?: boolean;
  /** draws with three.js: the player loads ThreeKit before building it; ctx.three is set */
  three?: boolean;
  build(ctx: ItemCtx<P>): S;
  draw(ctx: ItemCtx<P>, state: S): void;
  /** Called after the media pool synced this frame's videos, for what reads a video's current picture (a WebGL texture);
   *  draw() ran first in the same frame. */
  late?(ctx: ItemCtx<P>, state: S): void;
  /** Called once when the item stops showing (free big buffers such as canvases; the state stays). */
  hide?(state: S): void;
  /** Called when the stage drops the item for good (rebuilt after an edit, removed, a new project): free what build and ready
   *  made that the garbage collector cannot (GPU geometries, materials, textures). */
  dispose?(state: S): void;
  /** Resolves once the item's own assets (images, fonts) are loaded: preview and export draw nothing before. */
  ready?(state: S): Promise<void>;
  /** Media this item needs at export time (cut by tools/prepare.ts). Must not touch the DOM. `peaks`: sources whose sound level it
   *  reads (MediaApi.peaks); prepare copies or computes them into cache/peaks.
   *  `types` (the registry, as ctx.types): a block that hosts another (common.card's picture window) adds the hosted block's media. */
  media?(item: SceneItem, project: Project, types?: (type: string) => ItemType | undefined): { videos: MediaRef[]; stills: StillRef[]; peaks?: string[] };
}

export interface SfxBus {
  out: AudioNode; verb: AudioNode; noise: AudioBuffer;
  /** When the sound was due to start in context time, before `at` was kept at 0 or later: earlier than now when a preview
   *  starts after the sound began, so a player can pick it up part way (common's play does) instead of from its start. */
  due?: number;
}
/** a sound effect's group in the gallery and the catalog (names: SFX_CATEGORY in @tellcut/protocol) */
export type SfxCategory = 'alert' | 'chime' | 'hit' | 'move' | 'paper' | 'life';
export interface SfxType {
  type: string; label: string; params: ParamDef[];
  /** one line for the block catalog */
  doc?: string;
  /** every common sound effect has one (a test checks) */
  category?: SfxCategory;
  /** Audible length in seconds (used for item.end and preview look-back). */
  duration(params: Record<string, any>): number;
  /** How far before `from` a preview restart should still trigger this effect. */
  lookback?: number;
  synth(ctx: BaseAudioContext, bus: SfxBus, at: number, params: Record<string, any>): void;
}

export interface Plugin {
  id: string;
  items?: ItemType[];
  sfx?: SfxType[];
  grades?: Record<string, string>;
  css?: string;
  /** SVG filter definitions (`<filter id="<plugin id>-…">`), injected once per page; grades may use `url(#id)`. */
  svg?: string;
  /** fonts the plugin draws with; `npm run fonts` downloads them for offline preview and export */
  fonts?: FontSpec[];
  /** named moments of several layers (combos.ts): pure data, so the cut script, the editor and the catalog read the same list */
  combos?: Combo[];
}

/** One layer of a combo: a picture block (`effect`, from one of its templates or not), a sound effect (`sfx`) or the clip's camera
 *  shake (`shake`, no type). `at` is seconds from the moment (negative: it comes first, a riser), `len` its length. */
export interface ComboPart {
  /** the layer's name in its combo ('lines', 'flash', 'hit'): what `parts: { <name>: false | params }` points at */
  name: string;
  kind: 'effect' | 'sfx' | 'shake';
  /** a block or sound effect type id; none for the shake */
  type?: string;
  /** one of the block's templates (templates.ts) */
  template?: string;
  /** the block's (or sound's) params, over the template's */
  params?: Record<string, unknown>;
  at: number; len: number;
  /** an effect above the captions ('top') or under the video ('under'), as c.effect takes it */
  layer?: 'top' | 'under';
  /** a sound's level in dB */
  gain?: number;
  /** the shake's reach and speed, as c.shake takes them */
  px?: number; hz?: number;
}
/** A named moment (spec 2026-11-16-combos): several layers with their offsets. Placing one expands it into ordinary timeline items
 *  (expandCombo): project.json never names a combo. `label` and `doc` in Traditional Chinese like a block template's (`doc`: the
 *  occasion, then what it looks and sounds like); English and Japanese in the editor's blocks.en.ts / blocks.ja.ts, keyed `combo:<id>`. */
export interface Combo {
  id: string; label: string; doc: string; parts: ComboPart[];
  /** the combo ends the film (closing's shutter and fade to black): placed with the film going on after it, the picture comes back
   *  once its layers are over. Placing never moves the film's end; c.combo and the editor say so instead (ENDING_SLACK) */
  ending?: true;
}

/** A Google Fonts family spec ('Noto Serif TC:wght@200;300') or an open font file to download as is. `file`: keep it under that
 *  name (fonts/files/<file>) instead of a hashed one; `face: false`: download only, no @font-face (a TTF that three.js extrudes). */
export type FontSpec = string | { family: string; url: string; weight?: string; style?: string; file?: string; face?: boolean };
