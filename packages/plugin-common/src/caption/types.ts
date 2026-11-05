// common.caption's parameters, the elements it builds, and the shape of a look (one style's own parts: its font, colours, box,
// decorations). The caption block (index.ts) lays out the line, its name, tag, gloss and animation the same way for every
// look and asks the look only what differs, so a look knows nothing of the word effects or the animations around it.
import type { Theme } from '@tellcut/engine';
import type { RunBox } from '../runs.ts';
import type { WordBox } from './wordfx.ts';
import type { GrainLayer } from '../sketch.ts';

export interface CaptionP {
  text: string; template: string; wordFx: string; accent: string; style: string; styleFont: string; y: number; tint: boolean; size: number; font: string; color: string; hl: string; outline: string; boxBg: string; bubbleBg: string;
  position: 'bottom' | 'center' | 'top'; animIn: string; animOut: string; animDur: number; words: Array<[number, number]>; speaker: number; name: string;
  hlScale: number; bigColor: string; badgeTint: boolean; tag: string; gloss: string; glossSize: number; glossColor: string; quote: boolean; fill: boolean; role: string; align: 'center' | 'left'; point: 'none' | 'up' | 'down' | 'left' | 'right';
  /** not a parameter: the lines the words may take before they shrink (a caption 2; common.heading passes its own line count) */
  maxLines?: number;
}
export interface CaptionS { box: HTMLElement; text: RunBox; words: WordBox; name: HTMLElement; tag: HTMLElement; gloss: HTMLElement; nameText: HTMLElement; role: HTMLElement; chip: HTMLElement; arrow: HTMLElement; chipName: HTMLElement; band: HTMLCanvasElement; layer: GrainLayer; wash: HTMLElement }

/** what a look is told while the caption draws */
export interface LookEnv {
  p: CaptionP; theme: Theme; W: number; H: number; local: number;
  /** min(W, H) / 1080 */
  k: number;
  /** the line's font size before fitting (look's sizeScale included) */
  px: number;
  /** the speaker's colour, and the words' colour (the speaker's unless tint is off) */
  who: string; ink: string;
  /** set flush left (align left, or a look that always is) */
  left: boolean;
  /** the font size the line was fitted to (px × the fit's scale) */
  fs: number;
  /** the caption's opacity from its animation (before a look's own pop fade) */
  opacity: number;
}

export type Css = Record<string, string>;

/** a look's words: every word, the hot ones (【marked】 and the one being said), the dim ones (not said yet), the one on the box;
 *  `box`: the colour of the block that slides behind the word being said */
export interface WordStyle { base?: Css; hot?: Css; dim?: Css; onbox?: Css; box?: string;
  /** each character its own look (cut-out letters): character i of the line, c */
  char?: (i: number, c: string) => Css }

export interface CaptionLook {
  id: string;
  /** not offered as a title's look (common.heading): the layouts made for talk (qa, news, chat…) */
  title?: false;
  /** a title's own look (looks/title.ts): not offered as a caption style */
  only?: 'title';
  /** prints the line in ink (`outline`) on paper: its gloss is ink too, and the highlight colour stays off the words */
  paper?: boolean;
  /** the paper is under each line only (marker, tape): the gloss is on the picture, in the highlight colour with a dark shadow */
  bareGloss?: boolean;
  /** the font this look brings (styleFont, then a font the item sets itself, replace it) */
  font?: string;
  /** '900' unless set */
  weight?: string;
  /** × the size parameter (big: 1.25) */
  sizeScale?: number;
  /** always set flush left (qa) */
  left?: boolean;
  /** the room the words have in a line `width` px wide (a box's padding and border taken out); default all of it */
  room?(e: Omit<LookEnv, 'fs'>, width: number): number;
  /** the colour of highlighted runs (【word】, the word being said); default `hl` */
  hl?(e: Omit<LookEnv, 'fs'>): string;
  /** the line's colour; default the speaker's (`ink`) */
  color?(e: LookEnv): string;
  /** the outline's width in px; default none */
  stroke?(e: LookEnv): number;
  /** the box's own CSS: background, padding, borderRadius, border, textShadow (missing ones are reset) */
  box?(e: LookEnv): Css;
  /** a transform after the caption's own (a pop, a tilt), its clip-path, and where it scales from */
  pin?(e: LookEnv): string;
  clip?(e: LookEnv): string;
  origin?: string;
  /** pops in by itself (auto, big): its scale at `local`, after the caption's own transform; it fades in with it, the opacity
   *  times prog(local, 0, 0.14) */
  popScale?(local: number): number;
  /** the outline's colour; default `outline` (the ink) */
  strokeColor?(e: LookEnv): string;
  /** after the line's text is set: each line's element (per-line decorations: strips, slabs, marker strokes); `words`: the lines
   *  hold a span a word (wordfx.ts), styled by the word effects after this, so their spans are not the look's to style */
  lines?(lines: HTMLElement[], e: Omit<LookEnv, 'fs'>, words?: boolean): void;
  /** how its words look one by one (wordfx.ts): set, the caption always draws a span a word (gradient text needs it) */
  word?(e: LookEnv): WordStyle;
  /** what a hot word adds when the caption draws a span a word anyway (a word effect), without making it always do so: strip's
   *  highlighter stroke, which its lines() gives the runs. Through the word effects it is set and cleared with the word's own state */
  wordHot?(e: LookEnv): Css;
  /** the gloss's extra CSS (strip: a strip of its own) and its display; the default resets what a look may set */
  gloss?(s: CaptionS, e: LookEnv): Css;
  /** draws the name its own way (qa's badge); return false to leave it to the caption */
  name?(s: CaptionS, e: LookEnv): boolean;
  /** after the box is styled: decorations that measure it (crayon's band, qa's wash; the caption hides both before every draw) */
  after?(s: CaptionS, e: LookEnv): void;
}
