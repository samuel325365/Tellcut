// The properties panel's caption templates (spec 2026-11-04-caption-styles §5): a grid of the templates' pictures for the selected
// common.caption, the one it draws with marked; a small stage under the grid plays the one pointed at (else the one in use); a click puts it on the
// caption, and two buttons put the caption's template on its whole track or make it the film's default (one undo step each).
import { useState } from 'preact/hooks';
// the templates alone: the editor does not load the blocks' code (the player does)
import { TEMPLATES } from '@tellcut/plugin-common/templates';
import { handleOf, type GalleryBlock } from '@tellcut/protocol';
import type { ParamDef, Project } from '@tellcut/engine';
import { PlayerPreview } from './PlayerPreview.tsx';
import { captionProject, matches } from './gallery.ts';
import { blockText } from './i18n/blocks.ts';
import { getLang } from './i18n/lang.ts';
import { t } from './i18n/index.ts';
import { tip } from './tip.ts';

/** a template's golden picture (its sample tpl-<id> in plugin-common's samples) */
export const templateThumb = (id: string) => `/api/gallery/thumb/tpl-${id}-t1.50.png`;

export function CaptionTemplates({ editor, project, item, track, defs }: { editor: any; project: Project; item: any; track: string; defs: ParamDef[] }) {
  const [hover, setHover] = useState<string | null>(null), [q, setQ] = useState('');
  const own = String(item.params?.template ?? ''), film = String(project.meta.captionTemplate ?? '');
  const caption: GalleryBlock = { plugin: 'common', group: '', type: 'common.caption', label: '', doc: '', kind: 'overlay', params: defs, needsMedia: false };
  const name = (id: string) => blockText(`caption:${id}`, TEMPLATES.find((x) => x.id === id) ?? { label: id, doc: '' }).label;
  const list = TEMPLATES.filter((x) => matches(q, handleOf(`caption:${x.id}`), x.id, x.label, name(x.id), ...Object.values(x.params).map(String)));
  const tile = (id: string, label: string, pic?: string) => (
    <li class={`cap-tile${(own || '') === id ? ' on' : ''}`} data-caption-template={id} role="button" tabIndex={0} {...tip(label)}
      onMouseEnter={() => setHover(id || null)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(id || null)} onBlur={() => setHover(null)}
      onClick={() => editor.captionTemplateOnItem(item.id, id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); editor.captionTemplateOnItem(item.id, id); } }}>
      {pic ? <img src={pic} alt="" loading="lazy" /> : <span class="cap-none">Aa</span>}
      <span class="cap-name">{label}</span>
    </li>
  );
  return (
    <div class="field-group cap-templates" data-group="captionTemplates">
      <span>Caption template{film && <small {...tip(t('ed.capFilmTip'))}> · film: {name(film)}</small>}</span>
      <input type="search" class="cap-search" placeholder="Search" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
      <ul class="cap-grid">
        {!q && tile('', film ? `Film's (${name(film)})` : 'None')}
        {list.map((x) => tile(x.id, `${handleOf(`caption:${x.id}`) ?? ''} ${name(x.id)}`.trim(), templateThumb(x.id)))}
      </ul>
      {/* the one pointed at, else the one the caption draws with (its own, else the film's) */}
      {(hover || own || film) && <div class="cap-hover" data-caption-preview={hover || own || film}><PlayerPreview project={captionProject(caption, hover || own || film, getLang())} /></div>}
      <div class="cap-actions">
        <button data-caption-track {...tip(t('ed.capTrackTip'))} onClick={() => editor.captionTemplateOnTrack(track, own)}>Use on the whole track</button>
        <button data-caption-film disabled={!own || own === film} {...tip(t('ed.capFilmSetTip'))} onClick={() => editor.projectCaptionTemplate(own)}>Make it the film's default</button>
      </div>
    </div>
  );
}
