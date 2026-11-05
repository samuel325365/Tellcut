// Edit instructions as JSON (spec 2026-10-15-proposals-magnetic §2): the same commands the timeline runs, by name.
import { plainCopy as plain } from './util.ts';
import { parseProject, ProjectError, type Project } from './schema.ts';
import { resolveTimes } from './time.ts';
import * as C from './commands/index.ts';

export interface Op { op: string; [k: string]: unknown }
export class OpError extends Error {
  constructor(readonly index: number, readonly op: string, message: string) {
    super(index < 0 ? message : `第 ${index + 1} 條（${op}）：${message}`);
  }
}

/** A project's own effect module (fx/….js or .mjs, written by the agent) joins meta.fx, so an edited project can take a new effect
 *  without a re-cut: only npm run cut registered one before (c.fx), and that would overwrite the user's edits. Once is enough.
 *  The path is written one way only (no empty, . or .. segment, no backslash): fx//coin.js or fx/./coin.js passed the
 *  includes() check beside fx/coin.js and loaded the same module twice. */
function addFx(p: Project, a: { path?: unknown }) {
  const path = a.path;
  if (typeof path !== 'string' || !/^fx\/[\w./-]+\.m?js$/.test(path) || path.split('/').some((s) => s === '' || s === '.' || s === '..'))
    throw new Error(`path 要是專案裡的特效檔，寫成 "fx/coin.js" 這樣（不能有 //、./、..、反斜線；現在是 ${JSON.stringify(path)}）`);
  const list = (p.meta.fx ??= []);
  if (!list.includes(path)) list.push(path);
}

export const OPS: Record<string, (p: Project, a: any) => unknown> = {
  moveItems: C.moveItems, deleteItems: C.deleteItems, rippleDelete: C.rippleDelete, restackItem: C.restackItem,
  moveTrack: C.moveTrack, removeTrack: C.removeTrack, trimStart: C.trimStart, trimEnd: C.trimEnd, slip: C.slip, roll: C.roll,
  rateStretch: C.rateStretch, split: C.split, updateItem: C.updateItem, setTrack: C.setTrack, setCrop: C.setCrop,
  addCropKey: C.addCropKey, removeCropKey: C.removeCropKey, setTransform: C.setTransform, addItem: C.addItem, addTrack: C.addTrack,
  setFade: C.setFade, addEnvelopePoint: C.addEnvelopePoint, moveEnvelopePoint: C.moveEnvelopePoint, removeEnvelopePoint: C.removeEnvelopePoint,
  setCrossfade: C.setCrossfade, swapSource: C.swapSource, attach: C.attach, detach: C.detach, setMagnetic: C.setMagnetic, addFx,
};
const ID_KEYS = ['id', 'left', 'right', 'track', 'toTrack', 'to'];

export function runOps(d: Project, ops: Op[]) {
  // a CLI or chat proposal hands in JSON: anything but a list of { op } is refused before it is run
  if (!Array.isArray(ops)) throw new OpError(-1, 'ops', 'ops 要是一個陣列：[{ op, ... }, ...]');
  ops.forEach((o, i) => { if (!o || typeof o !== 'object' || typeof (o as Op).op !== 'string') throw new OpError(i, String((o as Op | null)?.op ?? '?'), '每一條要是 { op: "指令名稱", ... }'); });
  const names = new Map<string, string>();
  const name = (v: unknown, i: number, op: string) => {
    if (typeof v !== 'string' || !v.startsWith('$')) return v;
    const id = names.get(v);
    if (!id) throw new OpError(i, op, `「${v}」還沒有定義（要先用 addItem／addTrack 的 as 命名）`);
    return id;
  };
  ops.forEach((o, i) => {
    const { op, as, ...raw } = o as Op & { as?: string };
    // own keys only: constructor, toString or __proto__ are the object's, not commands
    const fn = Object.hasOwn(OPS, op) ? OPS[op] : undefined;
    if (!fn) throw new OpError(i, op, `沒有這個指令（可用：${Object.keys(OPS).join('、')}）`);
    const a: any = { ...raw };
    for (const k of ID_KEYS) if (k in a) a[k] = name(a[k], i, op);
    if (Array.isArray(a.ids)) a.ids = a.ids.map((x: unknown) => name(x, i, op));
    for (const k of ['item', 'patch']) if (a[k] && typeof a[k] === 'object' && a[k].parent !== undefined) a[k] = { ...a[k], parent: name(a[k].parent, i, op) };
    const before = plain(d);
    let out: unknown;
    try { out = fn(d, a); C.settle(before, d); }
    catch (e) { if (e instanceof OpError) throw e; throw new OpError(i, op, (e as Error).message); }
    if (as !== undefined) {
      if (typeof as !== 'string' || !/^\$\w+$/.test(as)) throw new OpError(i, op, `as 必須是 "$名稱"`);
      if (typeof out !== 'string') throw new OpError(i, op, 'as 只能用在 addItem／addTrack');
      names.set(as, out);
    }
  });
}

const f2 = (v: number) => v.toFixed(2);
/** one line of a proposal's summary as data, for the page to word in its language (summary is the same in Chinese, for the
 *  command line and the agent): an item added (with its block type), a number changed, a field changed (a block type: from
 *  and to), moved to a track, deleted; n items moved by the same seconds. An effect module joining or leaving meta.fx (addFx) is
 *  an add / del whose id is its path and whose track is 'meta.fx' (a proposal of only addFx said nothing: "Changes: 0"). */
