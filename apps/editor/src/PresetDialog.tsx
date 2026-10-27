// A preset explained (spec 2026-10-23-presets-and-languages §5.3): its preview on the left; on the right what it makes, its facts,
// what material it suits, and the styles to tick. Confirm hands the ticked ones back (none = Claude picks);
// Cancel, Esc and a click outside change nothing.
// A preset with a form (spec 2026-10-24-custom-preset §5) shows it too, every field starting on auto, and style examples to put in the chat box.
import { useEffect, useRef, useState } from 'preact/hooks';
import { pickText, type Lang, type PresetFieldInfo, type PresetInfo } from '@tellcut/protocol';
import { PresetPoster } from './PresetStrip.tsx';
import { t } from './i18n/index.ts';
import { useLang } from './i18n/lang.ts';

const AUTO = 'auto', OWN = 'own';
// a length typed in the field's own box: whole seconds in this range, else the field counts as auto
const SECONDS = { min: 5, max: 600 };
const okSeconds = (v: string) => /^\d+$/.test(v) && +v >= SECONDS.min && +v <= SECONDS.max;
// a row of buttons when the choices are few and short; a select otherwise (and always for a field with its own length box)
const MAX_BUTTONS = 5, MAX_BUTTON_CHARS = 8;
const asButtons = (f: PresetFieldInfo, lang: Lang) => !f.seconds && f.options.length + 1 <= MAX_BUTTONS
  && f.options.every((o) => [...(pickText(o.name, lang) ?? o.id)].length <= MAX_BUTTON_CHARS);

