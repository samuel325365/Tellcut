// @vitest-environment jsdom
// The properties panel's template grid: my templates marked when in use and deleted by keyboard too, the built-in ones' pictures
// from the gallery (a name when there is none), its hints in the UI language, a title's never worded as a caption's.
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { fixture } from '@tellcut/engine/test-fixture';
import { CaptionTemplates } from './CaptionTemplates.tsx';
import { myTemplateKey } from './editor/captions.ts';
import { DICTS } from './i18n/index.ts';
import { setLang } from './i18n/lang.ts';

const PINK = { slug: 'pink', name: 'Pink', desc: '', params: { style: 'neon' }, savedAt: '' };

function mount(o: { template?: string; kind?: 'caption' | 'title'; thumbs?: Record<string, string>; film?: string } = {}) {
  const calls: any[] = [];
  const editor: any = {
    myCaptionTemplates: () => [PINK],
    templateThumb: (id: string) => o.thumbs?.[id],
    loadTemplateThumbs: async () => { calls.push(['thumbs']); },
    captionTemplateOnItem: (...a: any[]) => { calls.push(['on', ...a]); return true; },
    myCaptionTemplateOnItem: (id: string, m: any) => { calls.push(['mine', id, m.slug]); return true; },
    deleteMyCaptionTemplate: async (slug: string) => { calls.push(['delete', slug]); return true; },
    saveMyCaptionTemplate: async () => true, captionTemplateOnTrack: () => true, projectCaptionTemplate: () => true,
  };
  const item = { id: 'k', type: o.kind === 'title' ? 'common.heading' : 'common.caption', params: { text: 'hi', ...(o.template ? { template: o.template } : {}) } };
  const root = document.createElement('div');
  document.body.appendChild(root);
  const project: any = fixture();
  if (o.film) project.meta.captionTemplate = o.film;
  return { root, calls, show: () => act(() => render(<CaptionTemplates editor={editor} project={project} item={item} track="text" defs={[]} kind={o.kind} />, root)) };
}
const key = (el: Element, k: string) => el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

afterEach(() => { setLang('zh'); vi.unstubAllGlobals(); document.body.innerHTML = ''; });

test('one of my templates is marked while the caption draws with its copy; Enter applies it, Delete (or its ✕) asks and deletes it', async () => {
  const { root, calls, show } = mount({ template: myTemplateKey(PINK) });
  await show();
  const tile = root.querySelector('[data-caption-mine="pink"]')!;
  expect(tile.classList.contains('on')).toBe(true);
  expect(calls).toContainEqual(['thumbs']);
  key(tile, 'Enter');
  expect(calls.at(-1)).toEqual(['mine', 'k', 'pink']);
  vi.stubGlobal('confirm', () => true);
  await act(async () => { key(tile, 'Delete'); });
  expect(calls.at(-1)).toEqual(['delete', 'pink']);
  // the ✕ is not inside the tile: Enter on it presses it, never the tile
  const del = root.querySelector<HTMLButtonElement>('[data-caption-mine-delete="pink"]')!;
  expect(tile.contains(del)).toBe(false);
  calls.length = 0;
  key(del, 'Enter');
  expect(calls).toEqual([]);
  await act(async () => { del.click(); });
  expect(calls).toEqual([['delete', 'pink']]);
});

test('a built-in template shows the gallery’s picture in the UI language, its name when there is none or it fails to load', async () => {
  setLang('en');
  const { root, show } = mount({ thumbs: { clean: '/api/gallery/thumb/tpl-clean-t1.50.png' } });
  await show();
  const img = root.querySelector<HTMLImageElement>('[data-caption-template="clean"] img')!;
  expect(img.getAttribute('src')).toBe('/api/gallery/thumb/tpl-clean-t1.50.png?lang=en');
  await act(async () => { img.dispatchEvent(new Event('error')); });
  expect(root.querySelector('[data-caption-template="clean"] img')).toBeNull();
  expect(root.querySelector('[data-caption-template="clean"] .cap-none')).not.toBeNull();
  expect(root.querySelector('[data-caption-template="neon-fill"] img')).toBeNull();   // the gallery gave none
});

test('the hints follow the UI language; a title’s are worded for titles', async () => {
  setLang('ja');
  const cap = mount();
  await cap.show();
  expect(cap.root.querySelector('.cap-search')!.getAttribute('placeholder')).toBe(DICTS.ja['ed.capSearch']);
  expect(cap.root.querySelector('.cap-search')!.getAttribute('aria-label')).toBe(DICTS.ja['ed.capSearch']);
  expect(cap.root.querySelector('[data-caption-save-name]')!.getAttribute('placeholder')).toBe(DICTS.ja['ed.templateName']);
  const ttl = mount({ kind: 'title' });
  await ttl.show();
  expect(ttl.root.querySelector('.cap-search')!.getAttribute('placeholder')).toBe(DICTS.ja['ed.ttlSearch']);
  expect(ttl.root.querySelector('[data-caption-track]')!.getAttribute('data-tip')).toBe(DICTS.ja['ed.ttlTrackTip']);
  expect(ttl.root.querySelector('[data-caption-save]')!.getAttribute('data-tip')).toBe(DICTS.ja['ed.ttlSaveTip']);
  expect(ttl.root.querySelector('[data-caption-mine-delete]')!.getAttribute('data-tip')).toBe(DICTS.ja['ed.ttlDeleteTip']);
});

test('a film default set from one of my templates is shown by its name, not its copy key (EP11)', async () => {
  const { root, show } = mount({ film: myTemplateKey(PINK) });
  await show();
  const head = root.querySelector('[data-group="captionTemplates"] > span')!.textContent!;
  expect(head).toContain('film: Pink');
  expect(head).not.toContain('my-pink-');
  expect(root.querySelector('[data-caption-template=""] .cap-name')!.textContent).toBe("Film's (Pink)");
  // the template deleted from the library since: its slug, still not the hash
  const gone = mount({ film: 'my-old-look-1a2b3c' });
  await gone.show();
  expect(gone.root.querySelector('[data-caption-template=""] .cap-name')!.textContent).toBe("Film's (old-look)");
});
