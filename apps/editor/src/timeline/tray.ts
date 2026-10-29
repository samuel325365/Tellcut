// What the timeline's tool tray can do right now (spec 2026-10-28-timeline-refresh A2): a tool that cannot act stays on the
// tray, greyed, and says why — a missing button only leaves people guessing.
import { magneticTrack, resolveTimes, type AnyItem, type Project } from '@tellcut/engine';
import type { Key } from '../i18n/index.ts';
import type { EditorState } from '../store.ts';
import { cutPoints, edgeTargets, selectionHasNoClip } from '../editor/cutting.ts';

export type ToolId = 'split' | 'deleteLeft' | 'deleteRight' | 'delete' | 'rippleDelete' | 'duplicate';
/** why: what stops it; note: a remark for the tooltip when it can act */
export interface ToolState { enabled: boolean; why?: Key; note?: Key }

const MEDIA = new Set(['video', 'audio', 'music']);
const EPS = 1e-6;

const points = new WeakMap<Project, number[]>();
/** While playing: the middle of the stretch between two cut points the playhead is in. What the tray can do is the same
 *  anywhere in it, so the tray follows playback by redrawing only when the playhead crosses a cut. */
export function trayProbe(p: Project, t: number): number {
  let pts = points.get(p);
  if (!pts) { pts = cutPoints(p, resolveTimes(p)); points.set(p, pts); }
  let lo = 0, hi = pts.length - 1;
  if (t < pts[0] || t >= pts[hi]) return t;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (pts[mid] <= t) lo = mid; else hi = mid; }
  return (pts[lo] + pts[hi]) / 2;
}

/** skip: tracks the tools pass over (locked) */
export function trayState(s: Pick<EditorState, 'project' | 'playhead' | 'selection'>, skip: ReadonlySet<string>): Record<ToolId, ToolState> {
  const off = (why: Key): ToolState => ({ enabled: false, why });
  const p = s.project;
  if (!p) return { split: off('ed.why.noClipAtPlayhead'), deleteLeft: off('ed.why.noClipAtPlayhead'), deleteRight: off('ed.why.noClipAtPlayhead'),
    delete: off('ed.why.selectFirst'), rippleDelete: off('ed.why.selectFirst'), duplicate: off('ed.why.selectFirst') };
  const times = resolveTimes(p), t = s.playhead, sel = s.selection;
  const none: Key = selectionHasNoClip(p, sel, skip) ? 'ed.why.selectionNoClip' : 'ed.why.noClipAtPlayhead';
  // split cuts the media clips under the playhead (the selected ones, when there is a selection)
  const canSplit = p.tracks.some((tr) => MEDIA.has(tr.kind) && !skip.has(tr.id) && (tr.items as AnyItem[]).some((it) => {
    const tm = times.get(it.id)!;
    return (!sel.length || sel.includes(it.id)) && tm.start < t - EPS && t < tm.end - EPS;
  }));
  const targets = edgeTargets(p, times, t, sel, skip), mag = magneticTrack(p);
  const onMag = !!targets && !!mag && targets.some((id) => (mag.items as AnyItem[]).some((c) => c.id === id));
  const edge: ToolState = targets ? (onMag ? { enabled: true, note: 'ed.why.magneticLoose' } : { enabled: true }) : off(none);
  const picked: ToolState = sel.length ? { enabled: true } : off('ed.why.selectFirst');
  return { split: canSplit ? { enabled: true } : off(none), deleteLeft: edge, deleteRight: edge, delete: picked, rippleDelete: picked, duplicate: picked };
}
