import { OLD_BLOCKS, type Plugin } from '@tellcut/engine';
import { readFileSync } from 'node:fs';
import { BLOCK_CATEGORY, handleOf, SEARCH_ALIASES } from '@tellcut/protocol';
import { findBlocks, findCombos, formatCatalog, formatFind, formatIndex, formatLookup, formatType } from './catalog.ts';
import { GUIDE_FILE, withIndex } from './blocks-index.ts';
import { plugins } from '@tellcut/plugins';
import { BLOCKS_EN } from '@tellcut/editor/i18n/blocks.en';

const fake: Plugin[] = [
  { id: 'core', items: [
    { type: 'core.banner', label: '片名', kind: 'overlay', doc: '大標題，可加副標', build: () => null, draw: () => {},
      params: [{ key: 'size', label: '字級', type: 'number', min: 1, max: 30, step: 0.5, default: 8 }, { key: 'animIn', label: '進場', type: 'enum', options: ['fade', 'rise'], default: 'rise' }] },
  ] },
  { id: 'wedding', items: [
    { type: 'wedding.petals', label: '花瓣', kind: 'overlay', build: () => null, draw: () => {}, params: [{ key: 'color', label: '顏色', type: 'color', default: '#fff' }] },
  ], sfx: [{ type: 'wedding.chime', label: '鈴聲', params: [], duration: () => 1, synth: () => {} }], grades: { warm: 'sepia(0.2)', soft: 'blur(0)' } },
];

test('the catalog: one line per block, grouped by plugin with core first; doc when there is one, else the label', () => {
  const s = formatCatalog(fake);
  const lines = s.split('\n');
  expect(lines[0]).toContain('core');
  expect(s).toMatch(/core\.banner +片名 — 大標題，可加副標/);
  expect(s).toMatch(/wedding\.petals +花瓣/);
  expect(s).toMatch(/音效[\s\S]*wedding\.chime +鈴聲/);
  expect(s).toMatch(/調色[\s\S]*wedding：warm、soft/);
  expect(lines.at(-1)).toContain('catalog <類型或代號>');
});

test('one block: each param with its type, default and range or options', () => {
  const s = formatType(fake, 'core.banner');
  expect(s).toContain('core.banner 片名 — 大標題，可加副標');
  expect(s).toContain('size（字級）：數字，預設 8，範圍 1–30');
  expect(s).toContain('animIn（進場）：選項 fade / rise，預設 rise');
  expect(formatType(fake, 'wedding.petals')).toContain('color（顏色）：顏色，預設 #fff');
});

test('an unknown block names the closest ones', () => {
  expect(() => formatType(fake, 'core.bannr')).toThrow(/找不到 core\.bannr.*core\.banner/);
});

test('every registered block is listed (but the old ones, still shown by name) and every core block has a doc', () => {
  const s = formatCatalog(plugins), listed = new Set(s.split('\n').map((l) => l.trim().split(/\s+/).find((w) => /^(core|common)\./.test(w))).filter(Boolean));
  for (const p of plugins) for (const it of p.items ?? []) if (!OLD_BLOCKS[it.type]) expect(s).toContain(it.type);
  for (const type of Object.keys(OLD_BLOCKS)) { expect(listed.has(type)).toBe(false); expect(formatType(plugins, type)).toContain('舊'); expect(findBlocks(plugins, '字幕').map((t) => t.type)).not.toContain(type); }
  for (const it of plugins.find((p) => p.id === 'core')!.items!) expect(it.doc, it.type).toBeTruthy();
});

test('shared blocks are grouped by category in the catalog; every common block has a known one', () => {
  const s = formatCatalog(plugins);
  expect(s.indexOf(' 字幕：')).toBeGreaterThan(0);
  expect(s.indexOf(' 字幕：')).toBeLessThan(s.indexOf('common.caption'));
  expect(s.indexOf(' 大字：')).toBeGreaterThan(s.indexOf('common.caption'));
  expect(s.indexOf(' 大字：')).toBeLessThan(s.indexOf('common.slam'));
  for (const it of plugins.find((p) => p.id === 'common')!.items!) expect(Object.keys(BLOCK_CATEGORY), it.type).toContain(it.category);
  // a plugin without categories stays one list
  expect(formatCatalog(fake)).not.toContain('其他');
});

