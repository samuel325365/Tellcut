// The block gallery's data (spec 2026-10-17-block-gallery): every block, sound effect, music style, recipe and combo, read from the same
// places `npm run tellcut -- catalog` reads, so the gallery never needs updating by hand. Score previews are generated on request and cached.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, resolve, sep } from 'node:path';
import { createRegistry, expandCombo, OLD_BLOCKS, OLD_TEXT, type ComboPlacement, type ItemType, type ParamDef, type Plugin } from '@tellcut/engine';
import { libraryRoot, loadStyles, SCORE_LIBRARY, sendFile, stylesDir, TELLCUT_ROOT, STYLES } from '@tellcut/media-node';
// the recipes are tools code (they drive Cut); the gallery only reads their names, notes and examples. Moving them into a package of
// their own would split Cut's API in two for that: kept as the one place the server reads from tools/ (review 2)
import { RECIPES } from '../../../tools/cut/recipes/index.ts';
// each block's samples are drawn as its golden pictures, kept (and checked) in git: the gallery's cards show them
import { cardSample, samples, variantCard, variantSample, type Sample } from '@tellcut/plugin-common/samples';
// the English and Japanese words of the samples that show Chinese (what `npm run thumbs` draws with): a variant's preview plays them
import { THUMB_PARAMS } from '@tellcut/plugin-common/thumbs';
import { CORE_CATEGORY, handleOf, PLUGIN_GROUP as GROUP, type CardGround, type GalleryBlock, type GalleryBlockVariant, type GalleryClip, type GalleryCombo, type GalleryIndex, type GallerySfx, type GalleryStyle } from '@tellcut/protocol';
import { TEMPLATES, TITLE_TEMPLATES } from '@tellcut/plugin-common';
import { HttpError, sendJson, type Router } from './http.ts';

/** A block that reads a project's photos, clips or files draws little or nothing here. The sample films pass those as json params
 *  with a null default, so the params alone don't tell: a media() hook or code that asks ctx.media for a picture does, unless the
 *  block says its footage is optional. */
