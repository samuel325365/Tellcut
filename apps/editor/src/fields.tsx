// Small form fields that commit on change (blur / Enter), never per keystroke.
import { cloneElement, toChildArray, type VNode } from 'preact';
import { useRef, useState } from 'preact/hooks';
import { t } from './i18n/index.ts';
import { getLang } from './i18n/lang.ts';
import { paramText } from './i18n/params.ts';
import { paramDefault, resolveTheme, type ParamDef, type Project } from '@tellcut/engine';

type Commit<T> = (v: T) => void;
// hint: what the name stands for, as a tooltip on the name
// The tooltip lives on the name (data-tip only: an aria-label there would replace the control's own name); the control, the first
// child, is named "name: hint" for screen readers.
const Row = ({ label, name, hint, children }: { label: string; name?: string; hint?: string; children: any }) => {
  const [control, ...rest] = toChildArray(children);
  return (
    <label class="field" data-field={name}><span {...(hint ? { 'data-tip': hint } : {})}>{label}</span>
      {hint && control && typeof control === 'object' ? cloneElement(control as VNode, { 'aria-label': `${label}: ${hint}` }) : control}{rest}</label>
  );
};

/** A typed box's text until it is committed (change: blur / Enter) or left: the box is controlled, so any re-render meanwhile
 *  (the playhead moving the panel, a save coming back) would otherwise put the old value back under the cursor. Without a
 *  draft the box shows `value`, so changes from outside (undo, the timeline) still show while it is not being typed in. */
export function useDraft(value: string, commit: (text: string) => void) {
  return useCheckedDraft(value, (text) => { commit(text); return true; }).box;
}

/** useDraft whose commit may refuse the text (returns false): the box then keeps it, through a blur too, so it can be fixed,
 *  and `bad` says so. A ref, not only state, carries the refusal to the blur: the browser sends change and then blur in one
 *  go, before a re-render would hand onBlur the new state. */
function useCheckedDraft(value: string, commit: (text: string) => boolean) {
  const [draft, setDraft] = useState<string | null>(null);
  const [bad, setBad] = useState(false);
  const held = useRef(false);
  const text = (e: Event) => (e.currentTarget as HTMLInputElement | HTMLTextAreaElement).value;
  return {
    bad: bad && draft !== null,
    box: { value: draft ?? value, onInput: (e: Event) => setDraft(text(e)), onBlur: () => { if (!held.current) setDraft(null); },
      onChange: (e: Event) => { const s = text(e); held.current = !commit(s); setBad(held.current); setDraft(held.current ? s : null); } },
  };
}

