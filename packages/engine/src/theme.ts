// The project theme (toolkit phase 2b): the look shared by every block — palette, fonts, safe area, corner radius, stroke.
// A block parameter that names a theme field (ParamDef.theme) takes its default from here: item params > theme > the block's own default.
import { z } from 'zod';
import type { ParamDef } from './plugin.ts';

export const ThemeZ = z.object({
  palette: z.object({ ink: z.string(), paper: z.string(), accent: z.string(), accent2: z.string(), hl: z.string() }).partial(),
  fonts: z.object({ display: z.string(), body: z.string(), mono: z.string() }).partial(),
  /** keep-clear margins as fractions of the frame: short-video apps cover the bottom and the right edge */
  safe: z.object({ top: z.number().min(0).max(0.5), bottom: z.number().min(0).max(0.5), side: z.number().min(0).max(0.5) }).partial(),
  /** corner radius and outline width in pixels at 1080 wide */
  radius: z.number().min(0), stroke: z.number().min(0),
}).partial();
export type ThemeInput = z.infer<typeof ThemeZ>;

export interface Theme {
  palette: { ink: string; paper: string; accent: string; accent2: string; hl: string };
  fonts: { display: string; body: string; mono: string };
  safe: { top: number; bottom: number; side: number };
  radius: number; stroke: number;
  /** what the project's own theme sets, before the defaults fill the rest (read by a ParamDef with themeIfSet) */
  own?: ThemeInput;
}

/**
 * The keep-clear margins a frame of this shape needs (guides/genres/README.md "Ratios"): 9:16 has the platform's account name on top (about 220 px), the
 * caption and music line below (420 px) and the buttons on the right (130 px); that table prints these in pixels and
 * check's platform area uses these (review3 R3-H7); 1:1 and 4:5 sit in a feed with almost nothing over
 * them; wide frames keep to the TV title-safe 90 % and clear YouTube's player bar at the bottom (about 12 %).
 */
export function defaultSafe(width: number, height: number): Theme['safe'] {
  const r = height / width;
  if (r >= 1.5) return { top: 0.115, bottom: 0.22, side: 0.12 };
  if (r >= 0.9) return { top: 0.06, bottom: 0.08, side: 0.06 };
  return { top: 0.06, bottom: 0.12, side: 0.05 };
}

/** the defaults of a 9:16 film; resolveTheme with the frame size gives the safe area of other shapes */
export const DEFAULT_THEME: Theme = {
  palette: { ink: '#1a1a1a', paper: '#fff8ec', accent: '#ff4d4f', accent2: '#2ec4b6', hl: '#ffe14d' },
  fonts: { display: 'Noto Sans TC', body: 'Noto Sans TC', mono: 'Consolas' },
  safe: defaultSafe(1080, 1920),
  radius: 24, stroke: 8,
};

/** The theme with every missing field filled from the defaults; `size` (the project's width and height) picks the safe area. */
export function resolveTheme(input?: ThemeInput, size?: { width: number; height: number }): Theme {
  const t = input ?? {}, safe = size ? defaultSafe(size.width, size.height) : DEFAULT_THEME.safe;
  return {
    palette: { ...DEFAULT_THEME.palette, ...t.palette }, fonts: { ...DEFAULT_THEME.fonts, ...t.fonts }, safe: { ...safe, ...t.safe },
    radius: t.radius ?? DEFAULT_THEME.radius, stroke: t.stroke ?? DEFAULT_THEME.stroke, own: t,
  };
}

/** The value of a dotted theme path ("palette.accent"), or undefined. */
export function themeValue(theme: Theme | ThemeInput, path: string): unknown {
  return path.split('.').reduce<any>((o, k) => (o && typeof o === 'object' ? o[k] : undefined), theme);
}

/** The default of one parameter for a project: its theme field when it names one that exists (with themeIfSet: one the project's
 *  own theme sets), else the block's own default. */
export function paramDefault(def: ParamDef, theme: Theme): unknown {
  const v = def.theme ? themeValue(def.themeIfSet ? theme.own ?? {} : theme, def.theme) : undefined;
  return v === undefined ? def.default : v;
}
