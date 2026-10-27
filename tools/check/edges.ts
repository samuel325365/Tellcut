// Clip edges running into the neighbouring shot of their source (found in the 2026-10-19 batch: an in or out point a frame
// or two off showed the next shot's big burned-in caption for a moment — the clip's own picture was clean). The source's
// shot changes are in the analysis (cuts.json); a change just after the in point or just before the out point means the
// clip starts or ends with frames of another shot. A frozen clip holds the frame at its freeze point to the clip's end:
// a change just before that point puts the next shot on screen for the whole hold (review3 R3-E1).
import type { Project, VideoItem } from '@tellcut/engine';
import type { Finding } from './rules.ts';

/** a run into the next shot this short at a clip's edge is next to never meant: about ten frames — the food-deep leak was
 *  0.23 s. Checked against the shorter of its source and screen seconds (R3-E2): a few source frames of another shot are
 *  never chosen, even slowed down to a second on screen (speed 0.25), and neither is a flash on screen, even when sped up
 *  it covers a second of source (speed 4). Tuned on the 2026-10-19 batch, re-checked on the 2026-10-21/22 ones (review3 R3-E3). */
export const EDGE = 0.35;
/** source seconds: shot changes this close to the edge are the edge itself — detection can be a source frame off, and a
 *  single frame does not show (except a frozen one: see the freeze check) */
const SAME = 0.05;
const r2 = (t: number) => Math.round(t * 100) / 100;
/** m:ss.ss — the suggestion is about a frame or two, a tenth of a second (timecode1) can still leave one in */
export const tc2 = (t: number) => { const d = r2(t); return `${Math.floor(d / 60)}:${(d % 60).toFixed(2).padStart(5, '0')}`; };
/** screen seconds into a dissolve/slide during which the clip is still at most half visible */
const half = (o: VideoItem) => (o.transitionIn && o.transitionIn.type !== 'cut' ? o.transitionIn.dur / 2 : 0);
type Span = { start: number; end: number };
/** `to` picks up its source where `from` leaves off, within `tol` (half a frame): the picture runs straight through the seam,
 *  so a shot change next to it is the source's own cut, not a run-in (the 2026-10-22 films split long takes into many clips) */
const carriesOn = (from: VideoItem, ft: Span, to: VideoItem, tt: Span, tol: number) =>
  from.source === to.source && from.speed === to.speed && (from.freezeAt == null || from.freezeAt >= ft.end - ft.start) &&
  Math.abs(tt.start - ft.end) < tol && Math.abs(to.in - (from.in + (ft.end - ft.start) * from.speed)) < tol * from.speed;

export function edgeFindings(p: Project, times: Map<string, { start: number; end: number }>, cuts: Record<string, number[] | null>): Finding[] {
  const out: Finding[] = [];
  for (const t of p.tracks) if (t.kind === 'video') for (const clip of t.items as VideoItem[]) {
    const ct = times.get(clip.id), src = p.sources[clip.source], shots = cuts[clip.source];
    if (!ct || !src || src.kind === 'image' || !shots?.length) continue;
    const len = ct.end - ct.start, frozen = clip.freezeAt != null && clip.freezeAt < len, v = clip.speed;
    const shown = frozen ? clip.freezeAt! : len;
    const a = clip.in, b = clip.in + shown * v;
    const film = (s: number) => ct.start + (s - a) / v;
    // the messages count what the viewer sees (screen seconds); the source's own seconds come along when the speed differs
    const secs = (d: number) => (v === 1 ? `${d.toFixed(2)} 秒` : `${(d / v).toFixed(2)} 秒（原片 ${d.toFixed(2)} 秒）`);
    const near = (d: number, lo = SAME) => d > lo && Math.min(d, d / v) <= EDGE;
    // a run-in under the faded half of a transition does not show: this clip's own one at its head, the next clip's (it
    // overlaps this one's tail, cut.ts startFor) at its tail
    const shownFrom = ct.start + half(clip);
    const coveredFrom = Math.min(Infinity, ...(t.items as VideoItem[]).flatMap((o) => {
      const ot = times.get(o.id);
      return o !== clip && ot && half(o) > 0 && ot.start > ct.start && ot.start < ct.end ? [ot.start + half(o)] : [];
    }));
    const tol = 0.5 / p.meta.fps;
    const seam = (before: boolean) => (t.items as VideoItem[]).some((o) => {
      const ot = times.get(o.id);
      return o !== clip && !!ot && (before ? carriesOn(o, ot, clip, ct, tol) : carriesOn(clip, ct, o, ot, tol));
    });
    const head = seam(true) ? undefined : shots.find((c) => near(c - a) && c < b && film(c) > shownFrom);
    if (head !== undefined) out.push({ level: 'warn', t: [r2(ct.start), r2(film(head))], ids: [clip.id],
      msg: `片段開頭 ${secs(head - a)}還是原片的上一個鏡頭（${clip.source} 在 ${tc2(head)} 換鏡頭，那幾格常帶著原片的字）：進點往後移過 ${tc2(head)}` });
    if (frozen) {
      // the held frame is the next shot's; a change within a source frame after the freeze point may be too (detection),
      // so the suggestion keeps a source frame (SAME) clear of the change
      const c = [...shots].reverse().find((s) => s > a && near(b - s, -SAME));
      const from = c === undefined ? 0 : Math.min(film(c), ct.start + shown);
      if (c !== undefined && from < coveredFrom) out.push({ level: 'warn', t: [r2(from), r2(ct.end)], ids: [clip.id],
        msg: `定格的畫面（原片 ${tc2(b)}）${c <= b ? '已經是' : '離換鏡頭不到一格，可能已經是'}原片的下一個鏡頭（${clip.source} 在 ${tc2(c)} 換鏡頭，那幾格常帶著原片的字），會停在畫面上 ${(ct.end - from).toFixed(2)} 秒：定格點往前移，freezeAt 改到 ${Math.max(0, r2((c - SAME - a) / v)).toFixed(2)} 以前` });
      continue;
    }
    const tail = seam(false) ? undefined : [...shots].reverse().find((c) => near(b - c) && c > a);
    if (tail !== undefined && tail !== head && film(tail) < coveredFrom) out.push({ level: 'warn', t: [r2(film(tail)), r2(ct.end)], ids: [clip.id],
      msg: `片段最後 ${secs(b - tail)}已經是原片的下一個鏡頭（${clip.source} 在 ${tc2(tail)} 換鏡頭，那幾格常帶著原片的字）：出點往前收到 ${tc2(tail)} 之前` });
  }
  return out;
}
