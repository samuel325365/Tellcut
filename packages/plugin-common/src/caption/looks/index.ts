// Every caption look, in the order the style menu lists them (the first eleven are the styles common.caption always had). A new
// look goes into its family's file and at the end of LOOKS; templates.ts gives it at least one template.
import type { CaptionLook } from '../types.ts';
import { auto, box, bubble, outline, plain } from './basic.ts';
import { big, heavy, hollow, marker, offset, slab } from './bold.ts';
import { cinema, double, frost, punch, soft } from './clear.ts';
import { block, emboss, extrude, longshadow, puffy } from './depth.ts';
import { chrome, duotone, flow, gold, gradient, halo, neon } from './glow.ts';
import { bar, chalk, chat, comic, dialog, lyric, news, qa } from './layout.ts';
import { crayon, label, postit, ransom, sticker, strip, tape, ticket } from './paper.ts';
import { pixel, rgb, scanline, segment, terminal, vhs } from './retro.ts';
import { TITLE_LOOKS } from './title.ts';

export const LOOKS: CaptionLook[] = [outline, plain, box, bubble, ticket, crayon, bar, qa, auto, big, strip,
  punch, double, soft, frost, cinema, slab, hollow, marker, neon, gradient, extrude, sticker,
  heavy, offset, gold, chrome, flow, halo, duotone, longshadow, emboss, block, puffy, tape, postit, label, ransom,
  rgb, pixel, vhs, terminal, segment, scanline, news, chat, lyric, dialog, comic, chalk,
  // a title's own (common.heading only)
  ...TITLE_LOOKS];
const BY_ID = new Map(LOOKS.map((l) => [l.id, l]));
/** the look of `style` (an unknown one draws its words alone, as it always did) */
export const lookOf = (style: string): CaptionLook => BY_ID.get(style) ?? plain;