test('find: every word in the type, label, doc or a param (options too), sound effects included', () => {
  const types = (q: string) => findBlocks(plugins, q).map((t) => t.type);
  expect(types('路線')).toEqual(expect.arrayContaining(['common.route', 'common.routeboard', 'common.mapjump']));
  expect(types('收據 印')).toEqual(expect.arrayContaining(['common.printer', 'common.print']));
  expect(types('收據 印')).not.toContain('common.list');
  expect(types('PENCIL')).toContain('common.progress');   // an enum option, any case
  expect(types('  ')).toEqual([]);
  expect(formatFind(plugins, 'zzzz')).toContain('找不到');
});

test('find: a Latin word only where a word starts (ring is not "during"), as the gallery\'s search; any other word anywhere', () => {
  const types = (q: string) => findBlocks(plugins, q).map((t) => t.type);
  expect(types('ring')).toContain('common.progress');
  expect(formatFind(plugins, 'ring').split('\n')).toContainEqual(expect.stringMatching(/^ {16}mode: 'ring' +圓環 — /));
  // the gallery's mid-word hits (common.list, common.digits) are not found here either; nor the blocks the catalog used to find
  // only by a look's English "fringe" (glitch's rgb) or "opening" (search's ask)
  expect(BLOCKS_EN['common.glitch@rgb'].doc).toMatch(/fringe/);
  expect(BLOCKS_EN['common.search@ask'].doc).toMatch(/opening/);
  for (const type of ['common.list', 'common.digits', 'common.glitch', 'common.search']) expect(types('ring'), type).not.toContain(type);
  // nor a clip effect whose doc says "during"
  expect(BLOCKS_EN['clip.avoidBurned'].doc).toMatch(/during/);
  expect(formatFind(plugins, 'ring')).not.toContain(handleOf('clip.avoidBurned')!);
  // a word typed as far as it goes still finds it, at a word start in any field (the type after its dot too); not from mid-word
  expect(types('prog')).toContain('common.progress');
  expect(types('Common.Prog')).toContain('common.progress');
  expect(types('ogress')).not.toContain('common.progress');
  // Chinese anywhere, as before
  expect(types('環')).toContain('common.progress');
  expect(types('度條')).toContain('common.progress');
});

test('find: identifiers (type id, param keys, options) where one of their parts starts, camelCase humps included', () => {
  const types = (q: string) => findBlocks(plugins, q).map((t) => t.type);
  const item = (type: string) => plugins.flatMap((p) => [...(p.items ?? []), ...(p.sfx ?? [])]).find((t) => t.type === type)!;
  // an all-lower-case compound type id hides its second word: its search alias gives it (bar finds the health bar)
  expect(types('bar')).toContain('common.healthbar');
  // nothing found only inside one lower-case part: art is not heart, start or chart
  for (const type of ['common.pen', 'common.route', 'common.chart', 'common.sticker', 'common.candles', 'common.desktop']) expect(types('art'), type).not.toContain(type);
  // a camelCase param key: `dur` finds the pen through drawDur, though nothing of its prose has a word starting with "dur"
  const pen = item('common.pen');
  expect(pen.params.map((d) => d.key)).toContain('drawDur');
  expect(/(^|[^a-z0-9])dur/.test([pen.label, pen.doc ?? '', ...pen.params.map((d) => d.label)].join(' ').toLowerCase())).toBe(false);
  expect(types('dur')).toContain('common.pen');
  expect(types('drawdur')).toContain('common.pen');
  expect(types('ea')).not.toContain('common.healthbar');
  // an `outline` option, or `outline: true` in a clip shape's cut.ts line, is not `line`
  expect(formatFind(plugins, 'line')).not.toContain(handleOf('clip.shape.circle')!);
  // prose keeps the word-start rule: "during" and "coloring" in a doc are not `ring`; an option whose part is ring (earRing) is
  const fake = [{ id: 'x', items: [
    { type: 'x.wash', label: 'wash', doc: 'tints the frame during the coloring pass', kind: 'overlay', params: [{ key: 'fadeDur', label: 'fade time', type: 'number', default: 1 }], build: () => null, draw: () => {} },
    { type: 'x.halo', label: 'halo', doc: 'a glow', kind: 'overlay', params: [{ key: 'shape', label: 'shape', type: 'enum', options: ['disc', 'earRing', 'earring'], default: 'disc' }], build: () => null, draw: () => {} },
  ] }] as unknown as Plugin[];
  expect(findBlocks(fake, 'ring').map((t) => t.type)).toEqual(['x.halo']);
  expect(findBlocks(fake, 'dur').map((t) => t.type)).toEqual(['x.wash']);
  expect(findBlocks(fake, 'oloring').map((t) => t.type)).toEqual([]);
  expect(findBlocks(fake, 'coloring').map((t) => t.type)).toEqual(['x.wash']);
});

