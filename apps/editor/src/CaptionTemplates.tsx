// The properties panel's caption templates (spec 2026-11-04-caption-styles §5): a grid of the templates' pictures for the selected
// common.caption, the one it draws with marked; a small stage under the grid plays the one pointed at (else the one in use); a click puts it on the
// caption, and two buttons put the caption's template on its whole track or make it the film's default (one undo step each).
// The same grid serves common.heading's title templates (`kind: 'title'`, spec 2026-11-05-title-templates).
// My templates come from the library the editor holds (fetched with the project, again after a save or delete); the built-in
// ones' pictures are the gallery's (the server knows which golden picture draws each).
import { useEffect, useState } from 'preact/hooks';
// the templates alone: the editor does not load the blocks' code (the player does)
import { TEMPLATES } from '@tellcut/plugin-common/templates';
import { TITLE_TEMPLATES } from '@tellcut/plugin-common/title-templates';
import { handleOf, TEMPLATE_KINDS, type GalleryBlock, type TemplateKind } from '@tellcut/protocol';
import type { ParamDef, Project } from '@tellcut/engine';
import type { Editor } from './editor.ts';
import { PlayerPreview } from './PlayerPreview.tsx';
import { captionProject, matches, thumbIn, titleProject } from './gallery.ts';
import { myTemplateKey } from './editor/captions.ts';
import { blockText } from './i18n/blocks.ts';
import { getLang } from './i18n/lang.ts';
import { t, type Key } from './i18n/index.ts';
import { tip } from './tip.ts';

/** the panel's tips and hints for each kind: a title's never say "caption" */
const WORDS: Record<TemplateKind, Record<'film' | 'track' | 'filmSet' | 'save' | 'del' | 'ask' | 'search', Key>> = {
  caption: { film: 'ed.capFilmTip', track: 'ed.capTrackTip', filmSet: 'ed.capFilmSetTip', save: 'ed.capSaveTip', del: 'ed.capDeleteTip', ask: 'ed.capDeleteAsk', search: 'ed.capSearch' },
  title: { film: 'ed.ttlFilmTip', track: 'ed.ttlTrackTip', filmSet: 'ed.ttlFilmSetTip', save: 'ed.ttlSaveTip', del: 'ed.ttlDeleteTip', ask: 'ed.ttlDeleteAsk', search: 'ed.ttlSearch' },
};

/** a template's picture; its name's first letters when it has none (or it fails to load) */
function Pic({ src }: { src?: string }) {
  const [broken, setBroken] = useState('');
  return src && broken !== src ? <img src={src} alt="" loading="lazy" onError={() => setBroken(src)} /> : <span class="cap-none">Aa</span>;
}

/** Enter or Space on a tile itself (not on a button inside its cell) */
const pressed = (e: KeyboardEvent) => e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ');

type Ed = Pick<Editor, 'captionTemplateOnItem' | 'myCaptionTemplateOnItem' | 'saveMyCaptionTemplate' | 'deleteMyCaptionTemplate' | 'myCaptionTemplates'
  | 'templateThumb' | 'loadTemplateThumbs' | 'captionTemplateOnTrack' | 'projectCaptionTemplate'>;

