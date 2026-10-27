// Volume line geometry: +6 dB at the top of the clip, -40 dB at the bottom (values beyond are drawn at the edge).
export const VIEW_TOP_DB = 6, VIEW_BOTTOM_DB = -40;

export const dbToY = (db: number, h: number) => {
  const c = Math.min(VIEW_TOP_DB, Math.max(VIEW_BOTTOM_DB, db));
  return Math.round(((VIEW_TOP_DB - c) / (VIEW_TOP_DB - VIEW_BOTTOM_DB)) * h * 1000) / 1000;
};
export const yToDb = (y: number, h: number) => Math.round((VIEW_TOP_DB - (y / h) * (VIEW_TOP_DB - VIEW_BOTTOM_DB)) * 10) / 10;

/** Envelope points (clip-relative seconds, dB) as pixels; no envelope is a flat 0 dB line. */
export function envelopePoints(env: Array<[number, number]> | undefined, len: number, pps: number, h: number) {
  if (!env?.length) return [{ x: 0, y: dbToY(0, h) }, { x: len * pps, y: dbToY(0, h) }];
  return env.map(([t, db]) => ({ x: t * pps, y: dbToY(db, h) }));
}
