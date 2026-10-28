// Loading what the library and the timeline show of each source and music file (thumbnails, waveforms, scene cuts, beats),
// out of editor.ts (review B3). The server analyses on request; what is not ready yet is loaded when its job is done.
import { ApiError, type Api } from '../api.ts';
import type { EditorState, Store } from '../store.ts';

/** Requests source analysis and loads thumbnails/peaks as they become available. only: just these sources and music (an import
 *  adds a few to a project whose others are loaded already). */
export async function analyzeProject(c: { id: string; api: Api; store: Store<EditorState> }, only?: string[]) {
  const p = c.store.get().project;
  if (!p) return;
  let res: { jobs: Array<{ id: string; label: string }>; missing: string[]; extras?: Array<{ id: string; kind: string; label: string }> };
  try { res = await c.api.analyze(c.id); } catch { return; }
  const mine = (x: string) => !only || only.includes(x);
  c.store.set((s) => (only ? { offline: [...new Set([...s.offline, ...res.missing])], analyzing: s.analyzing + res.jobs.filter((j) => mine(j.label)).length }
    : { offline: res.missing, analyzing: res.jobs.length }));
  const jobFor = new Map(res.jobs.filter((j) => mine(j.label)).map((j) => [j.label, j.id]));
  const loadSource = async (src: string) => {
    // its analysis is still running: wait for it first (asking now only gets a 409, red in the browser console)
    const running = jobFor.get(src);
    if (running) {
      jobFor.delete(src);
      await c.api.waitJob(running).catch(() => {});
      c.store.set((s) => ({ analyzing: Math.max(0, s.analyzing - 1) }));
    }
    try {
      const [thumbs, peaks, cuts] = await Promise.all([c.api.thumbs(c.id, src), c.api.peaks(c.id, src), c.api.cuts(c.id, src)]);
      c.store.set((s) => ({ thumbs: { ...s.thumbs, [src]: thumbs }, peaks: { ...s.peaks, [`source:${src}`]: peaks }, cuts: { ...s.cuts, [src]: cuts } }));
    } catch (e) {
      const job = jobFor.get(src);
      if (!(e instanceof ApiError) || e.status !== 409 || !job) return;
      jobFor.delete(src);
      await c.api.waitJob(job);
      c.store.set((s) => ({ analyzing: Math.max(0, s.analyzing - 1) }));
      await loadSource(src);
      return;
    }
    if (jobFor.has(src)) { jobFor.delete(src); c.store.set((s) => ({ analyzing: Math.max(0, s.analyzing - 1) })); }
  };
  const music = new Set(Object.keys(p.media).filter(mine));   // every music file: the library shows their lengths
  await Promise.all([
    ...Object.keys(p.sources).filter((src) => mine(src) && !res.missing.includes(src)).map(loadSource),
    ...[...music].map(async (m) => {
      try { const peaks = await c.api.musicPeaks(c.id, m); c.store.set((s) => ({ peaks: { ...s.peaks, [`media:${m}`]: peaks } })); } catch { /* offline music: no waveform */ }
      // beats: now, or once this music's beats job (queued by analyze) is done
      const beatsJob = res.extras?.find((j) => j.kind === 'beats' && j.label === m);
      if (beatsJob) await c.api.waitJob(beatsJob.id).catch(() => {});   // not asked before it is made
      for (let tries = 0; tries < 2; tries++) {
        try { const b = await c.api.beats(c.id, m); c.store.set((s) => ({ beats: { ...s.beats, [m]: b } })); break; }
        catch (e) { if (tries || !beatsJob || !(e instanceof ApiError) || e.status !== 409) break; await c.api.waitJob(beatsJob.id).catch(() => {}); }
      }
    }),
  ]);
}
