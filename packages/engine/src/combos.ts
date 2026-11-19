// Combos (spec 2026-11-16-combos): a named moment of several layers (block templates, sound effects, the clip's shake) with their
// offsets. Placing one expands it into ordinary timeline items, each of them editable and deletable on its own afterwards: the
// project never names the combo, so drawing, export and check never meet one and the schema is unchanged. The cut script
// (c.combo) and, later, the editor both place a combo through expandCombo.
import type { Combo, ComboPart } from './plugin.ts';
import type { Registry } from './registry.ts';
import { applyTemplate, paramValueProblem } from './templates.ts';
import { r6 } from './commands/core.ts';

/** at most this many combos: a long list stops being a choice */
export const MAX_COMBOS = 16;
/** a combo id, and a part's name: one lower-case English word */
export const COMBO_ID = /^[a-z][a-z0-9]*$/;
/** an ending combo (Combo.ending) over more than this many seconds before the film's end leaves the film going on after it: only
 *  rounding, since a single frame of the clip coming back after the fade to black is seen (an export showed 0.2 s of it) */
export const ENDING_SLACK = 0.01;

/** what a combo's types are checked against: the registry, or anything that finds item and sound types the same way */
export type ComboLookup = Pick<Registry, 'item' | 'sfx'>;

/** one layer of an expanded combo, `at` / `len` still relative to the moment; `params` with the template already applied */
export interface ComboPlacement {
  name: string; kind: ComboPart['kind']; type?: string; at: number; len: number; params: Record<string, unknown>;
  layer?: 'top' | 'under'; gain?: number; px?: number; hz?: number;
}

/** what a placed combo's caller can change per layer: false leaves it out; an object goes over the layer's params (a sound's `gain`
 *  sets its level, the shake takes only `px` / `hz`) */
export interface ComboOptions { sound?: boolean; parts?: Record<string, false | Record<string, unknown>> }

/** What is wrong with a combo (none: an empty list): a one-word id, a label and a doc, at least two parts of which one is a picture,
 *  part names unique one-word, every type an existing block (effect) or sound (sfx), every template one its block has, every param
 *  one the block declares with a value it takes, the shake with no type, every length above 0. */
export function comboProblems(c: Combo, lookup: ComboLookup): string[] {
  const out: string[] = [], id = String(c?.id), name = `組合 ${id}`;
  if (!COMBO_ID.test(id)) out.push(`${name}：id 要是一個小寫英文字（例如 impact）`);
  if (typeof c?.label !== 'string' || !c.label.trim()) out.push(`${name}：沒有 label`);
  if (typeof c?.doc !== 'string' || !c.doc.trim()) out.push(`${name}：沒有 doc（一行：什麼場合用，看起來、聽起來怎樣）`);
  if (c?.ending !== undefined && c.ending !== true) out.push(`${name}：ending 只能是 true（片尾用的組合）或不寫`);
  const parts = Array.isArray(c?.parts) ? c.parts : [];
  if (parts.length < 2) out.push(`${name}：至少要兩層，現在 ${parts.length} 層`);
  if (!parts.some((p) => p?.kind === 'effect')) out.push(`${name}：至少要有一層畫面（kind: 'effect'）`);
  const seen = new Set<string>();
  for (const p of parts) {
    const pn = String(p?.name), at = `${name}/${pn}`;
    if (!COMBO_ID.test(pn)) out.push(`${at}：name 要是一個小寫英文字（例如 flash）`);
    if (seen.has(pn)) out.push(`${at}：name 重複`);
    seen.add(pn);
    if (!Number.isFinite(p?.at)) out.push(`${at}：at 要是數字（相對那一刻的秒數，可以是負的）`);
    if (!(Number.isFinite(p?.len) && p.len > 0)) out.push(`${at}：len 要大於 0`);
    if (p?.gain !== undefined && !Number.isFinite(p.gain)) out.push(`${at}：gain 要是數字（dB）`);
    if (p?.kind === 'shake') {
      if (p.type !== undefined || p.template !== undefined || p.params !== undefined) out.push(`${at}：shake 是片段的晃動，不能有 type、template、params`);
      for (const k of ['px', 'hz'] as const) if (p[k] !== undefined && !(Number.isFinite(p[k]) && p[k]! > 0)) out.push(`${at}：${k} 要大於 0`);
      continue;
    }
    if (p?.px !== undefined || p?.hz !== undefined) out.push(`${at}：px、hz 只有 shake 用`);
    if (p?.kind === 'sfx') {
      if (!p.type || !lookup.sfx(p.type)) out.push(`${at}：沒有「${p.type}」這個音效`);
      if (p.template !== undefined || p.layer !== undefined) out.push(`${at}：音效沒有 template、layer`);
      continue;
    }
    if (p?.kind !== 'effect') { out.push(`${at}：kind 要是 effect、sfx 或 shake`); continue; }
    if (p.gain !== undefined) out.push(`${at}：gain 只有音效用`);
    if (p.layer !== undefined && p.layer !== 'top' && p.layer !== 'under') out.push(`${at}：layer 只能是 'top' 或 'under'`);
    const t = p.type ? lookup.item(p.type) : undefined;
    if (!t) { out.push(`${at}：沒有「${p.type}」這個積木`); continue; }
    if (p.template !== undefined) { try { applyTemplate(t, p.template); } catch (e) { out.push(`${at}：${(e as Error).message}`); } }
    for (const [k, v] of Object.entries(p.params ?? {})) {
      const d = t.params.find((x) => x.key === k);
      if (!d) { out.push(`${at}：${t.type} 沒有 ${k} 參數`); continue; }
      const bad = paramValueProblem(d, v);
      if (bad) out.push(`${at}：${k} ${bad}`);
    }
  }
  return out;
}