export type SummaryLine =
  | { k: 'add'; id: string; track: string; type?: string } | { k: 'num'; id: string; key: string; from: string; to: string }
  | { k: 'edit'; id: string; key: string; from?: string; to?: string } | { k: 'track'; id: string; track: string }
  | { k: 'del'; id: string } | { k: 'shift'; n: number; by: string };

export function summarize(before: Project, after: Project): { changed: string[]; summary: string[]; lines: SummaryLine[] } {
  const flat = (p: Project) => new Map(p.tracks.flatMap((t) => (t.items as any[]).map((i) => [i.id, { t: t.id, i }] as const)));
  const A = flat(before), B = flat(after), tb = resolveTimes(before), ta = resolveTimes(after);
  const changed: string[] = [], lines: string[] = [], coded: SummaryLine[] = [], shifts = new Map<string, number>();
  const say = (text: string, line: SummaryLine) => { lines.push(text); coded.push(line); };
  // q is a clip this proposal added right after p on p's track, ending where p ended: p's second half after a split
  const secondHalf = (p?: string, q?: string) => {
    if (p === undefined || q === undefined || A.has(q) || !A.has(p) || !B.has(p) || !B.has(q) || B.get(p)!.t !== B.get(q)!.t) return false;
    return Math.abs(ta.get(q)!.start - ta.get(p)!.end) <= 1e-6 && Math.abs(ta.get(q)!.end - tb.get(p)!.end) <= 1e-6;
  };
  for (const [id, b] of B) {
    const a = A.get(id);
    if (!a) { changed.push(id); say(`新增 ${id}（${b.t}）`, { k: 'add', id, track: b.t, ...(typeof b.i.type === 'string' ? { type: b.i.type } : {}) }); continue; }
    if (JSON.stringify(a) === JSON.stringify(b)) {
      const d = ta.get(id)!.start - tb.get(id)!.start;
      if (Math.abs(d) > 1e-6) { const k = (d > 0 ? '+' : '') + f2(d); shifts.set(k, (shifts.get(k) ?? 0) + 1); }
      continue;
    }
    const ra = tb.get(id)!, rb = ta.get(id)!, d = rb.start - ra.start;
    const sameLen = Math.abs((ra.end - ra.start) - (rb.end - rb.start)) < 1e-6;
    // start and end are relative to the parent: what counts is where the item is in the film. A child kept on the same moments
    // by its parent's head trim, or moved by a split onto the clip's second half, has not changed on screen
    const keys = [...new Set([...Object.keys(a.i), ...Object.keys(b.i)])].filter((k) => JSON.stringify(a.i[k]) !== JSON.stringify(b.i[k]))
      .filter((k) => k !== 'parent' || !secondHalf(a.i.parent, b.i.parent));
    if (sameLen && keys.every((k) => k === 'start' || k === 'end') && a.t === b.t) {
      if (Math.abs(d) <= 1e-6) continue;
      changed.push(id);
      const k = (d > 0 ? '+' : '') + f2(d);
      shifts.set(k, (shifts.get(k) ?? 0) + 1); continue;
    }
    changed.push(id);
    for (const k of keys) {
      if (['start', 'end', 'in', 'speed', 'rate'].includes(k) && typeof a.i[k] === 'number' && typeof b.i[k] === 'number') say(`${id} ${k} ${f2(a.i[k])}→${f2(b.i[k])}`, { k: 'num', id, key: k, from: f2(a.i[k]), to: f2(b.i[k]) });
      else say(`${id} 修改 ${k}`, { k: 'edit', id, key: k, ...(k === 'type' && typeof a.i.type === 'string' && typeof b.i.type === 'string' ? { from: a.i.type, to: b.i.type } : {}) });
    }
    if (a.t !== b.t) say(`${id} 換到軌道 ${b.t}`, { k: 'track', id, track: b.t });
  }
  for (const [id] of A) if (!B.has(id)) { changed.push(id); say(`刪除 ${id}`, { k: 'del', id }); }
  for (const [k, n] of shifts) say(`${n} 個項目移動 ${k} 秒`, { k: 'shift', n, by: k });
  // the project's own effect modules, by path in changed too (it counts the changes; the ids the tools give items have no /, so a
  // path does not mark an item as changed)
  const fxA = before.meta.fx ?? [], fxB = after.meta.fx ?? [];
  for (const path of fxB) if (!fxA.includes(path)) { changed.push(path); say(`新增 ${path}（meta.fx）`, { k: 'add', id: path, track: 'meta.fx' }); }
  for (const path of fxA) if (!fxB.includes(path)) { changed.push(path); say(`刪除 ${path}（meta.fx）`, { k: 'del', id: path }); }
  return { changed, summary: lines, lines: coded };
}

export function applyOps(p: Project, ops: Op[]) {
  // the project as read from disk may leave defaults out: filled in first, so the summary names only what the ops changed
  let base: Project;
  try { base = parseProject(plain(p)); }
  catch (e) { throw new OpError(-1, 'project', `專案本身不合法：${e instanceof ProjectError ? e.issues.join('; ') : (e as Error).message}`); }
  p = base;
  const d = plain(p);
  runOps(d, ops);
  let project: Project;
  try { project = parseProject(d); }
  catch (e) { throw new OpError(-1, 'project', `套用後的專案不合法：${e instanceof ProjectError ? e.issues.join('; ') : (e as Error).message}`); }
  return { project, ...summarize(p, project), warnings: C.magneticWarnings(project) };
}
