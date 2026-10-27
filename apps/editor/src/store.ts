// Tiny observable store for the editor's UI state (the project itself is immutable, from immer).
import { useEffect, useReducer, useRef } from 'preact/hooks';
import type { Project, SummaryLine } from '@tellcut/engine';
import type { ExportEntry, JobView } from './api.ts';
import type { Material } from './audition.ts';
import { DEFAULT_LAYOUT, type Layout } from './layout.ts';

export type SaveStatus = 'saved' | 'pending' | 'saving' | 'error';
export interface ThumbInfo { interval: number; width: number; height: number; cols: number; count: number; url: string }
export interface PeakInfo { rate: number; peaks: number[] }

export interface EditorState {
  id: string;
  project: Project | null;
  error: { message: string; issues: string[] } | null;
  history: string[];
  /** why restoring a history version from the error page failed */
  restoreError: string;
  selection: string[];
  playhead: number;
  playing: boolean;
  playerReady: boolean;
  playerError: string;
  pps: number;
  scroll: number;
  guide: number | null;
  save: SaveStatus;
  saveError: string;
  canUndo: boolean;
  canRedo: boolean;
  thumbs: Record<string, ThumbInfo>;
  peaks: Record<string, PeakInfo>;
  offline: string[];
  analyzing: number;
  /** why the last edit was refused (shown in the properties panel) */
  notice: string;
  /** crop mode: the clip and which crop (from, to or a keyframe index) */
  crop: { itemId: string; which: 'from' | 'to' | number; t?: number } | null;
  /** scene-change times per source (from analysis), for the library's segments */
  cuts: Record<string, number[]>;
  /** master output peak in dBFS (-120 = silence) */
  level: number;
  /** the export being followed (spec §7, M8) */
  exportJob: JobView | null;
  exportError: string;
  exports: ExportEntry[];
  exportOpen: boolean;
  /** preview quality: draft drops backdrop-filter in the preview only */
  quality: 'full' | 'draft';
  /** panel sizes and toggles (layout.ts) */
  layout: Layout;
  /** the help panel (幫助) is open */
  helpOpen: boolean;
  /** loop playback over the selected clips (the whole project when nothing is selected) */
  loop: boolean;
  /** detected tempo of each music file (analysis) */
  beats: Record<string, { bpm: number; offset: number; beats: number[] }>;
  /** track ids shown as thin rows (per project, remembered in the browser) */
  collapsed: string[];
  /** a material playing alone in the preview (audition.ts); addable: from the library; result: the timeline item's start */
  audition: { material: Material; label: string; addable: boolean; result: number | null } | null;
  /** Claude's pending proposal shown as a preview (spec 2026-10-15-proposals-magnetic §3.3) */
  /** lines: the summary as data, worded in the page's language (summary: the server's Chinese, for a proposal without them) */
  proposal: { id: string; label: string; summary: string[]; lines?: SummaryLine[]; warnings: string[]; changed: string[] } | null;
  /** project.json was changed outside the editor (§5): offer a reload */
  diskChanged: boolean;
  /** the "Ask Agent…" dialog (spec 2026-10-16-right-click-claude §2): what it was opened on and how far it got */
  ask: { selection: string[]; playhead: number; state: 'edit' | 'sending' | 'copied' | 'manual'; message?: string; error?: string } | null;
}

export const initialState = (id: string): EditorState => ({
  id, project: null, error: null, history: [], restoreError: '', selection: [], playhead: 0, playing: false, playerReady: false, playerError: '',
  pps: 100, scroll: 0, guide: null, save: 'saved', saveError: '', canUndo: false, canRedo: false,
  thumbs: {}, peaks: {}, offline: [], analyzing: 0, notice: '', crop: null, cuts: {}, level: -120, exportJob: null, exportError: '', exports: [], exportOpen: false, quality: 'full', layout: DEFAULT_LAYOUT, audition: null, beats: {}, collapsed: [], loop: false, helpOpen: false, proposal: null, diskChanged: false, ask: null,
});

export interface Store<S> { get(): S; set(patch: Partial<S> | ((s: S) => Partial<S>)): void; subscribe(fn: () => void): () => void }

export function createStore<S>(init: S): Store<S> {
  let s = init;
  const subs = new Set<() => void>();
  return {
    get: () => s,
    set(patch) { s = { ...s, ...(typeof patch === 'function' ? patch(s) : patch) }; for (const f of [...subs]) f(); },
    subscribe(fn) { subs.add(fn); return () => { subs.delete(fn); }; },
  };
}

export function useStore<S>(store: Store<S>): S {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => store.subscribe(force as () => void), [store]);
  return store.get();
}

export function shallowEqual(a: any, b: any): boolean {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => Object.is(a[k], b[k]));
}

/** Equality that ignores fast-changing keys (the playhead and the meter tick many times a second while playing). */
export const equalIgnoring = <S>(keys: Array<keyof S>) => (a: S, b: S) => {
  const strip = (x: S) => { const o: any = { ...x }; for (const k of keys) delete o[k]; return o; };
  return shallowEqual(strip(a), strip(b));
};

/** Re-renders only when the selected slice changes (the playhead moves 60×/s while playing). */
export function useStoreSelector<S, T>(store: Store<S>, sel: (s: S) => T, eq: (a: T, b: T) => boolean = shallowEqual): T {
  const [, force] = useReducer((x: number) => x + 1, 0);
  const last = useRef<T>(sel(store.get()));
  useEffect(() => store.subscribe(() => {
    const next = sel(store.get());
    if (!eq(last.current, next)) { last.current = next; force(0); }
  }), [store]);
  last.current = sel(store.get());
  return last.current;
}