const needsMedia = (t: ItemType) => t.footage !== 'optional' && (t.params.some((d) => d.type === 'source-ref' || d.type === 'media-ref') || typeof t.media === 'function'
  || /media\.(stillUrl|video|fileUrl)\(/.test(`${t.build}${t.draw}${t.ready ?? ''}`));

const GOLDEN_DIR = join(TELLCUT_ROOT, 'packages/plugin-common/golden');
/** The gallery player's own pictures (the player runs with media=api&id=_gallery): what a preview puts on its video track under a
 *  block that works on the picture under it (engine blockPreviewProject's ground). Made-up pictures kept in git beside the golden
 *  ones, so a card drawn over the street and its preview show the same street. */
export const GALLERY_IMAGES: Readonly<Record<string, string>> = { street: 'fixtures/street.png', map: 'fixtures/fake-map.png' };
/** the source ids a sample reads a picture from, which a variant's preview stands the street in for (engine blockPreviewProject's
 *  `stand`): its sources but the photo it is drawn over (golden's street ground) and a map (common.mapcam's tiles are no photo) */
const standOf = (s: Sample | undefined) => Object.entries(s?.sources ?? {}).filter(([id, x]) => id !== s!.photo && !x.map).map(([id]) => id);
/** The gallery picture a request of the gallery player names: one of GALLERY_IMAGES by its name, or the street for a source id a
 *  variant's preview stands it in for (`stands`); none for anything else. The files stay where they are: nothing is copied. */
export function galleryPicture(name: string, stands: ReadonlySet<string>): string | undefined {
  if (Object.hasOwn(GALLERY_IMAGES, name)) return GALLERY_IMAGES[name];
  return stands.has(name) ? GALLERY_IMAGES.street : undefined;
}
/** every source id the variants of these plugins' blocks stand the street in for */
const standIds = (plugins: Plugin[]) => new Set(plugins.flatMap((p) => p.items ?? []).flatMap((t) => (t.variants?.list ?? []).flatMap((v) => standOf(variantSample(t.type, v.value)))));
const GOLDEN_FILE = /^[a-z0-9-]+-t\d+\.\d{2}\.png$/;
/** a sample's picture at its last moment (the animation settled) */
const thumbOf = (c: Sample | undefined) => c && `/api/gallery/thumb/${c.name}-t${c.at[c.at.length - 1].toFixed(2)}.png`;
/** each block's thumbnail: its card's picture (cardSample: its first sample, or that one over the street) */
const THUMBS = new Map<string, string>();
for (const c of samples) if (!c.clips && !THUMBS.has(c.type)) THUMBS.set(c.type, thumbOf(cardSample(c.type))!);
/** each clip effect's card with a preview: its sample clip-<…> (samples/clips.ts), by the effect's key */
const CLIP_THUMBS: GalleryClip[] = samples.filter((c) => c.clips).map((c) => ({ key: c.type, thumb: thumbOf(c)! }));
/** a sample's picture at its last moment, by the sample's name */
const sampleThumb = (name: string) => thumbOf(samples.find((x) => x.name === name));
/** each caption template's picture: its sample tpl-<id> (samples.ts); a title template's ttl-<id> */
const TEMPLATE_THUMB = (id: string, pre = 'tpl') => sampleThumb(`${pre}-${id}`);
/** a block template's picture: its card (its sample <block>-tpl-<id>, or that one over the street) */
const BLOCK_TEMPLATE_THUMB = (type: string, id: string) => thumbOf(cardSample(type, id));
/** the ground and shape a card was drawn on, for the preview to play on the same: its sample's plain `bg` (not for a block marked
 *  over, whose preview plays over the street its card is drawn over) and its wide or square film */
const groundOf = (c: Sample | undefined, over: boolean): CardGround => ({
  ...(c?.bg && !over ? { bg: c.bg } : {}), ...(c?.wide ? { aspect: 'wide' as const } : c?.square ? { aspect: 'square' as const } : {}) });
/** a combo's pictures: every moment of its sample combo-<id> (start, peak, end), in time order */
/** a block's variants: each one's card (variantCard: its picture, ground and shape, as a template's) and what its preview plays
 *  (variantSample: the sample's params, theme and the sources it shows a picture from; its English and Japanese words) */
function variantsOf(t: ItemType): GalleryBlock['variants'] {
  if (!t.variants?.list.length) return undefined;
  return { param: t.variants.param, list: t.variants.list.map((v): GalleryBlockVariant => {
    const s = variantSample(t.type, v.value), card = variantCard(t.type, v.value), thumb = thumbOf(card), stand = standOf(s);
    const en = s && THUMB_PARAMS.en[s.name], ja = s && THUMB_PARAMS.ja[s.name];
    return { value: v.value, label: v.label, doc: v.doc, ...(thumb ? { thumb } : {}), ...groundOf(card, !!t.over), ...(s?.params ? { params: s.params } : {}),
      ...(en || ja ? { local: { ...(en ? { en } : {}), ...(ja ? { ja } : {}) } } : {}), ...(s?.theme ? { theme: s.theme } : {}), ...(stand.length ? { stand } : {}) };
  }) };
}
const COMBO_FRAMES = (id: string) => { const c = samples.find((x) => x.name === `combo-${id}`); return c ? [...c.at].sort((a, b) => a - b).map((t) => `/api/gallery/thumb/${c.name}-t${t.toFixed(2)}.png`) : []; };

export async function galleryIndex(plugins: Plugin[], library = SCORE_LIBRARY): Promise<GalleryIndex> {
  const order = (p: Plugin) => (p.id === 'core' ? 0 : p.id === 'common' ? 1 : 2);
  const sorted = [...plugins].sort((a, b) => order(a) - order(b));
  // the old blocks are not offered (the flat postcard and frame, the core lower third and end card, the wash: older projects still
  // open them); the old core.title / core.caption stay: they sit under the Titles and Captions tabs, which show only templates
  const blocks = sorted.flatMap((p) => (p.items ?? []).filter((t) => !OLD_BLOCKS[t.type] || OLD_TEXT[t.type]).map((t): GalleryBlock => ({
    plugin: p.id, group: GROUP[p.id] ?? '外掛', type: t.type, label: t.label, doc: t.doc ?? '', kind: t.kind, params: t.params, needsMedia: needsMedia(t),
    ...(t.over ? { over: t.over } : {}),
    ...(t.category ?? CORE_CATEGORY[t.type] ? { category: t.category ?? CORE_CATEGORY[t.type] } : {}), ...(THUMBS.has(t.type) ? { thumb: THUMBS.get(t.type) } : {}),
    ...groundOf(cardSample(t.type), !!t.over),
    ...(t.templates?.length ? { templates: t.templates.map((x) => { const thumb = BLOCK_TEMPLATE_THUMB(t.type, x.id);
      return { id: x.id, label: x.label, doc: x.doc, params: x.params, ...(thumb ? { thumb } : {}), ...groundOf(cardSample(t.type, x.id), !!t.over) }; }) } : {}),
    ...(t.variants?.list.length ? { variants: variantsOf(t) } : {}),
  })));
  const sfx = sorted.flatMap((p) => (p.sfx ?? []).map((s): GallerySfx => ({ plugin: p.id, type: s.type, label: s.label, doc: s.doc ?? '', params: s.params, ...(s.category ? { category: s.category } : {}) })));
  const lib = await loadStyles([library]);
  const styles: GalleryStyle[] = [
    ...Object.values(STYLES).map((s) => ({ id: s.id, label: s.label, doc: s.doc, defaults: s.defaults, origin: 'built-in' as const })),
    ...Object.values(lib.styles).map((s) => ({ id: s.id, label: s.label, doc: s.doc ?? '', defaults: s.defaults, origin: 'library' as const })),
  ];
  const recipes = Object.values(RECIPES).map((r) => ({ id: r.id, label: r.label, doc: r.doc, notes: r.notes ?? [], example: r.example }));
  const captions = TEMPLATES.map((t) => ({ id: t.id, label: t.label, doc: t.doc, params: t.params, ...(TEMPLATE_THUMB(t.id) ? { thumb: TEMPLATE_THUMB(t.id) } : {}) }));
  const titles = TITLE_TEMPLATES.map((t) => ({ id: t.id, label: t.label, doc: t.doc, params: t.params, ...(TEMPLATE_THUMB(t.id, 'ttl') ? { thumb: TEMPLATE_THUMB(t.id, 'ttl') } : {}) }));
  // the combos' layers as data (their params stay in the catalog: the card says what each layer is and when it comes), and expanded
  // as the editor's Add to timeline expands them (templates applied), with the plugins their types come from, for the live preview
  const registry = createRegistry(plugins), owner = (type: string) => plugins.find((p) => p.items?.some((x) => x.type === type) || p.sfx?.some((x) => x.type === type))?.id;
  const combos = sorted.flatMap((p) => p.combos ?? []).map((c): GalleryCombo => {
    const handle = handleOf(`combo:${c.id}`);
    let layers: ComboPlacement[] | undefined;
    try { layers = expandCombo(c, registry); } catch { /* a combo that no longer expands keeps its card and stills, without a preview */ }
    const used = [...new Set((layers ?? []).flatMap((l) => (l.type ? [owner(l.type)] : [])).filter((x): x is string => !!x))];
    return { id: c.id, ...(handle ? { handle } : {}), label: c.label, doc: c.doc, frames: COMBO_FRAMES(c.id), ...(c.ending ? { ending: true as const } : {}),
      parts: c.parts.map((x) => ({ name: x.name, kind: x.kind, ...(x.type ? { type: x.type } : {}), ...(x.template ? { template: x.template } : {}), at: x.at, len: x.len, ...(x.layer ? { layer: x.layer } : {}) })),
      ...(layers ? { layers, plugins: used } : {}) };
  });
  return { blocks, sfx, styles, recipes, captions, titles, combos, clips: CLIP_THUMBS };
}

/** composes a preview in a child process (score-child.ts), so the server keeps answering meanwhile; a refused one throws its reason */
function compose(a: { style: string; library: string; seed: number; bpm?: number; key?: string; file: string }): Promise<void> {
  const child = fileURLToPath(new URL('./score-child.ts', import.meta.url));
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, ['--import', 'tsx', child, JSON.stringify(a)], { cwd: TELLCUT_ROOT, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve() : reject(new HttpError(code === 2 ? 400 : 500, err.trim() || `score preview failed (${code})`))));
  });
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** the earlier previews of the same request for a style that has changed since (another content hash, or one cached before
 *  the hash was in the name): nobody asks for them any more, and the cache only grew */
