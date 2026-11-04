// Every caption look, in the order the style menu lists them. A new look goes into its family's file and into LOOKS.
import type { CaptionLook } from '../types.ts';
import { auto, box, bubble, outline, plain } from './basic.ts';
import { big } from './bold.ts';
import { bar, qa } from './layout.ts';
import { crayon, strip, ticket } from './paper.ts';

export const LOOKS: CaptionLook[] = [outline, plain, box, bubble, ticket, crayon, bar, qa, auto, big, strip];
const BY_ID = new Map(LOOKS.map((l) => [l.id, l]));
/** the look of `style` (an unknown one draws its words alone, as it always did) */
export const lookOf = (style: string): CaptionLook => BY_ID.get(style) ?? plain;