/** The layers to place for combo `c`, in its order, times relative to the moment: `sound: false` leaves the sounds out; `parts`
 *  leaves a layer out (false) or sets its params (over the template's and the combo's own). A name in `parts` the combo does not
 *  have throws, listing the names it has; so does a template the block has not. */
export function expandCombo(c: Combo, lookup: ComboLookup, o: ComboOptions = {}): ComboPlacement[] {
  const names = c.parts.map((p) => p.name), over = o.parts ?? {};
  const odd = Object.keys(over).filter((k) => !names.includes(k));
  if (odd.length) throw new Error(`組合 ${c.id} 沒有「${odd.join('、')}」這一層；它有：${names.join('、')}`);
  const out: ComboPlacement[] = [];
  for (const p of c.parts) {
    const mine = over[p.name];
    if (mine === false || (p.kind === 'sfx' && o.sound === false)) continue;
    if (mine !== undefined && (!mine || typeof mine !== 'object' || Array.isArray(mine))) throw new Error(`組合 ${c.id} 的 parts.${p.name} 要是 false 或參數物件，現在是 ${JSON.stringify(mine)}`);
    const own = mine ?? {}, base = { name: p.name, kind: p.kind, at: p.at, len: p.len };
    if (p.kind === 'shake') {
      const bad = Object.keys(own).filter((k) => k !== 'px' && k !== 'hz');
      if (bad.length) throw new Error(`組合 ${c.id} 的 ${p.name} 是鏡頭晃動，只能改 px、hz（不能改 ${bad.join('、')}）`);
      const px = own.px ?? p.px, hz = own.hz ?? p.hz;
      out.push({ ...base, params: {}, ...(px !== undefined ? { px: px as number } : {}), ...(hz !== undefined ? { hz: hz as number } : {}) });
      continue;
    }
    if (p.kind === 'sfx') {
      const { gain: g, ...rest } = own, gain = (g ?? p.gain) as number | undefined;
      out.push({ ...base, type: p.type, params: { ...p.params, ...rest }, ...(gain !== undefined ? { gain } : {}) });
      continue;
    }
    const t = lookup.item(p.type!);
    if (!t) throw new Error(`組合 ${c.id} 的 ${p.name}：沒有「${p.type}」這個積木`);
    const params = { ...p.params, ...own };
    out.push({ ...base, type: p.type, params: p.template ? applyTemplate(t, p.template, params) : params, ...(p.layer ? { layer: p.layer } : {}) });
  }
  return out;
}

/** a placed layer's start and end in film seconds for a moment at `moment`: a layer that would start before 0 starts at 0 and keeps
 *  its end (a riser ahead of a moment at the film's start is shorter, never late); null when it would be over before 0 */
export function comboSpan(p: Pick<ComboPart, 'at' | 'len'>, moment: number): { start: number; end: number } | null {
  const end = r6(moment + p.at + p.len);
  return end > 0 ? { start: r6(Math.max(0, moment + p.at)), end } : null;
}

/** where the layers of a combo placed at `moment` are over (the shake aside: it is the clip's own), in film seconds */
export function comboEnd(layers: ReadonlyArray<Pick<ComboPart, 'kind' | 'at' | 'len'>>, moment: number): number {
  return r6(Math.max(moment, ...layers.filter((l) => l.kind !== 'shake').map((l) => moment + l.at + l.len)));
}
