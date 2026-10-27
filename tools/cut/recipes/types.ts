// What a recipe is (toolkit phase 4): a function that lays out a whole kind of video from a small data object, using only Cut's public methods.
import { z } from 'zod';
import type { Cut } from '../cut.ts';

export const ThemeSchema = z.record(z.unknown());

export interface Recipe<S extends z.ZodTypeAny> {
  id: string; label: string;
  /** one line: what it makes and for what */
  doc: string;
  schema: S;
  /** a filled-in content object (shown by `npm run tellcut -- recipe <id>`) */
  example: z.input<S>;
  /** things to know when filling it in (shown with the example) */
  notes?: string[];
  run(c: Cut, content: z.output<S>): Record<string, unknown>;
}
