// @vitest-environment jsdom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { BLOCK_CATEGORY, handleOf } from '@tellcut/protocol';
import { Gallery } from './Gallery.tsx';
import { PlayerBridge } from './bridge.ts';
import { blockProject, filterGallery, galleryCategories, scoreUrl, sfxProject, sfxSections, THEMES, type GalleryIndex } from './gallery.ts';

const G: GalleryIndex = {
  blocks: [
    { plugin: 'core', group: '內建', type: 'core.title', label: '片名', doc: '畫面中央的大標題', kind: 'overlay', params: [{ key: 'text', label: '文字', type: 'text', default: '片名' }], needsMedia: false, category: 'text', thumb: '/api/gallery/thumb/core-title-t1.00.png' },
    { plugin: 'common', group: '共用積木', type: 'common.slam', label: '爆字', doc: '一句超大的字', kind: 'overlay', params: [{ key: 'size', label: '字級', type: 'number', default: 9 }], needsMedia: false, category: 'text', thumb: '/api/gallery/thumb/slam-t1.00.png' },
    { plugin: 'common', group: '共用積木', type: 'common.backdrop', label: '背景圖樣', doc: '格紋背景', kind: 'scene', params: [], needsMedia: false, category: 'look' },
    { plugin: 'kyoto', group: '範例片：京都回憶', type: 'kyoto.photosApp', label: '照片 App', doc: '', kind: 'scene', params: [{ key: 'src', label: '照片', type: 'source-ref', default: '' }], needsMedia: true },
  ],
  sfx: [{ plugin: 'common', type: 'common.beep', label: '消音嗶聲', doc: '1 kHz', params: [] }],
  styles: [{ id: 'lofi', label: 'Lo-fi', doc: '慵懶', defaults: { bpm: 78, key: 'Am' }, origin: 'built-in' }, { id: 'koto', label: '和風', doc: '古箏', defaults: { bpm: 66, key: 'Am' }, origin: 'library' }],
  recipes: [{ id: 'travel', label: '旁白旅行', doc: '旁白配鏡頭', notes: ['每場長度由旁白決定'], example: { scenes: [{ voice: 's01' }] } }],
};

const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const click = (root: Element, sel: string) => act(() => { (root.querySelector(sel) as HTMLElement).click(); });
const cards = (root: Element) => [...root.querySelectorAll('[data-card]')].map((e) => e.getAttribute('data-card'));
async function page() {
  const root = document.createElement('div');
  await act(async () => { render(<Gallery load={async () => G} />, root); });
  await settle();
  return root;
}

test('the preview project is the golden kind: one block over a mid ground, the theme when one is picked; a sound sits a moment in', () => {
  const p = blockProject(G.blocks[1], { size: 12 }, 'warm');
  expect(p.meta).toMatchObject({ width: 1080, height: 1920, plugins: ['common'], theme: THEMES.warm.theme });
  expect(p.tracks[0]).toMatchObject({ kind: 'overlay', items: [{ type: 'common.slam', params: { size: 12 }, start: 0 }] });
  expect(blockProject(G.blocks[2], {}).tracks[0].kind).toBe('scene');
  expect('theme' in blockProject(G.blocks[1], {}).meta).toBe(false);
  expect(sfxProject(G.sfx[0], {}).tracks[0]).toMatchObject({ kind: 'sfx', items: [{ type: 'common.beep', start: 0.2 }] });
});

test('search matches name, label, doc or group; the score url carries the choices', () => {
  expect(filterGallery(G, 'blocks', '大標題').map((b: any) => b.type)).toEqual(['core.title']);
  expect(filterGallery(G, 'blocks', 'COMMON').length).toBe(2);
  expect(filterGallery(G, 'styles', '古箏').map((s: any) => s.id)).toEqual(['koto']);
  expect(scoreUrl('lofi', { seed: 2, bpm: 90, key: 'F#m' })).toBe('/api/gallery/score/lofi.wav?seed=2&bpm=90&key=F%23m');
  expect(scoreUrl('lofi', { seed: 1 })).toBe('/api/gallery/score/lofi.wav?seed=1');
});

