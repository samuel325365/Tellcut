// Colours every look shares: who is speaking.
import type { Theme } from '@tellcut/engine';

/** the text colour of speaker 0–3: 0 the caption's own, 1 the theme's accent2, 2 its hl (highlight), 3 its accent */
export const speakerTextColor = (speaker: number, color: string, theme: Theme) => [color, theme.palette.accent2, theme.palette.hl, theme.palette.accent][Math.max(0, Math.min(3, Math.round(speaker)))];
