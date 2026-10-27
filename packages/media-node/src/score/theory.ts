// Just enough music theory for the score generator (toolkit phase 3): keys, scales, chords built from a scale's own notes.

const NAMES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export const MAJOR = [0, 2, 4, 5, 7, 9, 11];
export const MINOR = [0, 2, 3, 5, 7, 8, 10];

export interface Key { root: number; minor: boolean; name: string }

/** "C", "F#", "Am", "Bbm" → the key (root as a pitch class 0–11). */
export function parseKey(s: string): Key {
  const m = /^([A-G])(#|b)?(m|min|minor)?$/.exec(s.trim());
  if (!m) throw new Error(`看不懂調性「${s}」：用像 C、F#、Am、Bbm 這樣的寫法`);
  const root = (NAMES[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
  return { root, minor: !!m[3], name: s.trim() };
}

export const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

/** The note `degree` steps up the key's scale (degree 1 = the tonic) as a MIDI number, in the octave whose tonic is `octave` (C4 = 60 → octave 4). */
export function scaleNote(key: Key, degree: number, octave = 4): number {
  const scale = key.minor ? MINOR : MAJOR, i = degree - 1, oct = Math.floor(i / 7), step = ((i % 7) + 7) % 7;
  return 12 * (octave + 1) + key.root + scale[step] + 12 * oct;
}

/** A chord on a scale degree built by stacking scale thirds (so it is always in the key): 3 notes, 4 with `seventh`. */
export function chordOn(key: Key, degree: number, o: { octave?: number; seventh?: boolean } = {}): number[] {
  const oct = o.octave ?? 4, steps = o.seventh ? [0, 2, 4, 6] : [0, 2, 4];
  return steps.map((s) => scaleNote(key, degree + s, oct));
}

/** Every pitch class (0–11) of the key's scale. */
export function scaleClasses(key: Key): Set<number> {
  return new Set((key.minor ? MINOR : MAJOR).map((n) => (key.root + n) % 12));
}

export const inKey = (key: Key, midi: number) => scaleClasses(key).has(((midi % 12) + 12) % 12);

/** Four-chord loops by scale degree, for a major and a minor key. */
export const PROGRESSIONS = {
  major: { bright: [1, 5, 6, 4], warm: [1, 6, 4, 5], open: [4, 1, 5, 6], lift: [1, 3, 4, 5] },
  minor: { dark: [1, 6, 3, 7], sad: [1, 4, 7, 3], tense: [1, 7, 6, 5], steady: [1, 4, 5, 1] },
} as const;
