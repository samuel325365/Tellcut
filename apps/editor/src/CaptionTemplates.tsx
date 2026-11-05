// The properties panel's caption templates (spec 2026-11-04-caption-styles §5): a grid of the templates' pictures for the selected
// common.caption, the one it draws with marked; a small stage under the grid plays the one pointed at (else the one in use); a click puts it on the
// caption, and two buttons put the caption's template on its whole track or make it the film's default (one undo step each).
// The same grid serves common.heading's title templates (`kind: 'title'`, spec 2026-11-05-title-templates).
import { useEffect, useState } from 'preact/hooks';
// the templates alone: the editor does not load the blocks' code (the player does)
import { TEMPLATES } from '@tellcut/plugin-common/templates';
import { TITLE_TEMPLATES } from '@tellcut/plugin-common/title-templates';
import { handleOf, TEMPLATE_KINDS, type GalleryBlock, type LibraryCaptionInfo, type TemplateKind } from '@tellcut/protocol';
import type { ParamDef, Project } from '@tellcut/engine';
import { PlayerPreview } from './PlayerPreview.tsx';
import { captionProject, matches, titleProject } from './gallery.ts';
import { blockText } from './i18n/blocks.ts';
import { getLang } from './i18n/lang.ts';
import { t } from './i18n/index.ts';
import { tip } from './tip.ts';

/** a template's golden picture (its sample tpl-<id>, a title's ttl-<id>, in plugin-common's samples), with its line in the UI language (npm run thumbs) */
export const templateThumb = (id: string, lang = getLang(), kind: TemplateKind = 'caption') => `/api/gallery/thumb/${kind === 'title' ? 'ttl' : 'tpl'}-${id}-t1.50.png${lang === 'zh' ? '' : `?lang=${lang}`}`;

export function CaptionTemplates({ editor, project, item, track, defs, kind = 'caption' }: { editor: any; project: Project; item: any; track: string; defs: ParamDef[]; kind?: TemplateKind }) {
  const K = TEMPLATE_KINDS[kind], ALL = kind === 'title' ? TITLE_TEMPLATES : TEMPLATES, preview = kind === 'title' ? titleProject : captionProject;
  const [hover, setHover] = useState<string | null>(null), [q, setQ] = useState(''), [mine, setMine] = useState<LibraryCaptionInfo[]>([]), [saveName, setSaveName] = useState(''), [n, setN] = useState(0);
  // My caption templates, first in the grid (reloaded after a save)
  useEffect(() => { let live = true; editor.deps?.api?.library?.().then((l: { captions?: LibraryCaptionInfo[]; titles?: LibraryCaptionInfo[] }) => { if (live) setMine((kind === 'title' ? l.titles : l.captions) ?? []); }).catch(() => {}); return () => { live = false; }; }, [n]);
  const mineOf = (key: string | null) => (key?.startsWith('mine:') ? mine.find((m) => `mine:${m.slug}` === key) : undefined);
  const own = String(item.params?.template ?? ''), film = String((project.meta as Record<string, unknown>)[K.meta] ?? '');
  const caption: GalleryBlock = { plugin: 'common', group: '', type: K.block, label: '', doc: '', kind: 'overlay', params: defs, needsMedia: false };
  const name = (id: string) => blockText(`${kind}:${id}`, ALL.find((x) => x.id === id) ?? { label: id, doc: '' }).label;
  const list = ALL.filter((x) => matches(q, handleOf(`${kind}:${x.id}`), x.id, x.label, name(x.id), ...Object.values(x.params).map(String)));
  const tile = (id: string, label: string, pic?: string) => (
    <li class={`cap-tile${(own || '') === id ? ' on' : ''}`} data-caption-template={id} role="button" tabIndex={0} {...tip(label)}
      onMouseEnter={() => setHover(id || null)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(id || null)} onBlur={() => setHover(null)}
      onClick={() => editor.captionTemplateOnItem(item.id, id, kind)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); editor.captionTemplateOnItem(item.id, id, kind); } }}>
      {pic ? <img src={pic} alt="" loading="lazy" /> : <span class="cap-none">Aa</span>}
      <span class="cap-name">{label}</span>
    </li>
  );
  return (
    <div class="field-group cap-templates" data-group="captionTemplates">
      <span>{kind === 'title' ? 'Title template' : 'Caption template'}{film && <small {...tip(t('ed.capFilmTip'))}> · film: {name(film)}</small>}</span>
      <input type="search" class="cap-search" placeholder="Search" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
      <ul class="cap-grid">
        {!q && tile('', film ? `Film's (${name(film)})` : 'None')}
        {mine.filter((m) => matches(q, m.name, m.desc, m.slug)).map((m) => <li class={`cap-tile cap-mine${own === `my-${m.slug}` ? ' on' : ''}`} data-caption-mine={m.slug} role="button" tabIndex={0} {...tip(m.desc || m.name)}
          onMouseEnter={() => setHover(`mine:${m.slug}`)} onMouseLeave={() => setHover(null)} onClick={() => editor.myCaptionTemplateOnItem(item.id, m, kind)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); editor.myCaptionTemplateOnItem(item.id, m, kind); } }}><span class="cap-none">★</span><span class="cap-name">{m.name}</span>
          <button class="cap-del" data-caption-mine-delete={m.slug} {...tip(t('ed.capDeleteTip'))} onClick={async (e) => { e.stopPropagation(); if (!confirm(t('ed.capDeleteAsk', { name: m.name }))) return; try { await editor.deps.api.deleteLibrary(K.library, m.slug); setN(n + 1); } catch { /* the list reloads */ } }}>✕</button></li>)}
        {list.map((x) => tile(x.id, `${handleOf(`${kind}:${x.id}`) ?? ''} ${name(x.id)}`.trim(), templateThumb(x.id, getLang(), kind)))}
      </ul>
      {/* the one pointed at, else the one the caption draws with (its own, else the film's) */}
      {(hover || own || film) && <div class="cap-hover" data-caption-preview={hover || own || film}><PlayerPreview project={preview(caption, hover || own || film, getLang(), mineOf(hover)?.params ?? (project.meta as any)[K.own]?.[hover || own || film])} /></div>}
      <div class="cap-save">
        <input type="text" placeholder="Name" value={saveName} data-caption-save-name onInput={(e) => setSaveName((e.target as HTMLInputElement).value)} />
        <button data-caption-save disabled={!saveName.trim()} {...tip(t('ed.capSaveTip'))} onClick={async () => { if (await editor.saveMyCaptionTemplate(item.id, saveName.trim(), kind)) { setSaveName(''); setN(n + 1); } }}>☆ Save as my template</button>
      </div>
      <div class="cap-actions">
        <button data-caption-track disabled={!own} {...tip(t('ed.capTrackTip'))} onClick={() => editor.captionTemplateOnTrack(track, own, kind)}>Use on the whole track</button>
        <button data-caption-film disabled={!own || own === film} {...tip(t('ed.capFilmSetTip'))} onClick={() => editor.projectCaptionTemplate(own, kind)}>Make it the film's default</button>
      </div>
    </div>
  );
}