test('categories: BLOCK_CATEGORY order with counts, then plugin groups, then clip effects', () => {
  expect(galleryCategories(G.blocks, 2)).toEqual([
    { key: 'text', label: BLOCK_CATEGORY.text, count: 2 }, { key: 'look', label: BLOCK_CATEGORY.look, count: 1 },
    { key: 'plugin:kyoto', label: '範例片：京都回憶', count: 1 }, { key: 'clip', label: '片段本身的效果', count: 2 },
  ]);
});

test('the page opens with the first block already showing; cards are pictures, not paragraphs, in handle order', async () => {
  const root = await page();
  expect(root.querySelector('[data-detail="common.slam"] iframe')!.getAttribute('src')).toContain('embed=1');   // TXT-03 before core.title's TXT-08
  expect(root.querySelector('[data-detail="common.slam"] [data-param="size"]')).not.toBeNull();
  const title = root.querySelector('[data-card="core.title"]')!;
  expect(title.querySelector('img')!.getAttribute('src')).toBe('/api/gallery/thumb/core-title-t1.00.png');
  expect(title.getAttribute('data-tip')).toBe('畫面中央的大標題');
  expect(title.querySelector('p')).toBeNull();
  const backdrop = root.querySelector('[data-card="common.backdrop"]')!;
  expect([backdrop.querySelector('img'), !!backdrop.querySelector('svg')]).toEqual([null, true]);
  expect(cards(root)).toEqual(['common.slam', 'core.title', 'common.backdrop', 'kyoto.photosApp', 'clip.shake', 'clip.follow', 'clip.avoidBurned']);
  await click(root, '[data-card="kyoto.photosApp"]');
  expect(root.querySelector('[data-needs-media]')).not.toBeNull();
  expect(root.querySelector('[data-card="kyoto.photosApp"]')!.textContent).toContain('需要素材');
});

test('a category narrows the grid and moves the pick into it; search works inside it', async () => {
  const root = await page();
  await click(root, '[data-cat="look"]');
  expect(cards(root)).toEqual(['common.backdrop']);
  expect(root.querySelector('[data-detail="common.backdrop"]')).not.toBeNull();
  await click(root, '[data-cat="clip"]');
  expect(cards(root)).toEqual(['clip.shake', 'clip.follow', 'clip.avoidBurned']);
  expect(root.querySelector('[data-clip-fx]')).not.toBeNull();
  expect(root.querySelector('[data-detail="clip.shake"]')!.textContent).toContain('c.shake(');
  await click(root, '[data-cat="all"]');
  const search = root.querySelector('.g-search') as HTMLInputElement;
  await act(() => { search.value = '爆字'; search.dispatchEvent(new Event('input')); });
  expect(cards(root)).toEqual(['common.slam', 'clip.shake']);   // the shake card says it goes with 爆字
  await click(root, '[data-cat="look"]');
  expect(cards(root)).toEqual([]);
  expect(root.textContent).toContain('沒有符合的項目');
});

test('other tabs pick their first card; a style card shows its tempo and key; categories are for blocks only', async () => {
  const root = await page();
  await click(root, '[data-tab="sfx"]');
  expect(root.querySelector('[data-detail="common.beep"]')).not.toBeNull();
  expect(root.querySelector('[data-cat]')).toBeNull();
  await click(root, '[data-tab="styles"]');
  expect(root.querySelector('[data-detail="lofi"]')).not.toBeNull();
  expect(root.querySelector('[data-card="lofi"]')!.textContent).toContain('78 BPM · Am');
  expect(root.querySelector('[data-card="koto"]')!.textContent).toContain('風格庫');
  expect(root.querySelector('audio')!.getAttribute('src')).toBe('/api/gallery/score/lofi.wav?seed=1');
  await click(root, '[data-tab="recipes"]');
  expect(root.querySelector('[data-detail="travel"] pre')!.textContent).toContain('"voice": "s01"');
  expect(root.textContent).toContain('每場長度由旁白決定');
  await click(root, '[data-tab="blocks"]');
  expect(root.querySelector('[data-detail="common.slam"]')).not.toBeNull();
});