export function CaptionTemplates({ editor, project, item, track, defs, kind = 'caption' }: { editor: Ed; project: Project; item: any; track: string; defs: ParamDef[]; kind?: TemplateKind }) {
  const K = TEMPLATE_KINDS[kind], W = WORDS[kind], ALL = kind === 'title' ? TITLE_TEMPLATES : TEMPLATES, preview = kind === 'title' ? titleProject : captionProject;
  const [hover, setHover] = useState<string | null>(null), [q, setQ] = useState(''), [saveName, setSaveName] = useState('');
  useEffect(() => { void editor.loadTemplateThumbs(); }, []);
  const mine = editor.myCaptionTemplates(kind);
  const mineOf = (key: string | null) => (key?.startsWith('mine:') ? mine.find((m) => `mine:${m.slug}` === key) : undefined);
  const own = String(item.params?.template ?? ''), film = String((project.meta as Record<string, unknown>)[K.meta] ?? '');
  const caption: GalleryBlock = { plugin: 'common', group: '', type: K.block, label: '', doc: '', kind: 'overlay', params: defs, needsMedia: false };
  // a film default set from one of my templates is its copy's key (my-<slug>-<hash>): named by the template, or by its slug once
  // the template is gone from the library
  const name = (id: string) => (id.startsWith('my-') ? mine.find((m) => myTemplateKey(m) === id)?.name ?? id.replace(/^my-/, '').replace(/-[^-]*$/, '')
    : blockText(`${kind}:${id}`, ALL.find((x) => x.id === id) ?? { label: id, doc: '' }).label);
  const list = ALL.filter((x) => matches(q, handleOf(`${kind}:${x.id}`), x.id, x.label, name(x.id), ...Object.values(x.params).map(String)));
  const point = (id: string | null) => ({ onMouseEnter: () => setHover(id), onMouseLeave: () => setHover(null), onFocus: () => setHover(id), onBlur: () => setHover(null) });
  const tile = (id: string, label: string, pic?: string) => (
    <li class={`cap-tile${(own || '') === id ? ' on' : ''}`} data-caption-template={id} role="button" tabIndex={0} aria-pressed={(own || '') === id} {...tip(label)} {...point(id || null)}
      onClick={() => editor.captionTemplateOnItem(item.id, id, kind)} onKeyDown={(e) => { if (pressed(e)) { e.preventDefault(); editor.captionTemplateOnItem(item.id, id, kind); } }}>
      <Pic src={pic} />
      <span class="cap-name">{label}</span>
    </li>
  );
  const remove = async (m: { slug: string; name: string }) => { if (confirm(t(W.ask, { name: m.name }))) await editor.deleteMyCaptionTemplate(m.slug, kind); };
  return (
    <div class="field-group cap-templates" data-group="captionTemplates">
      <span>{kind === 'title' ? 'Title template' : 'Caption template'}{film && <small {...tip(t(W.film))}> · film: {name(film)}</small>}</span>
      <input type="search" class="cap-search" placeholder={t(W.search)} aria-label={t(W.search)} value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
      <ul class="cap-grid">
        {!q && tile('', film ? `Film's (${name(film)})` : 'None')}
        {/* one of mine: the tile and its ✕ side by side in one cell (a button inside a role=button would be two controls in one) */}
        {mine.filter((m) => matches(q, undefined, m.name, m.desc, m.slug)).map((m) => {
          const on = own === myTemplateKey(m);
          return (
            <li class="cap-mine-cell">
              <div class={`cap-tile cap-mine${on ? ' on' : ''}`} data-caption-mine={m.slug} role="button" tabIndex={0} aria-pressed={on} {...tip(m.desc || m.name)} {...point(`mine:${m.slug}`)}
                onClick={() => editor.myCaptionTemplateOnItem(item.id, m, kind)}
                onKeyDown={(e) => {
                  if (pressed(e)) { e.preventDefault(); editor.myCaptionTemplateOnItem(item.id, m, kind); }
                  else if (e.target === e.currentTarget && e.key === 'Delete') { e.preventDefault(); void remove(m); }
                }}><span class="cap-none">★</span><span class="cap-name">{m.name}</span></div>
              <button class="cap-del" data-caption-mine-delete={m.slug} {...tip(t(W.del))} onClick={() => void remove(m)}>✕</button>
            </li>
          );
        })}
        {list.map((x) => tile(x.id, `${handleOf(`${kind}:${x.id}`) ?? ''} ${name(x.id)}`.trim(), thumbIn(editor.templateThumb(x.id, kind), getLang())))}
      </ul>
      {/* the one pointed at, else the one the caption draws with (its own, else the film's) */}
      {(hover || own || film) && <div class="cap-hover" data-caption-preview={hover || own || film}><PlayerPreview project={preview(caption, hover || own || film, getLang(), mineOf(hover)?.params ?? (project.meta as any)[K.own]?.[hover || own || film])} /></div>}
      <div class="cap-save">
        <input type="text" placeholder={t('ed.templateName')} aria-label={t('ed.templateName')} value={saveName} data-caption-save-name onInput={(e) => setSaveName((e.target as HTMLInputElement).value)} />
        <button data-caption-save disabled={!saveName.trim()} {...tip(t(W.save))} onClick={async () => { if (await editor.saveMyCaptionTemplate(item.id, saveName.trim(), kind)) setSaveName(''); }}>☆ Save as my template</button>
      </div>
      <div class="cap-actions">
        <button data-caption-track disabled={!own} {...tip(t(W.track))} onClick={() => editor.captionTemplateOnTrack(track, own, kind)}>Use on the whole track</button>
        <button data-caption-film disabled={!own || own === film} {...tip(t(W.filmSet))} onClick={() => editor.projectCaptionTemplate(own, kind)}>Make it the film's default</button>
      </div>
    </div>
  );
}
