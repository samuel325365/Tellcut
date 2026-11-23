// @vitest-environment jsdom
// The look picker: closed it is one row, open a grid of tiles with the one in use marked; a pick or Esc closes it; the tile
// pointed at shows larger with its sentence; a value no tile names shows as it is; a tile without a picture keeps its name.
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { LookPicker, type LookTile } from './LookPicker.tsx';
import { setLang } from './i18n/lang.ts';

const TILES: LookTile[] = [
  { key: 'bar', label: '長條', doc: '一條橫的進度條' },
  { key: 'rocket', label: '火箭', doc: '火箭沿著軌道飛', thumb: '/t/rocket.png' },
  { key: 'ring', label: '圓環', doc: '一圈圓環慢慢補滿', thumb: '/t/ring.png' },
];

function mount(o: { current?: string; placeholder?: string; fallback?: string } = {}) {
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
