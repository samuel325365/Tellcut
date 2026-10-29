// The points of "Save as my preset" (spec 2026-10-29-my-library §4.5): each row is what the user sees; `orig` and `prompt` are the
// point as it came (the agent's draft has both; a saved preset's prompt stays on the server, so only its text comes back).
export interface PointRow { text: string; orig?: string; prompt?: string }
/** what the server gets for a point */
export type PointOut = { text: string; prompt: string } | { text: string; orig: string };

/** a point left as it was keeps its English line (or, from a saved preset, is named by what it was so the server keeps it);
 *  a changed or new one is sent in the user's own words; an empty one is dropped */
export function pointsOut(rows: PointRow[]): PointOut[] {
  return rows.flatMap((r) => {
    const text = r.text.trim();
    if (!text) return [];
    if (r.orig !== undefined && text === r.orig.trim()) return [r.prompt ? { text, prompt: r.prompt } : { text, orig: r.orig }];
    return [{ text, prompt: text }];
  });
}