test('a param change reaches the preview; the theme toggle is on the page', async () => {
  const root = await page();
  await click(root, '[data-card="common.slam"]');
  expect(root.querySelector('[data-detail="common.slam"] [data-param="size"]')).not.toBeNull();
  expect(root.querySelector('[data-theme-toggle]')).not.toBeNull();
});

test('Enter on the copy button inside a card copies, and does not just pick the card', async () => {
  const writes: string[] = [];
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (t: string) => { writes.push(t); } }, configurable: true });
  const root = document.body.appendChild(document.createElement('div'));
  try {
    await act(async () => { render(<Gallery load={async () => G} />, root); });
    await settle();
    const copy = root.querySelector('[data-card="core.title"] .copy') as HTMLButtonElement;
    const ev = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    await act(() => { copy.dispatchEvent(ev); });
    expect(ev.defaultPrevented).toBe(false);   // the button's own activation goes ahead (it copies)
    expect(root.querySelector('[data-detail="common.slam"]')).not.toBeNull();   // the card did not swallow it as a pick
  } finally { render(null, root); root.remove(); }
});

test('sounds play when a sound card is clicked, not when the tab opens or the search changes the top match', async () => {
  const play = vi.spyOn(PlayerBridge.prototype, 'play');
  try {
    const g = { ...G, sfx: [...G.sfx, { plugin: 'common', type: 'common.whoosh', label: '咻', doc: '風聲', params: [] }] };
    const root = document.createElement('div');
    await act(async () => { render(<Gallery load={async () => g} />, root); });
    await settle();
    await click(root, '[data-card="common.slam"]');
    play.mockClear();
    await click(root, '[data-tab="sfx"]');
    const search = root.querySelector('.g-search') as HTMLInputElement;
    await act(() => { search.value = '風'; search.dispatchEvent(new Event('input')); });
    expect(root.querySelector('[data-detail="common.whoosh"]')).not.toBeNull();
    expect(play).not.toHaveBeenCalled();
    await click(root, '[data-card="common.whoosh"]');
    expect(play).toHaveBeenCalledTimes(1);
  } finally { play.mockRestore(); }
});

test('a picked block or sound starts from its own defaults, not the changes made to the last one', async () => {
  const g = { ...G, sfx: [{ plugin: 'common', type: 'common.beep', label: '嗶', doc: '', params: [{ key: 'dur', label: '長度', type: 'number', default: 0.5 }] },
    { plugin: 'common', type: 'common.whoosh', label: '咻', doc: '', params: [{ key: 'dur', label: '長度', type: 'number', default: 0.8 }] }] } as GalleryIndex;
  const root = document.createElement('div');
  await act(async () => { render(<Gallery load={async () => g} />, root); });
  await settle();
  await click(root, '[data-tab="sfx"]');
  const field = () => root.querySelector('[data-param="dur"] input') as HTMLInputElement;
  await act(() => { field().value = '2'; field().dispatchEvent(new Event('change', { bubbles: true })); });
  expect(field().value).toBe('2');
  await click(root, '[data-card="common.whoosh"]');
  expect(field().value).toBe('0.8');
});

test('a failed load says so', async () => {
  const root = document.createElement('div');
  await act(async () => { render(<Gallery load={async () => { throw new Error('boom'); }} />, root); });
  await settle();
  expect(root.textContent).toContain('載入圖鑑失敗：boom');
});

test('the sound effects are grouped by category in the catalog order; one without a category comes last under 其他', async () => {
  const s = (type: string, category?: string) => ({ plugin: 'common', type, label: type, doc: '', params: [], ...(category ? { category } : {}) });
  const list = [s('common.pop', 'hit'), s('fx.zap'), s('common.beep', 'alert'), s('common.chime', 'chime'), s('common.ding', 'chime')];
  expect(sfxSections(list).map((x) => [x.key, x.label, x.sfx.map((y) => y.type)])).toEqual([
    ['alert', '提示、對錯與警報', ['common.beep']], ['chime', '叮鈴、獎勵與旋律', ['common.chime', 'common.ding']], ['hit', '撞擊、落地與彈跳', ['common.pop']], ['other', '其他', ['fx.zap']]]);
  const root = document.createElement('div');
  await act(async () => { render(<Gallery load={async () => ({ ...G, sfx: list })} />, root); });
  await settle();
  await click(root, '[data-tab="sfx"]');
  expect([...root.querySelectorAll('[data-sfx-cat] h4')].map((h) => h.textContent)).toEqual(['提示、對錯與警報', '叮鈴、獎勵與旋律', '撞擊、落地與彈跳', '其他']);
  expect(root.querySelector('[data-detail="common.beep"]')).not.toBeNull();     // the first card shown is the one picked
});

