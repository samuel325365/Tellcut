// Every caption look, in the order the style menu lists them (the first eleven are the styles common.caption always had). A new
// look goes into its family's file and at the end of LOOKS; templates.ts gives it at least one template.
import type { CaptionLook } from '../types.ts';
import { auto, box, bubble, outline, plain } from './basic.ts';
import { big, hollow, marker, slab } from './bold.ts';
import { cinema, double, frost, punch, soft } from './clear.ts';
import { extrude } from './depth.ts';
import { gradient, neon } from './glow.ts';
import { bar, qa } from './layout.ts';
import { crayon, sticker, strip, ticket } from './paper.ts';

export const LOOKS: CaptionLook[] = [outline, plain, box, bubble, ticket, crayon, bar, qa, auto, big, strip,
  punch, double, soft, frost, cinema, slab, hollow, marker, neon, gradient, extrude, sticker];
const BY_ID = new Map(LOOKS.map((l) => [l.id, l]));
/** the look of `style` (an unknown one draws its words alone, as it always did) */
export const lookOf = (style: string): CaptionLook => BY_ID.get(style) ?? plain;
