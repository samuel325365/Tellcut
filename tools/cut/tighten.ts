// Cut.tighten's work: the pauses of a talk clip cut out on the transcript's word times (an idea from OpenMontage's silence cutter).
import { cropAt, r6, rippleDelete, split, type Project, type Transcript, type VideoItem } from '@tellcut/engine';

/**
 * Shortens the pauses in the main-track clip `clipId` of `p` (see Cut.tighten). `autoFocus` (Cut's face-focus groups) is updated
 * for the pieces. Returns the pieces in order, the note to print, and whether anything was cut (the cursor and the end move then).
 */
export function tightenClip(p: Project, clipId: string, transcriptOf: (source: string) => Transcript | null | undefined, o: { maxGap?: number; keep?: number },
  autoFocus: string[][]): { ids: string[]; note?: string; cut: boolean } {
  const maxGap = o.maxGap ?? 0.6, keep = o.keep ?? 0.3, half = keep / 2;
  const v1 = p.tracks.find((t) => t.id === 'v1')!.items as VideoItem[], it = v1.find((i) => i.id === clipId);
  if (!it) throw new Error(`tighten：主軌上沒有「${clipId}」`);
  if (v1[v1.length - 1] !== it) throw new Error(`tighten：只能用在主軌最新的一段（${clipId} 後面還有片段）；c.clip 之後馬上 tighten`);
  const hung = p.tracks.filter((t) => t.id !== 'orig').flatMap((t) => t.items as Array<{ id: string; parent?: string }>).filter((i) => i.parent === clipId);
  if (hung.length) throw new Error(`tighten：${clipId} 上已經掛了 ${hung.map((i) => i.id).join('、')}；先 tighten，再加字幕和貼圖`);
  const tr = transcriptOf(it.source);
  if (!tr) return { ids: [clipId], note: `${clipId}：${it.source} 還沒有逐字稿，tighten 沒有剪停頓`, cut: false };
  const a = it.in, b = r6(it.in + (it.end - it.start) * it.speed);
  const words = tr.segments.flatMap((seg) => (seg.words?.length ? seg.words : [{ start: seg.start, end: seg.end, word: seg.text }]))
    .filter((w) => w.word.trim() && w.end > a && w.start < b).sort((x, y) => x.start - y.start);
  if (!words.length) return { ids: [clipId], note: `${clipId}：這段沒有講話，tighten 沒有剪`, cut: false };
  // the silences to cut, in source seconds: before the first word, between words, after the last
  const cuts: Array<[number, number]> = [];
  const gap = (s0: number, s1: number, head: boolean, tail: boolean) => {
    if (s1 - s0 <= maxGap) return;
    const c0 = head ? s0 : s0 + half, c1 = tail ? s1 : s1 - half;
    if (c1 - c0 >= 0.1) cuts.push([r6(c0), r6(c1)]);
  };
  gap(a, words[0].start, true, false);
  let reach = words[0].end;
  for (const w of words.slice(1)) { gap(reach, w.start, false, false); reach = Math.max(reach, w.end); }
  gap(Math.min(reach, b), b, false, true);
  const film = (s: number) => r6(it.start + (s - it.in) / it.speed);
  const crop0 = structuredClone(it.crop), len0 = it.end - it.start, into = it.transitionIn;
  const made = new Set<string>();
  const pieces = () => v1.filter((c) => c.id === clipId || made.has(c.id)).sort((x, y) => x.start - y.start);
  let removed = 0;
  // from the last pause back: the earlier ones keep their film times
  for (const [s0, s1] of cuts.reverse()) {
    const t0 = film(s0), t1 = film(s1);
    for (const t of [t1, t0]) for (const n of split(p, { t, ids: pieces().map((c) => c.id) })) made.add(n);
    const gone = pieces().find((c) => Math.abs(c.start - t0) < 1e-3 && Math.abs(c.end - t1) < 2e-3);
    if (!gone) continue;   // closer than a frame to an edge: split would not cut it
    removed += gone.end - gone.start;
    made.delete(gone.id);
    rippleDelete(p, { ids: [gone.id] });
  }
  const out = pieces();
  // the transition into the clip went with its head pause: the first piece takes it back (it already sits on the overlap)
  if (into && !out[0].transitionIn) out[0].transitionIn = into;
  // the camera move of the whole clip spread over the pieces in order: no jump at a join
  if (out.length > 1 && !crop0.keys?.length) {
    const total = out.reduce((n, c) => n + (c.end - c.start), 0);
    let acc = 0;
    for (const c of out) {
      const l = c.end - c.start;
      c.crop = { from: cropAt(crop0, (acc / total) * len0, len0), to: cropAt(crop0, ((acc + l) / total) * len0, len0) };
      acc += l;
    }
  }
  // a face focus asked for the clip is one for all its pieces (the same framing throughout)
  const fi = autoFocus.findIndex((g) => g.includes(clipId));
  if (fi >= 0) autoFocus[fi] = out.map((c) => c.id);
  // a short fade on the sound at every join, so a cut never clicks
  const ids = new Set(out.map((c) => c.id));
  for (const s of p.tracks.find((t) => t.id === 'orig')!.items as Array<{ parent?: string; start: number; end: number; fadeIn: number; fadeOut: number }>) {
    if (!s.parent || !ids.has(s.parent)) continue;
    const f = Math.min(0.03, (s.end - s.start) / 4);
    s.fadeIn = r6(Math.max(s.fadeIn, f)); s.fadeOut = r6(Math.max(s.fadeOut, f));
  }
  return { ids: out.map((c) => c.id), note: removed > 0 ? `${clipId}：tighten 剪掉 ${cuts.length} 個停頓，共 ${removed.toFixed(1)} 秒（${out.length} 段）` : undefined, cut: true };
}