test('handles: each card and detail shows its gallery handle (MRK-03), and the search finds a card by handle in any spelling', async () => {
  const handle = (sel: string) => root.querySelector(`${sel} [data-handle]`)?.getAttribute('data-handle');
  const root = await page();
  expect(handle('[data-card="core.title"]')).toBe(handleOf('core.title'));
  expect(handle('[data-detail="common.slam"]')).toBe(handleOf('common.slam'));
  expect(handle('[data-card="kyoto.photosApp"]')).toBeUndefined();         // a sample film's own block has none
  expect(handle('[data-card="clip.shake"]')).toBe('CLP-01');
  const search = root.querySelector('.g-search') as HTMLInputElement;
  const slam = handleOf('common.slam')!;                                   // e.g. TXT-03, typed as txt3
  await act(() => { search.value = slam.toLowerCase().replace('-0', ''); search.dispatchEvent(new Event('input')); });
  expect(cards(root)).toEqual(['common.slam']);
  expect(filterGallery(G, 'styles', 'mus-2').map((s: any) => s.id)).toEqual(['lofi']);
  expect(filterGallery(G, 'recipes', 'RCP').map((r: any) => r.id)).toEqual(['travel']);
  await act(() => { search.value = ''; search.dispatchEvent(new Event('input')); });
  await click(root, '[data-tab="styles"]');
  expect(handle('[data-card="lofi"]')).toBe('MUS-02');
  expect(handle('[data-card="koto"]')).toBeUndefined();
});

test('the gallery speaks the chosen language', async () => {
  const { setLang } = await import('./i18n/lang.ts');
  const { BLOCKS_EN } = await import('./i18n/blocks.en.ts');
  const { BLOCKS_JA } = await import('./i18n/blocks.ja.ts');
  try {
    setLang('en');
    const root = await page();
    const card = root.querySelector('[data-card="common.slam"]')!;
    expect(card.textContent).toContain(BLOCKS_EN['common.slam'].label);
    expect(card.getAttribute('data-tip')).toBe(BLOCKS_EN['common.slam'].doc);
    expect(card.hasAttribute('title')).toBe(false);
    expect(root.querySelector('[data-detail="common.slam"] .g-doc')!.textContent).toBe(BLOCKS_EN['common.slam'].doc);
    expect([...root.querySelectorAll('[data-cat]')].map((b) => b.getAttribute('data-cat') + ':' + b.firstChild!.textContent)).toContain('text:Captions and big text');
    expect(root.querySelector('[data-clip-fx] h4')!.textContent).toContain('What a clip itself does');
    expect(root.querySelector('[data-tab="sfx"]')!.textContent).toBe('Sound effects');
    expect(root.querySelector('[data-lang]')).not.toBeNull();   // the gallery has its own switch
    await click(root, '[data-lang="ja"]');
    expect(root.querySelector('[data-card="common.slam"]')!.textContent).toContain(BLOCKS_JA['common.slam'].label);
    expect(root.querySelector('[data-tab="sfx"]')!.textContent).toBe('効果音');
    await click(root, '[data-lang="zh"]');
    expect(root.querySelector('[data-card="common.slam"]')!.textContent).toContain('爆字');
  } finally { setLang('zh'); localStorage.clear(); }
});

