// The properties panel's Template row (engine templates.ts, spec 2026-11-16-block-templates): for a block that has named templates,
// a dropdown at the top of its parameters. Picking one writes the template's params into the item as one undoable edit, keeping the
// params it does not mention. It is an action, not a state: the item keeps no template name, so the box always goes back to its
// placeholder and never claims "the current template". (common.caption / common.heading have their own kind: CaptionTemplates.)
import type { BlockTemplate } from '@tellcut/engine';
import { blockText } from './i18n/blocks.ts';
import { t } from './i18n/index.ts';

export function BlockTemplates({ type, templates, onApply }: { type: string; templates: BlockTemplate[]; onApply: (id: string) => void }) {
  return (
    // the editor's labels are English; the placeholder, the tip and the templates' names follow the UI language
    <label class="field" data-field="template"><span data-tip={t('ed.tplTip')}>Template</span>
      <select value="" aria-label={`Template: ${t('ed.tplTip')}`} data-block-templates={type}
        onChange={(e) => { const box = e.currentTarget as HTMLSelectElement, id = box.value; box.value = ''; if (id) onApply(id); }}>
        <option value="">{t('ed.tplPick')}</option>
        {templates.map((x) => { const s = blockText(`${type}#${x.id}`, x); return <option value={x.id} title={s.doc} data-block-template={x.id}>{s.label}</option>; })}
      </select>
    </label>
  );
}