test('find: a variant value or template id is an identifier too, its names and docs prose', () => {
  const v = { value: 'snow-fall', label: '雪', doc: 'flakes during the scene' };
  const fake = [{ id: 'x', items: [{ type: 'x.sky', label: 'sky', doc: 'weather', kind: 'overlay', variants: { param: 'look', list: [v, { value: 'rain', label: '雨', doc: 'drops' }] },
    params: [{ key: 'look', label: 'look', type: 'enum', options: ['snow-fall', 'rain'], default: 'rain' }], templates: [{ id: 'nightFall', label: '夜', doc: 'dark', params: { look: 'rain' } }], build: () => null, draw: () => {} }] }] as unknown as Plugin[];
  expect(formatFind(fake, 'fall')).toMatch(/look: 'snow-fall'[\s\S]*template: 'nightFall'/);
  expect(formatFind(fake, 'ring')).toContain('找不到');
});

test("the block index: one line per category with the short names, then the sound effects; guides/workflow.md carries the current one", () => {
  const idx = formatIndex(plugins);
  // a block that moved category keeps its old handle, written whole; the others by number after the category's prefix; a category
  // whose listed blocks all carry another category's handle shows no prefix (nothing listed there is a SUB-nn)
  expect(idx.split('\n')[0]).toBe('- Captions: TXT-02 `caption`');
  expect(idx.split('\n')[1]).toBe('- Titles (HDG): 01 `heading`');
  expect(idx.split('\n')[2]).toMatch(/^- Big text \(TXT\): 01 `burst`, .*\d\d `slam`/);   // the prefix once, then number and name
  expect(idx).toMatch(/^- Sound effects \(`c\.sfx`; a sound file the project made itself goes in with `c\.sfxFile`\):$/m);
  expect(idx).toMatch(/^ {2}- Alerts, right and wrong, alarms \(SFX-ALR\): .*`beep`/m);    // the sounds by category, one line each
  expect(idx).toMatch(/^ {2}- Chimes, rewards and melodies \(SFX-CHM\): .*`ding`.*`chime`/m);
  expect(idx).toContain(`${handleOf('common.stamp')!.slice(4)} \`stamp\``);
  for (const s of plugins.find((p) => p.id === 'common')!.sfx!) expect(idx).toContain('`' + s.type.slice(7) + '`');
  expect(idx).not.toContain('common.');
  // every block but the ones used only when asked for (onRequest: the dachshund) and the old ones, which the agent is not offered here
  for (const it of plugins.find((p) => p.id === 'common')!.items!) {
    if (it.onRequest || OLD_BLOCKS[it.type]) expect(idx).not.toContain('`' + it.type.slice(7) + '`');
    else expect(idx).toContain('`' + it.type.slice(7) + '`');
  }
  const prompt = readFileSync(GUIDE_FILE, 'utf8');
  expect(withIndex(prompt), 'guides/workflow.md 的積木索引過期了：npm run blocks:index').toBe(prompt);
  expect(() => withIndex('no marks')).toThrow(/標記/);
});