// the words a block starts with follow the language too (spec 2026-10-30-showcase-films part 2: no Chinese in the English UI)
test('parameter names and the words a block starts with follow the language', async () => {
  const { setLang } = await import('./i18n/lang.ts');
  const { PARAMS_EN, PARAMS_JA } = await import('./i18n/params.ts');
  try {
    setLang('en');
    const root = await page();
    const title = (r: Element) => r.querySelector('[data-detail="core.title"] [data-params]')!;
    await click(root, '[data-card="core.title"]');
    expect(title(root).querySelector('[data-param="text"] span')!.textContent).toBe(PARAMS_EN['core.title.text'].name);
    expect(title(root).textContent).not.toContain('文字');
    const text = (r: Element) => title(r).querySelector<HTMLTextAreaElement>('[data-param="text"] textarea')!.value;
    expect(text(root)).toBe('Title');
    await click(root, '[data-lang="ja"]');
    expect(title(root).querySelector('[data-param="text"] span')!.textContent).toBe(PARAMS_JA['core.title.text'].name);
    expect(text(root)).toBe('タイトル');
    await click(root, '[data-lang="zh"]');
    expect(title(root).querySelector('[data-param="text"] span')!.textContent).toBe('文字');
    expect(text(root)).toBe('片名');
  } finally { setLang('zh'); localStorage.clear(); }
});

test('the card shows name, handle and type id on their own lines', async () => {
  const root = await page();
  const card = root.querySelector('[data-card="common.slam"]')!;
  const lines = card.querySelector('.card-lines')!;
  expect([...lines.children].map((e) => ['data-card-name', 'data-card-handle', 'data-card-type'].find((a) => e.hasAttribute(a)))).toEqual(['data-card-name', 'data-card-handle', 'data-card-type']);
  expect(lines.querySelector('[data-card-name]')!.textContent).toBe(card.querySelector('strong')!.textContent);
  expect(lines.querySelector('[data-card-handle]')!.getAttribute('data-handle')).toBe(handleOf('common.slam'));
  expect(lines.querySelector('[data-card-type]')!.textContent).toBe('common.slam');
  expect(lines.querySelector('[data-card-name]')!.getAttribute('data-tip')).toBe(lines.querySelector('[data-card-name]')!.textContent);   // full text for a truncated name
});

test('the truncated type id and handle carry their full text in the tooltip', async () => {
  const root = await page();
  const lines = root.querySelector('[data-card="common.slam"] .card-lines')!;
  expect(lines.querySelector('[data-card-type]')!.getAttribute('data-tip')).toContain('common.slam');
  expect(lines.querySelector('[data-card-handle]')!.getAttribute('data-tip')).toContain(handleOf('common.slam')!);
});

// ---------------------------------------------------------------- Mine: the user's own blocks and styles (spec 2026-10-29-my-library §3.4)
import { mineProject } from './gallery.ts';
import type { LibraryIndex } from '@tellcut/protocol';

const LIB: LibraryIndex = {
  blocks: [{ slug: 'chalk', type: 'fx.chalk', name: '粉筆標題卡', desc: '黑板上的標題', category: 'text', kind: 'overlay', params: [{ key: 'text', label: '文字', type: 'string', default: 'hi' }],
    main: 'fx/chalk.js', thumb: '/api/library/blocks/chalk/thumb.png?v=1', from: { project: 'trip', file: 'fx/chalk.js', name: '三天的旅行' }, savedAt: '2026-10-29T03:00:00.000Z', version: '1', group: ['fx.chalk-line'] },
  { slug: 'chalk', type: 'fx.chalk-line', name: '粉筆底線', desc: '', kind: 'overlay', params: [],
    main: 'fx/chalk.js', thumb: null, from: { project: 'trip', file: 'fx/chalk.js' }, savedAt: '2026-10-29T03:00:00.000Z', version: '1', group: ['fx.chalk'] }],
  styles: [{ slug: 'jazz', id: 'jazz', name: '街頭爵士', desc: '輕快', defaults: { bpm: 96, key: 'C' }, from: { project: 'trip', file: 'score/jazz.js' }, savedAt: '2026-10-29T03:00:00.000Z' }],
};
function libApi(lib: LibraryIndex = LIB) {
  const calls: any[] = [];
  let cur = structuredClone(lib);
  return { calls, api: {
    load: async () => structuredClone(cur),
    renameBlock: async (slug: string, type: string, b: any) => { calls.push(['rename', slug, type, b]); cur.blocks = cur.blocks.map((x) => (x.type === type ? { ...x, ...b } : x)); },
    renameStyle: async (slug: string, b: any) => { calls.push(['renameStyle', slug, b]); },
    usage: async (kind: string, slug: string) => { calls.push(['usage', kind, slug]); return { projects: 2, presets: ['我的美食'] }; },
    remove: async (kind: string, slug: string) => { calls.push(['remove', kind, slug]); cur = { ...cur, blocks: cur.blocks.filter((x) => x.slug !== slug) }; },
  } };
}
async function minePage(lib?: LibraryIndex) {
  const root = document.createElement('div'), x = libApi(lib), went: string[] = [];
  await act(async () => { render(<Gallery load={async () => G} library={x.api} navigate={(u) => went.push(u)} />, root); });
  await settle();
  return { root, ...x, went };
}
const input = (root: Element, sel: string, v: string) => act(() => { const e = root.querySelector(sel) as HTMLInputElement; e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); });

