// Chapters by shooting time (spec 2026-10-14 §8): a new chapter after a gap over gapHours or on a new day.
/** taken: local wall-clock time; takenOffset: its zone when known (material shot in several zones orders by the real moment) */
export interface Dated { id: string; taken?: string; takenOffset?: string; takenGuess?: boolean }
export interface Chapter { title: string; ids: string[] }

const day = (iso: string) => iso.slice(0, 10);
/** the real moment (a time without a zone counts as this machine's local time) */
const instant = (x: Dated) => Date.parse(`${x.taken}${x.takenOffset ?? ''}`);
const hours = (a: Dated, b: Dated) => (instant(b) - instant(a)) / 3600e3;
const ampm = (iso: string) => (Number(iso.slice(11, 13)) < 12 ? '上午' : '下午');
const known = (x: Dated) => !!x.taken && !x.takenGuess;

/** By shooting time; unknown or guessed times last, then by id. */
export function chronological<T extends Dated>(xs: T[]): T[] {
  return [...xs].sort((a, b) => Number(!known(a)) - Number(!known(b)) || ((known(a) && known(b) ? instant(a) - instant(b) : 0) || (a.taken ?? '').localeCompare(b.taken ?? '')) || a.id.localeCompare(b.id));
}

export function chapters(xs: Dated[], gapHours = 2): Chapter[] {
  const dated = chronological(xs.filter(known)), unknown = xs.filter((x) => !known(x));
  const groups: Dated[][] = [];
  for (const x of dated) {
    const g = groups.at(-1), last = g?.at(-1);
    if (!g || !last || day(last.taken!) !== day(x.taken!) || hours(last, x) > gapHours) groups.push([x]); else g.push(x);
  }
  const days = [...new Set(dated.map((x) => day(x.taken!)))], perDay = new Map<string, number>();
  for (const g of groups) perDay.set(day(g[0].taken!), (perDay.get(day(g[0].taken!)) ?? 0) + 1);
  const out = groups.map((g) => {
    const first = g[0].taken!, d = day(first), [, m, dd] = d.split('-').map(Number);
    const title = days.length > 1 ? `第 ${days.indexOf(d) + 1} 天${perDay.get(d)! > 1 ? ` ${ampm(first)}` : ''}` : `${m}/${dd} ${ampm(first)}`;
    return { title, ids: g.map((x) => x.id) };
  });
  // chapters that would share a name (three mornings of one day) also say when they start
  const shared = new Set(out.map((c) => c.title).filter((t, i, all) => all.indexOf(t) !== i));
  out.forEach((c, i) => { const s = groups[i][0].taken!; if (shared.has(c.title)) c.title += ` ${Number(s.slice(11, 13))}:${s.slice(14, 16)}`; });
  if (unknown.length) out.push({ title: '未知時間', ids: unknown.map((x) => x.id) });
  return out;
}
