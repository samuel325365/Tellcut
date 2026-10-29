import type { Crop, Project, SceneItem } from './schema.ts';
import type { Theme } from './theme.ts';
import type { MotionKit } from './motion.ts';

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

/** stab: export-time stabilisation of the cut (vidstab), when the clip asks for it */
export interface MediaRef { source: string; in: number; out: number; speed: number; interp: 'none' | 'blend' | 'mci'; stab?: { smoothing: number; zoom: number } }
export interface StillRef { source: string; t: number; w?: number; square?: number; strip?: { n: number; dur: number } }
export interface AudioRef { source: string; in: number; out: number }

export interface MediaApi {
  /** Attach the clip for `ref` inside `parent`, showing `local` timeline-seconds after the ref's start.
   *  `held`: the clip shows one frame (past its freezeAt), so a playing preview keeps it paused there. */
  video(ref: MediaRef, parent: HTMLElement, local: number, held?: boolean): HTMLVideoElement;
  /** Position a video as cover inside a w×h box using the unified crop geometry. */
  place(video: HTMLVideoElement, w: number, h: number, crop: Crop, srcW?: number, srcH?: number): void;
  stillUrl(ref: StillRef): string;
  /** URL of a file inside the project folder, by its path relative to project.json (e.g. 'media/fonts/x.ttf'). */
  fileUrl(path: string): string;
}

export interface ItemCtx<P = Record<string, any>> {
  t: number; local: number; dur: number;
  item: SceneItem; params: P; root: HTMLElement;
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
}

/** a shared block's group in the catalog and in the page chat's block index (names: BLOCK_CATEGORY in @tellcut/protocol) */
export type BlockCategory = 'text' | 'chapter' | 'card' | 'number' | 'travel' | 'frame' | 'phone' | 'mark' | 'look' | 'moment';

export interface ItemType<P = Record<string, any>, S = any> {
  type: string; label: string; kind: 'scene' | 'overlay';
  /** one line for the block catalog (`npm run tellcut -- catalog`): what it looks like and when to use it */
  doc?: string;
  /** every common block has one (a test checks): it puts the block in the catalog's groups and the chat's index */
  category?: BlockCategory;
  /** the agent never picks it on its own (Tellcut's dachshund): the catalog lists it apart, under 只在使用者指名時用, and the chat's
   *  block index leaves it out; search, the gallery and `catalog <type>` find it as usual */
  onRequest?: boolean;
  params: ParamDef[];
  /** CSS mix-blend-mode for the whole item layer against the items below it (layers are otherwise isolated). */
  blend?: string;
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
  /** Media this item needs at export time (cut by tools/prepare.ts). Must not touch the DOM.
   *  `types` (the registry, as ctx.types): a block that hosts another (common.card's picture window) adds the hosted block's media. */
  media?(item: SceneItem, project: Project, types?: (type: string) => ItemType | undefined): { videos: MediaRef[]; stills: StillRef[] };
}

export interface SfxBus { out: AudioNode; verb: AudioNode; noise: AudioBuffer }
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
}

/** A Google Fonts family spec ('Noto Serif TC:wght@200;300') or an open font file to download as is. `file`: keep it under that
 *  name (fonts/files/<file>) instead of a hashed one; `face: false`: download only, no @font-face (a TTF that three.js extrudes). */
export type FontSpec = string | { family: string; url: string; weight?: string; style?: string; file?: string; face?: boolean };
