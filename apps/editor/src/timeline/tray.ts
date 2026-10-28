// What the timeline's tool tray can do right now (spec 2026-10-28-timeline-refresh A2): a tool that cannot act stays on the
// tray, greyed, and says why — a missing button only leaves people guessing.
import { magneticTrack, resolveTimes, type AnyItem } from '@tellcut/engine';
import type { Key } from '../i18n/index.ts';
import type { EditorState } from '../store.ts';
import { edgeTargets } from '../editor/cutting.ts';

export type ToolId = 'split' | 'deleteLeft' | 'deleteRight' | 'delete' | 'rippleDelete' | 'duplicate';
/** why: what stops it; note: a remark for the tooltip when it can act */
export interface ToolState { enabled: boolean; why?: Key; note?: Key }

const MEDIA = new Set(['video', 'audio', 'music']);
const EPS = 1e-6;

/** skip: tracks the tools pass over (locked) */
export function trayState(s: Pick<EditorState, 'project' | 'playhead' | 'selection'>, skip: ReadonlySet<string>): Record<ToolId, ToolState> {
  const off = (why: Key): ToolState => ({ enabled: false, why });
  const p = s.project;
  if (!p) return { split: off('ed.why.noClipAtPlayhead'), deleteLeft: off('ed.why.noClipAtPlayhead'), deleteRight: off('ed.why.noClipAtPlayhead'),
    delete: off('ed.why.selectFirst'), rippleDelete: off('ed.why.selectFirst'), duplicate: off('ed.why.selectFirst') };
  const times = resolveTimes(p), t = s.playhead, sel = s.selection;
  // split cuts the media clips under the playhead (the selected ones, when there is a selection)
  const canSplit = p.tracks.some((tr) => MEDIA.has(tr.kind) && !skip.has(tr.id) && (tr.items as AnyItem[]).some((it) => {
    const tm = times.get(it.id)!;
    return (!sel.length || sel.includes(it.id)) && tm.start < t - EPS && t < tm.end - EPS;
  }));
  const targets = edgeTargets(p, times, t, sel, skip), mag = magneticTrack(p);
  const onMag = !!targets && !!mag && targets.some((id) => (mag.items as AnyItem[]).some((c) => c.id === id));
  const edge: ToolState = targets ? (onMag ? { enabled: true, note: 'ed.why.magneticLoose' } : { enabled: true }) : off('ed.why.noClipAtPlayhead');
  const picked: ToolState = sel.length ? { enabled: true } : off('ed.why.selectFirst');
  return { split: canSplit ? { enabled: true } : off('ed.why.noClipAtPlayhead'), deleteLeft: edge, deleteRight: edge, delete: picked, rippleDelete: picked, duplicate: picked };
}