test('handles: every catalog line of a shared block starts with its handle, and a handle (any case) is looked up like a type', async () => {
  const s = formatCatalog(plugins);
  expect(s).toMatch(/^ {2}MRK-03 +common\.stamp +印章/m);
  expect(s).toMatch(/^ {2}CLP-01 +鏡頭晃動：c\.shake\(/m);       // clip effects carry theirs too
  expect(await formatLookup(plugins, 'mrk3')).toMatch(/^MRK-03 common\.stamp 印章[\s\S]*shape（/);
  expect(await formatLookup(plugins, 'common.stamp')).toMatch(/^MRK-03 common\.stamp/);
  expect(await formatLookup(plugins, 'sfx-hit-1')).toMatch(/^SFX-HIT-01 common\.impact/);
  expect(await formatLookup(plugins, 'MUS-01')).toMatch(/^MUS-01 pluck .*配樂風格[\s\S]*c\.score\('pluck'/);
  expect(await formatLookup(plugins, 'rcp-1')).toMatch(/^RCP-01 travel[\s\S]*c\.recipe\('travel'/);
  expect(await formatLookup(plugins, 'CLP-03')).toMatch(/avoidBurned: true/);
  await expect(formatLookup(plugins, 'ZZZ-01')).rejects.toThrow(/沒有 ZZZ-01 這個代號/);
  expect(findBlocks(plugins, 'Mrk-03').map((t) => t.type)).toEqual(['common.stamp']);
});

test('clip effects: listed by group in the catalog, found by --find (Chinese, English, the cut.ts line), looked up by handle', async () => {
  const s = formatCatalog(plugins);
  expect(s).toMatch(/^ 轉場（[^\n]*\n {2}CLP-04 +溶接：c\.clip\(src, \{ from, len, transition: \{ type: 'dissolve', dur: 0\.6 \} \}\)/m);
  expect(s).toMatch(/^ 形狀（[^\n]*\n {2}CLP-16 +圓形：[^\n]*shape: 'circle'/m);
  expect(s).toMatch(/^ 晃動、跟著臉、避開原片字幕：\n {2}CLP-01 +鏡頭晃動/m);
  expect(formatFind(plugins, '甩鏡頭')).toMatch(/片段本身的效果 1 個符合[\s\S]*CLP-12 +甩鏡頭：/);
  expect(formatFind(plugins, 'whip pan')).toContain('CLP-12');
  expect(formatFind(plugins, 'heart')).toMatch(/CLP-19 +愛心：[^\n]*shape: 'heart'/);
  expect(formatFind(plugins, 'clp-20')).toContain('CLP-20');
  // with blocks found too, the clip effects come after them
  const both = formatFind(plugins, '轉場');
  expect(both.indexOf('片段本身的效果')).toBeGreaterThan(both.indexOf('符合「轉場」的積木'));
  expect(await formatLookup(plugins, 'CLP-28')).toMatch(/^CLP-28 文字（片段本身的效果，不是積木）[\s\S]*cut\.ts：c\.clip\(src, \{[^\n]*shape: \{ type: 'text', text: 'HELLO' \}/);
});

test('a block marked onRequest is listed apart in the catalog and left out of the chat index', () => {
  const dog = { type: 'common.fakeDog', label: '假狗', kind: 'overlay', category: 'moment', onRequest: true, params: [], build: () => null, draw: () => {} };
  const badge = { type: 'common.fakeBadge', label: '假徽章', kind: 'overlay', category: 'moment', params: [], build: () => null, draw: () => {} };
  const ps = [{ id: 'common', items: [dog, badge] }] as unknown as Plugin[];
  const text = formatCatalog(ps);
  expect(text).toMatch(/只在使用者指名時用[\s\S]*common\.fakeDog/);
  expect(text.indexOf('common.fakeDog')).toBeGreaterThan(text.indexOf('common.fakeBadge'));
  expect(formatIndex(ps)).toContain('`fakeBadge`');
  expect(formatIndex(ps)).not.toContain('fakeDog');
  expect(findBlocks(ps, '假狗').map((t) => t.type)).toEqual(['common.fakeDog']);
});

test('the old postcard and frame point to the 3D desk: search finds the desk, the old ones say so by name, the index leaves them out', () => {
  const found = findBlocks(plugins, '明信片').map((t) => t.type);
  expect(found).toContain('common.flatlay');
  expect(found).not.toContain('common.postcard');
  expect(formatType(plugins, 'common.frame')).toContain('舊');
  expect(formatType(plugins, 'common.frame')).toContain('common.flatlay');
  const frames = formatIndex(plugins).split('\n').find((l) => l.includes('(FRM)'))!;
  expect(frames).toContain('27 `flatlay`');
  expect(frames).not.toContain('`postcard`');
  expect(frames).not.toContain('`frame`');
});

test('block templates: the index lists each as <block>/<id> with its English doc; catalog <type> shows them with their params; search finds them', () => {
  const idx = formatIndex(plugins).split('\n'), at = idx.findIndex((l) => l.startsWith('- Block templates'));
  expect(at).toBeGreaterThan(0);
  expect(at).toBeLessThan(idx.findIndex((l) => l.startsWith('- Sound effects')));
  expect(idx).toContain('  - `leak/prism-sweep`: Music passages, teenage memories, dreamy transitions: a wide rainbow band sweeps the whole frame from the left, brighter and bigger than usual.');
  expect(idx.some((l) => l.startsWith('  - `film/super8-home`: '))).toBe(true);
  const t = formatType(plugins, 'common.leak');
  expect(t).toContain("範本（c.effect('common.leak', { at, len, template: '<id>' })");
  expect(t).toMatch(/^ {4}bokeh-night（夜景光斑）— .*：\{"look":"bokeh"/m);
  expect(formatType(plugins, 'common.stamp')).not.toContain('範本（');
  expect(findBlocks(plugins, 'bokeh-night').map((x) => x.type)).toEqual(['common.leak']);
});

test('block variants: --find lists the looks and templates that match under their block, each as the option to pass', () => {
  const lines = (q: string) => formatFind(plugins, q).split('\n');
  const rocket = lines('rocket');
  expect(rocket.some((l) => /common\.progress/.test(l))).toBe(true);
  expect(rocket).toContainEqual(expect.stringMatching(/^ {16}mode: 'rocket' +火箭 — /));
  expect(rocket).toContainEqual(expect.stringMatching(/^ {16}template: 'rocket' +火箭升空 — /));
  // the two kinds line up: the code column is as wide as the widest code
  const at = (l: string) => /^ {16}\S+ '[^']+' +/.exec(l)![0].length;
  expect(at(rocket.find((l) => l.includes("mode: 'rocket'"))!)).toBe(at(rocket.find((l) => l.includes("template: 'rocket'"))!));
  expect(rocket.at(-1)).toBe("看參數和全部樣式：npm run tellcut -- catalog <類型或代號>；縮排的那幾行是 c.effect 的寫法（例如 mode: 'rocket'、template: 'rocket'）");
  expect(lines('圓環')).toContainEqual(expect.stringMatching(/^ {16}mode: 'ring' +圓環 — /));
  expect(findBlocks(plugins, '圓環').map((t) => t.type)).toContain('common.progress');
});

test('block variants: words only at the block level list no look, only how many it has; two words in two different looks list neither', () => {
  const found = formatFind(plugins, '進度條');
  expect(found).not.toMatch(/^ +mode: '/m);
  expect(found).toMatch(/^ {2}CHP-04 +common\.progress +進度條 — [^\n]*（17 種樣式、8 個範本：catalog common\.progress）$/m);
  // other blocks may list a look of theirs that says 進度條 (window's content: 'progress'); progress itself lists none
  const ls = found.split('\n'), p = ls.findIndex((l) => l.includes('common.progress'));
  expect(ls[p + 1]).not.toMatch(/^ {16}/);
  expect(formatFind(plugins, '火箭 圓環')).not.toMatch(/^ +(mode|template): '/m);
  // a handle finds the block, never its parts
  expect(formatFind(plugins, 'CHP-04')).toMatch(/（17 種樣式、8 個範本：catalog common\.progress）$/m);
});

test('block variants: a block without variants or templates is listed as before', () => {
  const hangtag = plugins.flatMap((p) => p.items ?? []).find((t) => t.type === 'common.hangtag')!;
  expect(hangtag.variants).toBeUndefined();
  expect(hangtag.templates).toBeUndefined();
  const out = formatFind(plugins, hangtag.label).split('\n'), line = out.find((l) => l.includes('common.hangtag'))!;
  expect(line).toMatch(new RegExp(`^ {2}${handleOf('common.hangtag')} +common\\.hangtag +${hangtag.label} — `));
  expect(line.endsWith(hangtag.doc!)).toBe(true);
  expect(out.at(-1)).toBe('看參數和全部樣式：npm run tellcut -- catalog <類型或代號>');
});

test('block variants: catalog <type> has a variants section before the params, and the index a Block variants line', async () => {
  const s = await formatLookup(plugins, 'common.progress'), ls = s.split('\n');
  const head = ls.findIndex((l) => l.startsWith("  樣式（mode，c.effect('common.progress', { at, len, mode: '<value>' })）："));
  expect(head).toBeGreaterThan(0);
  expect(ls.slice(head + 1, head + 18).every((l) => /^ {4}[a-z]+ +\S+ — /.test(l))).toBe(true);
  expect(ls[head + 18]).toMatch(/^ {2}mode（/);
  expect(ls.slice(head + 1, head + 18).map((l) => l.trim().split(/\s+/)[0])).toEqual((plugins.flatMap((p) => p.items ?? []).find((t) => t.type === 'common.progress')!.params.find((d) => d.key === 'mode') as { options: string[] }).options);
  expect(formatType(plugins, 'common.hangtag')).not.toContain('樣式（');
  const idx = formatIndex(plugins).split('\n'), v = idx.findIndex((l) => l.startsWith('- Block variants'));
  expect(v).toBeGreaterThan(0);
  expect(v).toBeLessThan(idx.findIndex((l) => l.startsWith('- Block templates')));
  expect(idx[v]).toBe("- Block variants (the param in brackets picks the look; `catalog --find <words>` describes them):");
  expect(idx).toContain('  - `progress` (mode): bar, dots, tabs, pencil, timeline, slots, osd, runner, stretch, paws, segments, fuse, battery, rocket, ring, vine, stamps');
});

test('combos: the catalog lists them by handle, a handle or combo:<id> shows the layers, search and the index find them', async () => {
  expect(formatCatalog(plugins)).toMatch(/^組合（[^\n]*c\.combo\('<id>', \{ at \}\)[^\n]*\n {2}CMB-01 +impact +重擊 — 重擊、打臉/m);
  const one = await formatLookup(plugins, 'cmb1');
  expect(one).toMatch(/^CMB-01 impact 重擊（組合）— /);
  expect(one).toMatch(/^ {4}flash（畫面：core\.flash，範本 bloom-pop，layer top）0 秒起 0\.5 秒：\{"y":0\.4,"peak":0\.65,"fall":0\.35,"power":3\}$/m);
  expect(one).toMatch(/^ {4}shake（鏡頭晃動：28 px）0 秒起 0\.4 秒$/m);
  expect(await formatLookup(plugins, 'combo:glitchcut')).toMatch(/^CMB-02 glitchcut[\s\S]*scan（畫面：common\.glitch，範本 signal-loss）-0\.1 秒起/);
  await expect(formatLookup(plugins, 'combo:nope')).rejects.toThrow(/沒有組合 nope/);
  expect(findCombos(plugins, '故障').map((c) => c.id)).toEqual(['glitchcut']);
  expect(findCombos(plugins, 'speedlines').map((c) => c.id)).toEqual(['impact', 'punchline', 'rush']);
  expect(findCombos(plugins, '組合').length).toBe(plugins.flatMap((p) => p.combos ?? []).length);
  expect(formatFind(plugins, 'glitchcut')).toMatch(/^組合 1 個符合[^\n]*\n {2}CMB-02 +glitchcut/);
  expect(formatIndex(plugins)).toMatch(/^- Combos \(CMB\) \(`c\.combo\('<id>', \{ at \}\)`[^\n]*\): 01 `impact`, 02 `glitchcut`, 03 `punchline`, 04 `rewind`, 05 `reveal`, 06 `celebrate`, 07 `leader`, 08 `memory`, 09 `rush`, 10 `closing`, 11 `irisout`, 12 `stage`$/m);
});

/** a search alias key split into its block type and, for a look, `@value` or `#id` */
const aliasKey = (key: string) => { const m = /^([^@#]+)(?:([@#])(.+))?$/.exec(key)!; return { type: m[1], sep: m[2] as '@' | '#' | undefined, id: m[3] }; };
const sharedItems = plugins.flatMap((p) => p.items ?? []);

test('search aliases: every key names a block or sound effect offered today, or one of a block\'s variants or templates', () => {
  const sounds = new Set(plugins.flatMap((p) => p.sfx ?? []).map((x) => x.type));
  for (const key of Object.keys(SEARCH_ALIASES)) {
    const { type, sep, id } = aliasKey(key), t = sharedItems.find((x) => x.type === type);
    expect([key, (!!t || (!sep && sounds.has(type))) && !Object.hasOwn(OLD_BLOCKS, type)]).toEqual([key, true]);
    if (sep === '@') expect([key, !!t!.variants?.list.some((v) => v.value === id)]).toEqual([key, true]);
    if (sep === '#') expect([key, (t!.templates ?? []).some((x) => x.id === id)]).toEqual([key, true]);
  }
});

test('search aliases: each word finds every block it is for, and a look its own line under the block', () => {
  // what a --find lists: each block line's type, with the part codes indented under it
  const listed = (q: string) => {
    const out = new Map<string, string[]>(); let cur: string[] | undefined;
    for (const l of formatFind(plugins, q).split('\n')) {
      const part = /^ {16}(\S+ '[^']+')/.exec(l), block = /^ {2}\S+ +(\S+) /.exec(l);
      if (part && cur) cur.push(part[1]);
      else if (block) out.set(block[1], (cur = []));
      else cur = undefined;
    }
    return out;
  };
  const words: Record<string, string[]> = {
    心形: ['common.pen@heart', 'common.sticker@heart', 'common.emoji@tap'], 紅心: ['common.pen@heart', 'common.sticker@heart', 'common.emoji@tap'],
    大拇指: ['common.pen@thumb'], 勾勾: ['common.pen@check', 'common.list@check'], 彩帶: ['common.sparkle@confetti'], 紙花: ['common.sparkle@confetti'],
    計時器: ['common.countdown', 'common.story@timer'], 碼表: ['common.countdown', 'common.story@timer'],
    發票: ['common.receipt', 'common.printer'], 帳單: ['common.receipt', 'common.printer'], 折線: ['common.chart@line'],
    蠟燭: ['common.candles'], K棒: ['common.candles'], 'k 棒': ['common.candles'], 膠卷: ['common.film', 'common.filmstrip'], google: ['common.search'],
    效果字: ['common.onomatopoeia'], 名言: ['common.quote'], 刪除線: ['common.strike'], 分屏: ['common.grid', 'common.slant', 'common.duo'],
    訂閱: ['common.outro@cta'], 星等: ['common.rating'], 下雪: ['common.pen@snow'], 霓虹燈: ['common.slam@neon'], 黑板: ['common.handwrite@chalk'], 封鎖線: ['common.band@caution'], 故障: ['common.slam@split'], 擬聲詞: ['common.onomatopoeia'],
    頭條: ['common.wipe#band-steep', 'common.search@results'], 快訊: ['common.wipe#band-steep', 'common.search@results'],
    // a few of the English and Japanese ones, several words each matched on its own
    'split screen': ['common.grid', 'common.slant'], 'film roll': ['common.film', 'common.filmstrip'], stopwatch: ['common.countdown', 'common.story@timer'],
    ネオン: ['common.slam@neon'], highlighter: ['common.handwrite@marker'], 'breaking news': ['common.wipe#band-steep', 'common.search@results'],
  };
  for (const [q, targets] of Object.entries(words)) {
    const got = listed(q), types = findBlocks(plugins, q).map((t) => t.type);
    for (const key of targets) {
      const { type, sep, id } = aliasKey(key), t = sharedItems.find((x) => x.type === type)!;
      expect([q, key, types.includes(type), got.has(type)]).toEqual([q, key, true, true]);
      if (sep) expect([q, key, got.get(type)]).toEqual([q, key, expect.arrayContaining([sep === '@' ? `${t.variants!.param}: '${id}'` : `template: '${id}'`])]);
    }
  }
  // a block's alias with a look's own word: the look under the block, as 倒數 flip lists it
  expect(listed('計時器 flip').get('common.countdown')).toEqual(listed('倒數 flip').get('common.countdown'));
  expect(listed('計時器 flip').get('common.countdown')).toContain("look: 'flip'");
  // a block alias alone lists the block, not its looks
  expect(listed('計時器').get('common.countdown')).toEqual([]);
});

test('search aliases: a word that is no alias finds what it found before', () => {
  const qs = ['新聞', 'heart', '愛心', '倒數', '收據', 'snow', 'quote'];
  const withAliases = qs.map((q) => formatFind(plugins, q));
  const saved = { ...SEARCH_ALIASES };
  try {
    for (const k of Object.keys(SEARCH_ALIASES)) delete (SEARCH_ALIASES as Record<string, unknown>)[k];
    expect(qs.map((q) => formatFind(plugins, q))).toEqual(withAliases);
    expect(formatFind(plugins, '心形')).toContain('找不到');
  } finally { Object.assign(SEARCH_ALIASES, saved); }
  expect(formatFind(plugins, '心形')).not.toContain('找不到');
});