function dropOlder(dir: string, head: string, tail: string, keep: string) {
  const old = new RegExp(`^${escape(head)}(?:-[0-9a-f]{8})?${escape(tail)}$`);
  let names: string[] = [];
  try { names = readdirSync(dir); } catch { return; }
  for (const f of names) if (old.test(f) && join(dir, f) !== keep) try { rmSync(join(dir, f), { force: true }); } catch { /* being sent (Windows): next time */ }
}

const num = (v: string | null) => (v !== null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : undefined);

export function galleryRoutes(r: Router, o: { plugins: Plugin[]; projectsDir: string; library?: string }) {
  const composing = new Map<string, Promise<void>>();
  r.get('/api/gallery', async (_req, res) => sendJson(res, 200, await galleryIndex(o.plugins, o.library)));
  // where the engine's apiResolver asks for a photo source of the project _gallery, which is no project: registered before the
  // media routes (app.ts), so this answers for it instead of /api/projects/:id/media/image/:source
  const stands = standIds(o.plugins);
  const picture = (name: string) => {
    const file = galleryPicture(name, stands);
    if (!file) throw new HttpError(404, `No gallery picture "${name}"`);
    return join(GOLDEN_DIR, file);
  };
  r.get('/api/projects/_gallery/media/image/:name', (req, res, { name }) => sendFile(req, res, picture(name)));
  // and where a block's picture window asks for a still of one (engine apiResolver's still: a variant's sample showing its `pic`):
  // the whole picture, whatever width is asked (the block covers its window with it); the gallery makes no strips or squares
  r.get('/api/projects/_gallery/media/still', (req, res, _p, url) => {
    if (url.searchParams.has('n') || url.searchParams.has('square')) throw new HttpError(404, 'The gallery has no strips or square stills');
    sendFile(req, res, picture(url.searchParams.get('source') ?? ''));
  });
  r.get('/api/gallery/thumb/:file', (req, res, { file }, url) => {
    const f = join(GOLDEN_DIR, file);
    if (!GOLDEN_FILE.test(file) || !existsSync(f)) throw new HttpError(404, 'Not found');
    // the English or Japanese UI: the picture with its words in that language (npm run thumbs), when the golden one shows Chinese
    const lang = url.searchParams.get('lang'), local = lang === 'en' || lang === 'ja' ? join(GOLDEN_DIR, 'thumbs', lang, file) : '';
    sendFile(req, res, local && existsSync(local) ? local : f);
  });
  // a 12-second preview of a music style; the same request comes from the cache
  r.get('/api/gallery/score/:style', async (req, res, { style }, url) => {
    const id = style.replace(/\.wav$/, ''), seed = num(url.searchParams.get('seed')) ?? 1, bpm = num(url.searchParams.get('bpm')), key = url.searchParams.get('key') || undefined;
    // a shared style, or one of the user's own (spec 2026-10-29-my-library §3.4): composed from the folder it is in
    const shared = o.library ?? SCORE_LIBRARY, mine = stylesDir(libraryRoot(o.projectsDir));
    // own keys only: "constructor" is on every object's prototype and is no style
    const ownKey = <T extends object>(o: T) => (Object.hasOwn(o, id) ? o[id as keyof T] : undefined);
    const builtIn = ownKey(STYLES), own = builtIn ? undefined : ownKey((await loadStyles([shared])).styles) ?? ownKey((await loadStyles([mine])).styles);
    if (!builtIn && !own) throw new HttpError(404, `No music style "${id}"`);
    const library = own && resolve(own.file).startsWith(resolve(mine) + sep) ? mine : shared;
    // a style from a file is named by its content too: one replaced in My blocks (or edited) under the same id is composed afresh
    const version = own ? `-${createHash('sha1').update(readFileSync(own.file)).digest('hex').slice(0, 8)}` : '';
    const head = `score-${library === mine ? 'mine-' : ''}${id}`, tail = `-${seed}-${bpm ?? 'd'}-${(key ?? 'd').replace(/[^\w#]/g, '')}.wav`;
    const dir = join(o.projectsDir, '_gallery'), file = join(dir, `${head}${version}${tail}`);
    // the same preview asked twice at once (a double click) is composed once
    if (!existsSync(file)) {
      let job = composing.get(file);
      if (!job) {
        job = compose({ style: id, library, seed, bpm, key, file }).then(() => { if (version) dropOlder(dir, head, tail, file); }).finally(() => composing.delete(file));
        composing.set(file, job);
      }
      await job;
    }
    sendFile(req, res, file);
  });
}
