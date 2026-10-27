// Small form fields that commit on change (blur / Enter), never per keystroke.
import { cloneElement, toChildArray, type VNode } from 'preact';
import { useState } from 'preact/hooks';
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

export const NumberField = ({ label, name, hint, value, step = 0.01, min, max, onCommit }: { label: string; name?: string; hint?: string; value: number | undefined; step?: number; min?: number; max?: number; onCommit: Commit<number | undefined> }) =>
  <Row label={label} name={name} hint={hint}><input type="number" step={step} min={min} max={max} value={value ?? ''}
    onChange={(e) => { const v = (e.target as HTMLInputElement).value; onCommit(v === '' ? undefined : Number(v)); }} /></Row>;
export const TextField = ({ label, name, hint, value, onCommit }: { label: string; name?: string; hint?: string; value: string | undefined; onCommit: Commit<string> }) =>
  <Row label={label} name={name} hint={hint}><input type="text" value={value ?? ''} onChange={(e) => onCommit((e.target as HTMLInputElement).value)} /></Row>;
export const TextArea = ({ label, name, hint, value, onCommit }: { label: string; name?: string; hint?: string; value: string; onCommit: Commit<string> }) =>
  <Row label={label} name={name} hint={hint}><textarea rows={3} value={value} onChange={(e) => onCommit((e.target as HTMLTextAreaElement).value)} /></Row>;
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
      case 'string': return <TextField label={label} hint={hint} value={v as string} onCommit={onCommit} />;
      case 'text': return <TextArea label={label} hint={hint} value={v as string} onCommit={onCommit} />;
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
