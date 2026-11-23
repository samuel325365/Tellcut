// The properties panel's Template row (engine templates.ts, spec 2026-11-16-block-templates): for a block that has named templates,
// a look picker (LookPicker.tsx) at the top of its parameters, each tile a template's picture and name. Picking one writes the
// template's params into the item as one undoable edit, keeping the params it does not mention. It is an action, not a state: the
// item keeps no template name, so the row always shows its placeholder and no tile claims "the current template".
// (common.caption / common.heading have their own kind: CaptionTemplates.)
import type { BlockTemplate } from '@tellcut/engine';
import { blockText } from './i18n/blocks.ts';
import { t } from './i18n/index.ts';
import { LookPicker, lookWords } from './LookPicker.tsx';
import type { PicCrop } from './pic-crop.ts';

export function BlockTemplates({ type, templates, thumb, crop, onApply }: { type: string; templates: BlockTemplate[]; thumb: (id: string) => string | undefined;
  crop?: (id: string) => PicCrop | undefined; onApply: (id: string) => void }) {
  // the editor's labels are English; the placeholder, the tip and the templates' names follow the UI language
  const tiles = templates.map((x) => { const id = `${type}#${x.id}`, s = blockText(id, x); return { key: x.id, label: s.label, doc: s.doc, thumb: thumb(x.id), crop: crop?.(x.id), words: lookWords(id, x) }; });
  return (
    <div data-block-templates={type}>
      <LookPicker name="template" label="Template" hint={t('ed.tplTip')} placeholder={t('ed.tplPick')} tiles={tiles} onPick={onApply} />
    </div>
  );
}
