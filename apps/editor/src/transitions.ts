// The clip transitions as the editor shows them: each type's name (in the dictionaries), its mark on the timeline block, and
// which options it has. The types themselves and how each is drawn are the engine's (schema.ts TRANSITION_TYPES, geometry.ts).
import { TRANSITION_CENTRE_TYPES, TRANSITION_DIR_TYPES, TRANSITION_TYPES, type TransitionFallback, type TransitionType } from '@tellcut/engine';
import { DICTS, t, type Key } from './i18n/index.ts';

const NAME: Record<TransitionType, Key> = {
  cut: 'ed.transCut', dissolve: 'ed.transDissolve', slide: 'ed.transSlide', wipe: 'ed.transWipe', iris: 'ed.transIris', clock: 'ed.transClock',
  bars: 'ed.transBars', push: 'ed.transPush', zoom: 'ed.transZoom', whip: 'ed.transWhip', blur: 'ed.transBlur', dip: 'ed.transDip', flash: 'ed.transFlash',
};
/** the type's name in the UI language (tooltips, notes); a type an older editor does not know is named by its id */
export const transName = (type: string) => (Object.hasOwn(NAME, type) ? t(NAME[type as TransitionType]) : type);

/** the Properties menu: every type in the engine's order (cut first), named in English like the panel's other labels */
export const TRANSITION_MENU: Array<[TransitionType, string]> = TRANSITION_TYPES.map((x) => [x, DICTS.en[NAME[x]].replace(/^./, (c) => c.toUpperCase())]);

/** the mark on a transition block: one plain glyph per type */
export const TRANS_MARK: Record<Exclude<TransitionType, 'cut'>, string> = {
  dissolve: '◢', slide: '➜', wipe: '◧', iris: '◉', clock: '◔', bars: '▥', push: '⇉', zoom: '⤢', whip: '≫', blur: '░', dip: '■', flash: '✦',
};
export const transMark = (type: string) => TRANS_MARK[type as keyof typeof TRANS_MARK] ?? '◆';

export const usesDir = (type: string) => (TRANSITION_DIR_TYPES as readonly string[]).includes(type);
export const usesCentre = (type: string) => (TRANSITION_CENTRE_TYPES as readonly string[]).includes(type);

/** a new type for a clip's transition: the length stays (0.5 s coming from a cut), `dir` stays when the new type reads it (slide's
 *  'l' when there was none, as the menu always did), the centre when it reads x, y; what the new type does not read goes */
export function retype(cur: { type: string; dur: number; dir?: string; x?: number; y?: number } | undefined, type: string) {
  if (type === 'cut') return undefined;
  return { type, dur: cur?.dur ?? 0.5, ...(usesDir(type) ? { dir: cur?.dir ?? 'l' } : {}),
    ...(usesCentre(type) && cur?.x != null ? { x: cur.x } : {}), ...(usesCentre(type) && cur?.y != null ? { y: cur.y } : {}) };
}

const WHY: Record<TransitionFallback, Key> = { shape: 'ed.transFallbackShape', frame: 'ed.transFallbackFrame', from: 'ed.transFallbackFrom' };
/** the note under the menu when the clip's transition is drawn as a dissolve (engine transitionFallbacks) */
export const fallbackNote = (type: string, why: TransitionFallback) => t(WHY[why], { kind: transName(type) });
