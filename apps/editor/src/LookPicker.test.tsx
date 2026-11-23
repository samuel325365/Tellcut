// @vitest-environment jsdom
// The look picker: closed it is one row, open a grid of tiles with the one in use marked; a pick or Esc closes it; the tile
// pointed at shows larger with its sentence; a value no tile names shows as it is; a tile without a picture keeps its name.
// Many tiles get a search box on top of the grid.
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { LOOK_SEARCH_MIN, LookPicker, type LookTile } from './LookPicker.tsx';
import { setLang } from './i18n/lang.ts';

const TILES: LookTile[] = [
  { key: 'bar', label: '長條', doc: '一條橫的進度條' },
  { key: 'rocket', label: '火箭', doc: '火箭沿著軌道飛', thumb: '/t/rocket.png' },
  { key: 'ring', label: '圓環', doc: '一圈圓環慢慢補滿', thumb: '/t/ring.png' },
];

function mount(o: { current?: string; placeholder?: string; fallback?: string; tiles?: LookTile[] } = {}) {
  const picks: string[] = [];
  const root = document.createElement('div');
  document.body.appendChild(root);
  const show = () => act(() => render(<LookPicker name="mode" label="Mode" hint="the look" tiles={TILES} onPick={(k) => picks.push(k)} {...o} />, root));
  const row = () => root.querySelector<HTMLButtonElement>('[data-look-picker="mode"]')!;
  const tile = (k: string) => root.querySelector<HTMLElement>(`[data-look-tile="${k}"]`)!;
  const open = () => act(() => row().click());
  return { root, picks, show, row, tile, open };
}
const key = (el: Element, k: string) => act(() => { el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })); });

afterEach(() => { setLang('zh'); localStorage.clear(); document.body.innerHTML = ''; });

test('closed it has no tiles; its row opens the grid', async () => {
  const m = mount({ current: 'bar' });
  await m.show();
  expect(m.root.querySelector('[data-look-tile]')).toBeNull();
  expect(m.row().getAttribute('aria-expanded')).toBe('false');
  expect(m.root.querySelector('[data-field="mode"] span')!.textContent).toBe('Mode');
  await m.open();
  expect(m.root.querySelectorAll('[data-look-grid] [data-look-tile]')).toHaveLength(3);
  expect(m.row().getAttribute('aria-expanded')).toBe('true');
});

test('the current look: its name and picture on the row, its tile marked', async () => {
  const m = mount({ current: 'rocket' });
  await m.show();
  expect(m.row().textContent).toContain('火箭');
  expect(m.row().querySelector('img')!.getAttribute('src')).toBe('/t/rocket.png');
  await m.open();
  expect(m.tile('rocket').getAttribute('aria-pressed')).toBe('true');
  expect(m.tile('rocket').classList.contains('on')).toBe(true);
  expect(m.tile('ring').classList.contains('on')).toBe(false);
  // nothing pointed at: the one in use shows larger
  expect(m.root.querySelector<HTMLElement>('[data-look-shown]')!.dataset.lookShown).toBe('rocket');
});

test('a click on another tile picks it and closes the grid', async () => {
  const m = mount({ current: 'rocket' });
  await m.show();
  await m.open();
  await act(() => m.tile('ring').click());
  expect(m.picks).toEqual(['ring']);
  expect(m.root.querySelector('[data-look-grid]')).toBeNull();
  expect(m.row().getAttribute('aria-expanded')).toBe('false');
});

test('Enter on a tile picks it too; Esc closes without a pick and gives the row the focus back', async () => {
  const m = mount({ current: 'bar' });
  await m.show();
  await m.open();
  await key(m.tile('ring'), 'Enter');
  expect(m.picks).toEqual(['ring']);
  await m.open();
  m.tile('bar').focus();
  await key(m.tile('bar'), 'Escape');
  expect(m.root.querySelector('[data-look-grid]')).toBeNull();
  expect(m.picks).toEqual(['ring']);
  expect(document.activeElement).toBe(m.row());
});

test('nothing current (a template): the placeholder, no tile marked, the larger picture only once a tile is pointed at', async () => {
  const m = mount({ placeholder: '套用範本…' });
  await m.show();
  expect(m.row().textContent).toContain('套用範本…');
  expect(m.row().querySelector('img')).toBeNull();
  await m.open();
  expect(m.root.querySelector('[data-look-tile].on')).toBeNull();
  expect(m.root.querySelector('[data-look-shown]')).toBeNull();
  await act(() => { m.tile('ring').dispatchEvent(new MouseEvent('mouseenter')); });
  const shown = m.root.querySelector<HTMLElement>('[data-look-shown]')!;
  expect(shown.dataset.lookShown).toBe('ring');
  expect(shown.textContent).toContain('一圈圓環慢慢補滿');
  expect(shown.querySelector('img')!.getAttribute('src')).toBe('/t/ring.png');
});

test('a value no tile names (an old project’s) shows as the fallback', async () => {
  const m = mount({ current: 'old', fallback: 'old' });
  await m.show();
  expect(m.row().querySelector('.look-row-name')!.textContent).toBe('old');
  await m.open();
  expect(m.root.querySelector('[data-look-tile].on')).toBeNull();
});

test('a picture that fails leaves the name; a tile without one shows its first letter; the English UI asks for the English picture', async () => {
  setLang('en');
  const m = mount({ current: 'bar' });
  await m.show();
  await m.open();
  const img = m.tile('rocket').querySelector('img')!;
  expect(img.getAttribute('src')).toBe('/t/rocket.png?lang=en');
  await act(() => { img.dispatchEvent(new Event('error')); });
  expect(m.tile('rocket').querySelector('img')).toBeNull();
  expect(m.tile('rocket').textContent).toContain('火箭');
  expect(m.tile('bar').querySelector('img')).toBeNull();
  expect(m.tile('bar').querySelector('.look-none')!.textContent).toBe('長');
});

