import { defaultSafe, paramDefault, resolveTheme, themeValue, DEFAULT_THEME } from './theme.ts';
import { withDefaults } from './registry.ts';
import { parseProject } from './schema.ts';
import type { ParamDef } from './plugin.ts';

test('a partial theme is filled from the defaults, field by field', () => {
  const t = resolveTheme({ palette: { accent: '#00f' }, safe: { bottom: 0.3 }, radius: 4 });
  expect(t.palette).toEqual({ ...DEFAULT_THEME.palette, accent: '#00f' });
  expect(t.safe).toEqual({ ...DEFAULT_THEME.safe, bottom: 0.3 });
  expect([t.radius, t.stroke, t.fonts]).toEqual([4, DEFAULT_THEME.stroke, DEFAULT_THEME.fonts]);
  expect(resolveTheme()).toEqual({ ...DEFAULT_THEME, own: {} });
  expect(t.own).toEqual({ palette: { accent: '#00f' }, safe: { bottom: 0.3 }, radius: 4 });   // what the project itself set
});

test('themeValue follows a dotted path and gives undefined for a path that does not exist', () => {
  const t = resolveTheme({ palette: { ink: '#123' } });
  expect(themeValue(t, 'palette.ink')).toBe('#123');
  expect(themeValue(t, 'safe.bottom')).toBe(0.22);
  expect(themeValue(t, 'palette.nope')).toBeUndefined();
  expect(themeValue(t, 'nope.deeper')).toBeUndefined();
});

test('item params > theme > the block default', () => {
  const defs: ParamDef[] = [
    { key: 'color', label: 'c', type: 'color', default: '#000', theme: 'palette.accent' },
    { key: 'plain', label: 'p', type: 'color', default: '#111' },
    { key: 'bad', label: 'b', type: 'color', default: '#222', theme: 'palette.nope' },
  ];
  const theme = resolveTheme({ palette: { accent: '#f0f' } });
  expect(paramDefault(defs[0], theme)).toBe('#f0f');
  expect(withDefaults(defs, {}, theme)).toEqual({ color: '#f0f', plain: '#111', bad: '#222' });
  expect(withDefaults(defs, { color: '#abc' }, theme).color).toBe('#abc');
  expect(withDefaults(defs, {}).color).toBe('#000');          // no theme given: the block default, as before
});

test('themeIfSet: the theme field only when the project sets it, else the block default (not the theme default)', () => {
  const mono: ParamDef = { key: 'mono', label: 'm', type: 'string', default: 'JetBrains Mono', theme: 'fonts.mono', themeIfSet: true };
  expect(DEFAULT_THEME.fonts.mono).not.toBe('JetBrains Mono');
  expect(paramDefault(mono, resolveTheme())).toBe('JetBrains Mono');
  expect(paramDefault(mono, resolveTheme({ fonts: { display: 'X' } }))).toBe('JetBrains Mono');
  expect(paramDefault(mono, resolveTheme({ fonts: { mono: 'Consolas' } }))).toBe('Consolas');
  expect(paramDefault(mono, { ...DEFAULT_THEME })).toBe('JetBrains Mono');          // a theme made by hand, without own
  expect(withDefaults([mono], { mono: 'Fira Code' }, resolveTheme({ fonts: { mono: 'Consolas' } })).mono).toBe('Fira Code');
  expect(paramDefault({ ...mono, themeIfSet: undefined }, resolveTheme())).toBe(DEFAULT_THEME.fonts.mono);   // plain theme: the default too
});

test('project.meta.theme is optional and validated', () => {
  const base = { version: 1, meta: { name: 't', width: 10, height: 10, fps: 30, duration: 1, plugins: [], mix: { master: 1, compressor: { threshold: -10, ratio: 2, attack: 0.01, release: 0.1 }, reverb: { seconds: 1, send: 0 } } }, sources: {}, media: {}, grids: [], tracks: [] };
  expect(parseProject(base).meta.theme).toBeUndefined();
  expect(parseProject({ ...base, meta: { ...base.meta, theme: { palette: { accent: '#fff' } } } }).meta.theme?.palette?.accent).toBe('#fff');
  expect(() => parseProject({ ...base, meta: { ...base.meta, theme: { safe: { bottom: 2 } } } })).toThrow();
});

test('the safe area follows the frame shape: platform buttons on 9:16, almost nothing on 1:1 and 4:5, title-safe and the player bar on 16:9', () => {
  expect(defaultSafe(1080, 1920)).toEqual({ top: 0.115, bottom: 0.22, side: 0.12 });
  expect(defaultSafe(1080, 1080)).toEqual({ top: 0.06, bottom: 0.08, side: 0.06 });
  expect(defaultSafe(1080, 1350)).toEqual({ top: 0.06, bottom: 0.08, side: 0.06 });
  expect(defaultSafe(1920, 1080)).toEqual({ top: 0.06, bottom: 0.12, side: 0.05 });
  expect(DEFAULT_THEME.safe).toEqual(defaultSafe(1080, 1920));
  // the project's own safe fields still win, field by field
  expect(resolveTheme({ safe: { bottom: 0.3 } }, { width: 1920, height: 1080 }).safe).toEqual({ top: 0.06, bottom: 0.3, side: 0.05 });
  expect(resolveTheme(undefined, { width: 1920, height: 1080 }).radius).toBe(DEFAULT_THEME.radius);
});