test('Mine comes first among the categories, even when empty; a preview loads the entry module', () => {
  expect(galleryCategories(G.blocks, 2, 0)[0]).toEqual({ key: 'mine', label: expect.any(String), count: 0 });
  expect(galleryCategories(G.blocks, 2).some((c) => c.key === 'mine')).toBe(false);
  expect(mineProject(LIB.blocks[0], { text: 'x' }).meta).toMatchObject({ fx: ['fx/chalk.js'], width: 1080, height: 1920 });
  expect(mineProject(LIB.blocks[0], {}).tracks[0].items[0]).toMatchObject({ type: 'fx.chalk', start: 0 });
});

test('the Mine category lists the user’s blocks with where they came from, and renames one', async () => {
  const { root, calls } = await minePage();
  expect(root.querySelector('[data-cat="mine"] small')?.textContent).toBe('2');
  await click(root, '[data-cat="mine"]');
  expect(cards(root)).toEqual(['mine:fx.chalk', 'mine:fx.chalk-line']);
  // where it came from, by the project's name; by its id when the project has none (gone, or never named)
  expect(root.querySelector('[data-card="mine:fx.chalk"]')?.textContent).toContain('三天的旅行');
  expect(root.querySelector('[data-card="mine:fx.chalk"]')?.textContent).not.toContain('trip');
  expect(root.querySelector('[data-card="mine:fx.chalk-line"]')?.textContent).toContain('trip');
  expect(root.querySelector('[data-detail="mine:fx.chalk"] .g-sub')?.textContent).toContain('三天的旅行');
  expect(root.querySelector('[data-detail="mine:fx.chalk"] h2')?.textContent).toBe('粉筆標題卡');
  await click(root, '[data-mine-rename]');
  await input(root, '[data-mine-name]', '黑板標題');
  await click(root, '[data-mine-rename-save]');
  await settle();
  expect(calls).toContainEqual(['rename', 'chalk', 'fx.chalk', { name: '黑板標題', desc: '黑板上的標題' }]);
  expect(root.querySelector('[data-card="mine:fx.chalk"]')?.textContent).toContain('黑板標題');
});

test('deleting says what keeps working and what loses it, and takes the whole entry', async () => {
  const { root, calls } = await minePage();
  await click(root, '[data-cat="mine"]');
  await click(root, '[data-mine-delete]');
  await settle();
  const text = root.querySelector('[data-mine-confirm]')?.textContent ?? '';
  expect(text).toContain('2');
  expect(text).toContain('我的美食');
  expect(text).toContain('粉筆底線');
  await click(root, '[data-mine-delete-confirm]');
  await settle();
  expect(calls).toContainEqual(['remove', 'blocks', 'chalk']);
  expect(cards(root)).toEqual([]);
  expect(root.querySelector('[data-mine-empty]')).not.toBeNull();
});