export function NumberField({ label, name, hint, value, step = 0.01, min, max, disabled, onCommit }: { label: string; name?: string; hint?: string; value: number | undefined; step?: number; min?: number; max?: number; disabled?: boolean; onCommit: Commit<number | undefined> }) {
  const box = useDraft(value === undefined ? '' : String(value), (v) => onCommit(v === '' ? undefined : Number(v)));
  return <Row label={label} name={name} hint={hint}><input type="number" step={step} min={min} max={max} disabled={disabled} {...box} /></Row>;
}
export function TextField({ label, name, hint, value, onCommit }: { label: string; name?: string; hint?: string; value: string | undefined; onCommit: Commit<string> }) {
  const box = useDraft(value ?? '', onCommit);
  return <Row label={label} name={name} hint={hint}><input type="text" {...box} /></Row>;
}
export function TextArea({ label, name, hint, value, onCommit }: { label: string; name?: string; hint?: string; value: string; onCommit: Commit<string> }) {
  const box = useDraft(value ?? '', onCommit);
  return <Row label={label} name={name} hint={hint}><textarea rows={3} {...box} /></Row>;
}
/** The picker only takes #rrggbb: #rgb is widened; anything else (rgba(), names) stays a text field so it is not lost. */
export function ColorField({ label, name, hint, value, onCommit }: { label: string; name?: string; hint?: string; value: string; onCommit: Commit<string> }) {
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(value ?? '');
  const hex = short ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}` : value;
  if (!/^#[0-9a-f]{6}$/i.test(hex ?? '')) return <TextField label={label} name={name} hint={hint} value={value} onCommit={onCommit} />;
  return <Row label={label} name={name} hint={hint}><input type="color" value={hex.toLowerCase()} onChange={(e) => onCommit((e.target as HTMLInputElement).value)} /></Row>;
}
export const CheckField = ({ label, name, hint, value, onCommit }: { label: string; name?: string; hint?: string; value: boolean; onCommit: Commit<boolean> }) =>
  <Row label={label} name={name} hint={hint}><input type="checkbox" checked={value} onChange={(e) => onCommit((e.target as HTMLInputElement).checked)} /></Row>;
export const SelectField = ({ label, name, hint, value, options, onCommit }: { label: string; name?: string; hint?: string; value: string; options: Array<[string, string]>; onCommit: Commit<string> }) =>
  <Row label={label} name={name} hint={hint}><select value={value} onChange={(e) => onCommit((e.target as HTMLSelectElement).value)}>{options.map(([v, t]) => <option value={v}>{t}</option>)}</select></Row>;

export function JsonField({ label, name, hint, value, onCommit }: { label: string; name?: string; hint?: string; value: unknown; onCommit: Commit<unknown> }) {
  const [draft, setDraft] = useState<string | null>(null);   // the user's text while it does not parse
  return (
    <Row label={label} name={name} hint={hint}>
      <textarea rows={4} class="json" value={draft ?? JSON.stringify(value, null, 1)}
        onChange={(e) => {
          const text = (e.target as HTMLTextAreaElement).value;
          try { const v = JSON.parse(text); setDraft(null); onCommit(v); } catch { setDraft(text); }
        }} />
      {draft !== null && <em class="bad">{t('ed.jsonBad')}</em>}
    </Row>
  );
}

/** A `text` / `string` param a project's cut.ts gave as an array (common.routeboard's stops and legs, common.touch's touches,
 *  common.flatlay's objects), as the box shows it, and how an edit goes back into an array of the same shape (`parseArrayText`):
 *  the blocks read such a list as it is, and a string in its place would be read by different rules, or not at all.
 *  - The line form, in the syntax those blocks read in their text: an entry per line (`multiline`) or `, ` between entries, an
 *    entry's own fields joined by `|`, nothing for null like Array.join.
 *  - JSON, when an entry is an object (or nested deeper), which is what the blocks taking objects read in their text; and
 *    whenever the line form would not read back to the same list (an entry holding the separator, a '' and a null in one
 *    column, a '3' among numbers…), so an edit never changes what the user did not touch.
 *  Nothing is stored until the box is edited. */
export function arrayForm(v: unknown[], multiline: boolean): { text: string; json: boolean } {
  const flat = (x: unknown) => (x === null || x === undefined ? '' : typeof x === 'object' ? null : String(x));
  const rows = v.map((x) => {
    if (!Array.isArray(x)) return flat(x);
    const fields = x.map(flat);
    return fields.includes(null) ? null : fields.join('|');
  });
  if (!rows.includes(null)) {
    const text = rows.join(multiline ? '\n' : ', ');
    // JSON on both sides: undefined is stored as null in project.json anyway, and comes back as null
    if (JSON.stringify(parseArrayText(text, v, multiline)) === JSON.stringify(v)) return { text, json: false };
  }
  return { text: multiline ? JSON.stringify(v, null, 2) : JSON.stringify(v), json: true };
}
export const arrayText = (v: unknown[], multiline: boolean) => arrayForm(v, multiline).text;

/** what one column of the original list held (a flat list is one column; a list of rows has one per field position) */
type Column = { num: boolean; bool: boolean; str: boolean; nul: boolean };
const columnOf = (xs: unknown[]): Column => ({ num: xs.some((x) => typeof x === 'number'), bool: xs.some((x) => typeof x === 'boolean'),
  str: xs.some((x) => typeof x === 'string'), nul: xs.some((x) => x === null || x === undefined) });

/** The line form's text back into a list shaped like `like`, the value the box showed: rows stay arrays (split at `|`) when
 *  its entries were arrays, else entries stay flat. Entries and fields are trimmed; a multiline box drops blank lines (a
 *  trailing newline is not an empty entry, which a block would read as a stop at 0 s), a one-line box keeps empty entries
 *  in place (routeboard's legs are by position) and splits at `,` or `，` with or without the space. A field becomes a number
 *  when it reads as a finite one and its column held numbers, true / false when it held booleans, else stays a string; an
 *  empty field is null when its column held null, or numbers / booleans and no strings (a cleared number), else '' (also in a column the
 *  list did not have, or in a list that was empty). */
export function parseArrayText(text: string, like: unknown[], multiline: boolean): unknown[] {
  const nested = like.some(Array.isArray), rows = like.filter(Array.isArray) as unknown[][];
  const cols = nested ? Array.from({ length: Math.max(0, ...rows.map((r) => r.length)) }, (_, j) => columnOf(rows.filter((r) => r.length > j).map((r) => r[j])))
    : [columnOf(like)];
  const field = (s: string, col: Column | undefined): unknown => {
    if (s === '') return col && (col.nul || col.num || col.bool) && (col.nul || !col.str) ? null : '';
    if (col?.num && Number.isFinite(Number(s))) return Number(s);
    if (col?.bool && (s === 'true' || s === 'false')) return s === 'true';
    return s;
  };
  const entries = multiline ? text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
    : text.trim() === '' ? [] : text.split(/[,，]/).map((s) => s.trim());
  return entries.map((e) => (nested ? e.split('|').map((f, j) => field(f.trim(), cols[j])) : field(e, cols[0])));
}

/** The box of a `text` / `string` param holding a list: an edit commits a list again (see arrayForm). In the JSON form a text
 *  that is not a JSON list stays in the box with the bad-JSON hint, as JsonField does; an emptied box is the empty list. */
function ArrayField({ label, hint, value, multiline, onCommit }: { label: string; hint?: string; value: unknown[]; multiline: boolean; onCommit: Commit<unknown> }) {
  const form = arrayForm(value, multiline);
  const { box, bad } = useCheckedDraft(form.text, (text) => {
    if (!form.json) { onCommit(parseArrayText(text, value, multiline)); return true; }
    if (text.trim() === '') { onCommit([]); return true; }
    try { const list = JSON.parse(text); if (Array.isArray(list)) { onCommit(list); return true; } } catch { /* not JSON: kept below */ }
    return false;
  });
  return (
    <Row label={label} hint={hint}>
      {multiline ? <textarea rows={3} {...box} /> : <input type="text" {...box} />}
      {bad && <em class="bad">{t('ed.jsonBad')}</em>}
    </Row>
  );
}

/** One field per ParamDef (spec §2.1: the panel is generated from the plugin's parameter definitions).
 *  `type`: the block / sound the definition belongs to, so its name can be translated; the gallery shows the name in the page's language,
 *  the properties panel (editor labels are always English) in English with the hint, in the page's language, as a tooltip. Without `type` the label is shown as written. */
export function ParamField({ def, value, project, type, surface = 'editor', onCommit }: { def: ParamDef; value: unknown; project: Project; type?: string; surface?: 'gallery' | 'editor'; onCommit: Commit<unknown> }) {
  const v = value ?? paramDefault(def, resolveTheme(project.meta.theme, project.meta));
  const shown = type ? paramText(type, def.key, def.label, surface === 'gallery' ? getLang() : 'en') : { name: def.label };
  const hint = type && surface === 'editor' ? paramText(type, def.key, def.label).hint : shown.hint;
  const label = shown.name;
  const field = (() => {
    switch (def.type) {
      case 'number': return <NumberField label={label} hint={hint} value={v as number} step={def.step ?? 0.01} min={def.min} max={def.max} onCommit={onCommit} />;
      case 'string': return Array.isArray(v) ? <ArrayField label={label} hint={hint} value={v} multiline={false} onCommit={onCommit} />
        : <TextField label={label} hint={hint} value={v as string} onCommit={onCommit} />;
      case 'text': return Array.isArray(v) ? <ArrayField label={label} hint={hint} value={v} multiline onCommit={onCommit} />
        : <TextArea label={label} hint={hint} value={v as string} onCommit={onCommit} />;
      case 'color': return <ColorField label={label} hint={hint} value={v as string} onCommit={onCommit} />;
      case 'bool': return <CheckField label={label} hint={hint} value={!!v} onCommit={onCommit} />;
      case 'enum': return <SelectField label={label} hint={hint} value={v as string} options={def.options.map((o) => [o, o])} onCommit={onCommit} />;
      case 'source-ref': return <SelectField label={label} hint={hint} value={v as string} options={Object.keys(project.sources).map((s) => [s, s])} onCommit={onCommit} />;
      case 'media-ref': return <SelectField label={label} hint={hint} value={v as string} options={Object.keys(project.media).map((s) => [s, s])} onCommit={onCommit} />;
      default: return <JsonField label={label} hint={hint} value={v} onCommit={onCommit} />;
    }
  })();
  return <div data-param={def.key}>{field}</div>;
}