// many looks: a search box on top of the open grid
const MANY: LookTile[] = [
  { key: 'bar', label: '長條', doc: '一條橫的進度條', words: 'Bar A bar that fills during the film' },
  { key: 'rocket', label: '火箭', doc: '火箭沿著軌道飛', words: 'Rocket A rocket flies along a track ロケット' },
  { key: 'ring', label: '圓環', doc: '一圈圓環慢慢補滿', words: 'Ring A ring fills up' },
  { key: 'dots', label: '圓點', doc: '一排圓點' },
  { key: 'clock', label: '時鐘', doc: '指針轉一圈' },
  { key: 'vine', label: '藤蔓', doc: '一根藤蔓長出葉子' },
  { key: 'stamps', label: '印章', doc: '一個個蓋上的章' },
  { key: 'battery', label: '電池', doc: '電池一格格充滿' },
  { key: 'ladder', label: '梯子', doc: '一階階往上爬' },
];
const search = (root: Element) => root.querySelector<HTMLInputElement>('[data-look-search]');
const typeIn = (el: HTMLInputElement, v: string) => act(() => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); });
const shownKeys = (root: Element) => [...root.querySelectorAll<HTMLElement>('[data-look-tile]')].map((x) => x.dataset.lookTile);

test('more than LOOK_SEARCH_MIN tiles: a search box on top of the grid, focused as it opens; that many or fewer: none', async () => {
  expect(MANY.length).toBeGreaterThan(LOOK_SEARCH_MIN);
  const few = mount({ current: 'bar', tiles: MANY.slice(0, LOOK_SEARCH_MIN) });
  await few.show();
  await few.open();
  expect(few.root.querySelectorAll('[data-look-tile]')).toHaveLength(LOOK_SEARCH_MIN);
  expect(search(few.root)).toBeNull();
  document.body.innerHTML = '';
  const m = mount({ current: 'bar', tiles: MANY });
  await m.show();
  expect(search(m.root)).toBeNull();   // closed: no box
  await m.open();
  const box = search(m.root)!;
  expect(box).not.toBeNull();
  expect(document.activeElement).toBe(box);
  expect(box.compareDocumentPosition(m.root.querySelector('[data-look-grid]')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(box.getAttribute('placeholder')).toBe('搜尋樣式…');
});

test('typing filters the tiles by name, key and words; a Latin query only at a word’s start; no match is one line', async () => {
  const m = mount({ current: 'bar', tiles: MANY });
  await m.show();
  await m.open();
  const box = search(m.root)!;
  await typeIn(box, '火箭');
  expect(shownKeys(m.root)).toEqual(['rocket']);
  await typeIn(box, 'vine');
  expect(shownKeys(m.root)).toEqual(['vine']);
  await typeIn(box, 'ロケット');
  expect(shownKeys(m.root)).toEqual(['rocket']);
  await typeIn(box, 'ROCKET');
  expect(shownKeys(m.root)).toEqual(['rocket']);
  // "during" in bar's words does not count for ring
  await typeIn(box, 'ring');
  expect(shownKeys(m.root)).toEqual(['ring']);
  expect(m.root.querySelector('[data-look-empty]')).toBeNull();
  await typeIn(box, 'ock');
  expect(shownKeys(m.root)).toEqual([]);
  expect(m.root.querySelector('[data-look-empty]')!.textContent).toBe('沒有符合的樣式');
  await typeIn(box, '');
  expect(shownKeys(m.root)).toHaveLength(MANY.length);
  expect(m.root.querySelector('[data-look-empty]')).toBeNull();
});

test('Esc in the box empties it first and keeps the grid open, then closes it and gives the row the focus back', async () => {
  const m = mount({ current: 'bar', tiles: MANY });
  await m.show();
  await m.open();
  const box = search(m.root)!;
  await typeIn(box, '火箭');
  await key(box, 'Escape');
  expect(search(m.root)!.value).toBe('');
  expect(m.root.querySelector('[data-look-grid]')).not.toBeNull();
  expect(shownKeys(m.root)).toHaveLength(MANY.length);
  await key(search(m.root)!, 'Escape');
  expect(m.root.querySelector('[data-look-grid]')).toBeNull();
  expect(document.activeElement).toBe(m.row());
  expect(m.picks).toEqual([]);
});

test('Enter in the box picks the one tile left, and nothing while several are', async () => {
  const m = mount({ current: 'bar', tiles: MANY });
  await m.show();
  await m.open();
  await typeIn(search(m.root)!, '圓');   // 圓環, 圓點
  await key(search(m.root)!, 'Enter');
  expect(m.picks).toEqual([]);
  expect(m.root.querySelector('[data-look-grid]')).not.toBeNull();
  await typeIn(search(m.root)!, '電池');
  await key(search(m.root)!, 'Enter');
  expect(m.picks).toEqual(['battery']);
  expect(m.root.querySelector('[data-look-grid]')).toBeNull();
});

test('ArrowDown in the box moves to the first tile shown; closing empties the box', async () => {
  const m = mount({ current: 'bar', tiles: MANY });
  await m.show();
  await m.open();
  await typeIn(search(m.root)!, '圓');
  await key(search(m.root)!, 'ArrowDown');
  expect(document.activeElement).toBe(m.tile('ring'));
  await act(() => m.row().click());   // close
  expect(m.root.querySelector('[data-look-grid]')).toBeNull();
  await m.open();
  expect(search(m.root)!.value).toBe('');
  expect(shownKeys(m.root)).toHaveLength(MANY.length);
});