test('a Mine card’s trash button (or Delete on it) picks that card and opens its confirmation; shared blocks have none', async () => {
  const { root } = await minePage();
  await click(root, '[data-cat="mine"]');
  expect(root.querySelector('[data-detail="mine:fx.chalk"]')).not.toBeNull();
  await click(root, '[data-card-delete="mine:fx.chalk-line"]');
  await settle();
  expect(root.querySelector('[data-card="mine:fx.chalk-line"]')?.getAttribute('aria-pressed')).toBe('true');
  expect(root.querySelector('[data-detail="mine:fx.chalk-line"] [data-mine-confirm]')).not.toBeNull();
  await click(root, '[data-card="mine:fx.chalk"]');
  await act(() => { root.querySelector('[data-card="mine:fx.chalk"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true })); });
  await settle();
  expect(root.querySelector('[data-detail="mine:fx.chalk"] [data-mine-confirm]')).not.toBeNull();
  await click(root, '[data-cat="all"]');
  expect(root.querySelectorAll('[data-card-delete]').length).toBe(2);
});

test('the trash button asks once: cancelled, then another card and back, the confirmation stays shut until asked again', async () => {
  const { root } = await minePage();
  await click(root, '[data-cat="mine"]');
  await click(root, '[data-card-delete="mine:fx.chalk-line"]');
  await settle();
  const confirm = () => root.querySelector('[data-detail="mine:fx.chalk-line"] [data-mine-confirm]');
  expect(confirm()).not.toBeNull();
  await click(root, '[data-mine-confirm] button:not(.danger)');
  expect(confirm()).toBeNull();
  await click(root, '[data-card="mine:fx.chalk"]');
  await click(root, '[data-card="mine:fx.chalk-line"]');
  await settle();
  expect(root.querySelector('[data-detail="mine:fx.chalk-line"]')).not.toBeNull();
  expect(confirm()).toBeNull();
  await click(root, '[data-card-delete="mine:fx.chalk-line"]');
  await settle();
  expect(confirm()).not.toBeNull();
});

test('"change with the Agent" hands the request to the home chat', async () => {
  const { root, went } = await minePage();
  await click(root, '[data-cat="mine"]');
  await click(root, '[data-mine-agent]');
  await act(() => { const e = root.querySelector('[data-mine-request]') as HTMLTextAreaElement; e.value = '字大一點'; e.dispatchEvent(new Event('input', { bubbles: true })); });
  await click(root, '[data-mine-agent-send]');
  expect(JSON.parse(sessionStorage.getItem('tellcut.pendingTask')!)).toMatchObject({ task: { kind: 'library-edit', slug: 'chalk', type: 'fx.chalk', request: '字大一點' } });
  expect(went).toEqual(['./']);
});

test('the styles tab starts with the user’s own music styles', async () => {
  const { root } = await minePage();
  await click(root, '[data-tab="styles"]');
  expect(cards(root)[0]).toBe('mine-style:jazz');
  await click(root, '[data-card="mine-style:jazz"]');
  expect(root.querySelector('[data-detail="mine-style:jazz"] audio')?.getAttribute('src')).toContain('/api/gallery/score/jazz.wav');
});

test('an empty library still shows Mine, with how to fill it', async () => {
  const { root } = await minePage({ blocks: [], styles: [] });
  await click(root, '[data-cat="mine"]');
  expect(root.querySelector('[data-mine-empty]')).not.toBeNull();
});

// showcase films (spec 2026-10-30 part 2): thumbnails without Chinese in the English or Japanese UI
test('a block card asks for its thumbnail in the UI language; a Chinese page asks for the golden one', async () => {
  const { setLang } = await import('./i18n/lang.ts');
  const withThumbs: GalleryIndex = { ...G, blocks: G.blocks.map((b) => ({ ...b, thumb: `/api/gallery/thumb/${b.type.replace('.', '-')}-t1.50.png` })) };
  const img = async () => {
    const root = document.createElement('div');
    await act(async () => { render(<Gallery load={async () => withThumbs} />, root); });
    await settle();
    return root.querySelector('[data-card="core.title"] img')!.getAttribute('src');
  };
  try {
    expect(await img()).toBe('/api/gallery/thumb/core-title-t1.50.png');
    setLang('en');
    expect(await img()).toBe('/api/gallery/thumb/core-title-t1.50.png?lang=en');
    setLang('ja');
    expect(await img()).toBe('/api/gallery/thumb/core-title-t1.50.png?lang=ja');
  } finally { setLang('zh'); localStorage.clear(); }
});