export function PresetDialog({ preset, styles, fields = {}, onConfirm, onClose }: {
  preset: PresetInfo; styles: string[]; fields?: Record<string, string>;
  onConfirm: (styles: string[], fields: Record<string, string>, examples: string[]) => void; onClose: () => void;
}) {
  const lang = useLang(), [ticked, setTicked] = useState<string[]>(styles);
  const form = preset.fields ?? [], examples = preset.examples ?? [];
  // what each field shows: an option id, auto, or own (with the seconds typed in `secs`)
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(form.map((f) => {
    const v = fields[f.id];
    return [f.id, v === undefined ? AUTO : f.options.some((o) => o.id === v) ? v : f.seconds ? OWN : AUTO];
  })));
  const [secs, setSecs] = useState<Record<string, string>>(() => Object.fromEntries(form.filter((f) => vals[f.id] === OWN).map((f) => [f.id, fields[f.id]])));
  const [picked, setPicked] = useState<number[]>([]);
  const box = useRef<HTMLDivElement>(null);
  // focus the dialog itself, not a button: the Space that opened it from a thumbnail must not click Confirm on key-up
  useEffect(() => { box.current?.focus(); }, []);
  const toggle = (id: string) => setTicked((t) => (t.includes(id) ? t.filter((x) => x !== id) : [...t, id]));
  const set = (id: string, v: string) => setVals((x) => ({ ...x, [id]: v }));
  const confirm = () => {
    const out: Record<string, string> = {};
    for (const f of form) {
      const v = vals[f.id];
      if (v === OWN) { if (okSeconds(secs[f.id] ?? '')) out[f.id] = String(+secs[f.id]); }
      else if (v !== AUTO) out[f.id] = v;
    }
    onConfirm(preset.styles.filter((s) => ticked.includes(s.id)).map((s) => s.id), out,
      examples.flatMap((e, i) => (picked.includes(i) ? [pickText(e, lang) ?? ''] : [])).filter(Boolean));
  };
  const fit = pickText(preset.fit, lang) ?? [], facts = pickText(preset.facts, lang) ?? [];
  const field = (f: PresetFieldInfo) => {
    const v = vals[f.id], name = (o: { id: string; name: PresetInfo['name'] }) => pickText(o.name, lang) ?? o.id;
    return (
      <div class="preset-field" data-field={f.id}>
        <span class="preset-field-name" data-tip={f.hint ? pickText(f.hint, lang) : undefined}>{pickText(f.name, lang) ?? f.id}</span>
        {asButtons(f, lang)
          ? <span class="preset-seg">{[{ id: AUTO, label: t('preset.auto') }, ...f.options.map((o) => ({ id: o.id, label: name(o) }))].map((o) => (
            <button type="button" data-option={o.id} class={o.id === AUTO ? 'auto' : undefined} aria-pressed={v === o.id ? 'true' : 'false'} onClick={() => set(f.id, o.id)}>{o.label}</button>))}</span>
          : <select data-field-select class={v === AUTO ? 'auto' : undefined} value={v} onChange={(e) => set(f.id, (e.target as HTMLSelectElement).value)}>
            <option value={AUTO}>{t('preset.auto')}</option>
            {f.options.map((o) => <option value={o.id}>{name(o)}</option>)}
            {f.seconds && <option value={OWN}>{t('preset.ownSeconds')}</option>}
          </select>}
        {v === OWN && <span class="preset-secs">
          <input data-seconds type="number" inputMode="numeric" min={SECONDS.min} max={SECONDS.max} step={1} value={secs[f.id] ?? ''}
            onInput={(e) => { const x = (e.target as HTMLInputElement).value; setSecs((s) => ({ ...s, [f.id]: x })); }} />
          <small>{t('preset.secondsRange')}</small>
        </span>}
      </div>
    );
  };
  return (
    <div class="modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={box} tabIndex={-1} class="preset-dialog" data-preset-dialog role="dialog" aria-labelledby="preset-title" onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
        // Enter confirms (a focused button keeps its own Enter; a select or the seconds box takes it as typing); either way it never reaches the chat composer
        // a held-down Enter (the one that opened the dialog from a thumbnail) is swallowed, not acted on
        else if (e.key === 'Enter' && !(e as any).isComposing) { e.stopPropagation(); if (!(e.target as HTMLElement).closest('button, select, input:not([type=checkbox])')) { e.preventDefault(); if (!e.repeat) confirm(); } }
      }}>
        <div class="preset-preview"><PresetPoster preset={preset} play /></div>
        <div class="preset-body">
          <h3 id="preset-title">{pickText(preset.name, lang) ?? preset.id}</h3>
          <p class="preset-summary">{pickText(preset.summary, lang)}</p>
          {facts.length > 0 && <div class="preset-facts">{facts.map((f) => <span>{f}</span>)}</div>}
          {fit.length > 0 && <><h5>{t('preset.fitHead')}</h5><ul class="preset-fit">{fit.map((f) => <li>{f}</li>)}</ul></>}
          {form.length > 0 && <div class="preset-form">{form.map((f, i) => {
            // fields next to each other under the same heading share it
            const g = f.group ? pickText(f.group, lang) : undefined, prev = i > 0 && form[i - 1].group ? pickText(form[i - 1].group, lang) : undefined;
            return <>{g && g !== prev && <h5 data-field-group>{g}</h5>}{field(f)}</>;
          })}</div>}
          {examples.length > 0 && <>
            <h5>{t('preset.examplesHead')}</h5>
            <div class="preset-examples">{examples.map((e, i) => (
              <button type="button" data-example aria-pressed={picked.includes(i) ? 'true' : 'false'}
                onClick={() => setPicked((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i]))}>{pickText(e, lang)}</button>
            ))}</div>
          </>}
          {preset.styles.length > 0 && <>
            <h5>{t('preset.stylesHead')}</h5>
            <div class="preset-styles">{preset.styles.map((s) => (
              <label data-style={s.id} data-tip={pickText(s.desc, lang)}>
                <input type="checkbox" value={s.id} checked={ticked.includes(s.id)} onClick={() => toggle(s.id)} />
                <span>{pickText(s.name, lang) ?? s.id}{s.custom && <small>{t('preset.custom')}</small>}</span>
              </label>
            ))}</div>
          </>}
          <footer>
            <button data-cancel onClick={onClose}>{t('preset.cancel')}</button>
            <button class="primary" data-confirm onClick={confirm}>{t('preset.confirm')}</button>
          </footer>
        </div>
      </div>
    </div>
  );
}
