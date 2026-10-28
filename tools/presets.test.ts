// The presets in git (guides/presets): what the home page and the chat rely on.
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ADAPTERS, TELLCUT_ROOT } from '@tellcut/media-node';
import { loadPresets } from '@tellcut/media-node';

const RULE = "These are defaults. If the user's message conflicts with any of them, follow the user and say in one sentence what you changed.";
const presets = () => loadPresets({ repo: join(TELLCUT_ROOT, 'guides', 'presets'), user: mkdtempSync(join(tmpdir(), 'nopresets-')) });
const LANGS = ['zh', 'en', 'ja'] as const;

test('the repo has the ten presets, in order', () => {
  const all = presets();
  expect(all.map((p) => p.id)).toEqual(['custom', 'travel', 'clips', 'podcast', 'food', 'vlog', 'celebration', 'brand', 'explainer', 'auto']);
  expect(new Set(all.map((p) => p.order)).size).toBe(all.length);
});

test('every preset speaks three languages and starts with the defaults rule', () => {
  for (const p of presets()) {
    for (const l of LANGS) {
      expect(p.name[l], `${p.id} name.${l}`).toBeTruthy();
      expect(p.summary[l], `${p.id} summary.${l}`).toBeTruthy();
      if (Object.keys(p.fit).length) expect(p.fit[l]?.length, `${p.id} fit.${l}`).toBeTruthy();
      if (Object.keys(p.facts).length) expect(p.facts[l]?.length, `${p.id} facts.${l}`).toBeTruthy();
      for (const s of p.styles) {
        expect(s.name[l], `${p.id}.${s.id} name.${l}`).toBeTruthy();
        expect(s.desc[l], `${p.id}.${s.id} desc.${l}`).toBeTruthy();
      }
      for (const f of p.fields) {
        expect(f.name[l], `${p.id}.${f.id} name.${l}`).toBeTruthy();
        if (f.hint) expect(f.hint[l], `${p.id}.${f.id} hint.${l}`).toBeTruthy();
        if (f.group) expect(f.group[l], `${p.id}.${f.id} group.${l}`).toBeTruthy();
        for (const o of f.options) expect(o.name[l], `${p.id}.${f.id}.${o.id} name.${l}`).toBeTruthy();
      }
      p.examples.forEach((e, i) => expect(e[l], `${p.id} examples[${i}].${l}`).toBeTruthy());
    }
    expect(new Set(p.styles.map((s) => s.id)).size).toBe(p.styles.length);
    expect(p.prompt.startsWith(RULE), p.id).toBe(true);
    expect(p.prompt, p.id).not.toMatch(/[一-鿿]/);
    for (const s of p.styles) expect(s.prompt, `${p.id}.${s.id}`).not.toMatch(/[一-鿿]/);
    for (const f of p.fields) for (const o of f.options) expect(o.prompt, `${p.id}.${f.id}.${o.id}`).not.toMatch(/[一-鿿]/);
  }
});

test("a preset's default APIs are sources there are (the API menu ticks them when the preset is picked)", () => {
  for (const p of presets()) for (const s of p.sources) expect(Object.keys(ADAPTERS), `${p.id}: ${s}`).toContain(s);
  expect(presets().find((p) => p.id === 'travel')!.sources).toEqual(['maps', 'carto', 'wikimedia', 'countries', 'freesound', 'incompetech']);
  // stock footage and photos where there is often no footage of one's own (2026-10-25); never for the films of one's own trip, meal or day
  expect(presets().find((p) => p.id === 'brand')!.sources).toEqual(['pixabay', 'freesound']);
  expect(presets().find((p) => p.id === 'explainer')!.sources).toEqual(['pixabay']);
  for (const id of ['travel', 'food', 'vlog', 'celebration', 'podcast', 'clips']) expect(presets().find((p) => p.id === id)!.sources, id).not.toContain('pixabay');
});

test("every preset but auto and custom has the length and ratios check compares with, and its facts say the same", () => {
  // "30–150 s", "1–3 min", "45 s–3 min": the first number takes the second's unit when it has none
  const seconds = (fact: string) => { const m = /(\d+)(?: (s|min))?–(\d+) (s|min)/.exec(fact); if (!m) return null; const u = (x?: string) => (x === 'min' ? 60 : 1); return [+m[1] * u(m[2] ?? m[4]), +m[3] * u(m[4])]; };
  for (const p of presets().filter((x) => x.id !== 'auto' && x.id !== 'custom')) {
    expect(p.length, p.id).toBeTruthy();
    expect(p.ratios?.length, p.id).toBeTruthy();
    expect(p.facts.en!.map(seconds).filter(Boolean), p.id).toEqual([p.length]);
    for (const r of p.ratios!) expect(p.facts.en!.join(' '), `${p.id} ${r}`).toContain(r);
  }
  for (const id of ['auto', 'custom']) { const p = presets().find((x) => x.id === id)!; expect([p.length, p.ratios], id).toEqual([undefined, undefined]); }
});

test('auto names no genre and has no styles', () => {
  const auto = presets().find((p) => p.id === 'auto')!;
  expect(auto.styles).toEqual([]);
  expect(auto.prompt).not.toMatch(/genre/i);
});

test("travel's styles that still need new effects say so (notifications: common.notify + common.lockscreen, social: common.reels + common.comments + common.story since 2026-10-23, phone-album: common.album since 2026-10-24, magazine: common.magazine + common.wipe curl since 2026-10-24, chat: common.chat since 2026-10-24, search: common.search since 2026-10-24; none is custom any more)", () => {
  const travel = presets().find((p) => p.id === 'travel')!, ids = travel.styles.map((s) => s.id);
  expect(ids).toEqual(expect.arrayContaining(['phone-album', 'chat', 'search', 'map-route', 'notifications', 'social', 'photo-dump', 'transitions', 'magazine']));
  const custom: string[] = [];
  for (const s of travel.styles) expect(!!s.custom, s.id).toBe(custom.includes(s.id));
});

test('custom: the form the spec lists (spec 2026-10-24-custom-preset §4)', () => {
  const all = presets(), custom = all.find((p) => p.id === 'custom')!;
  // Making › Effects (shared.json) comes first
  expect(custom.fields.map((f) => f.id)).toEqual(['library', 'ratio', 'resolution', 'length', 'framing', 'inserts', 'opening', 'ending', 'voice', 'music', 'pace', 'captions', 'caption-lang']);
  expect(custom.fields.map((f) => f.options.length)).toEqual([1, 4, 3, 4, 5, 4, 4, 4, 3, 6, 3, 3, 3]);
  const field = (id: string) => custom.fields.find((f) => f.id === id)!;
  expect(custom.fit).toEqual({});                                                 // the form says it all: no "good when you have"
  expect(custom.poster).toBe('/api/presets/custom/poster.jpg');
  expect(field('ratio').options.map((o) => o.id)).toEqual(['9:16', '1:1', '4:5', '16:9']);
  expect(field('length').options.map((o) => o.id)).toEqual(['15', '30', '60', '90']);
  expect(field('length').seconds).toBe(true);
  expect(field('resolution').hint?.zh).toContain('4K');
  expect(field('inserts').name.zh).toBe('圖文段落');
  expect(custom.examples).toHaveLength(8);
  expect([custom.styles, custom.sources]).toEqual([[], []]);
  expect(custom.prompt).not.toMatch(/below|genre/i);
  expect(Math.min(...all.filter((p) => p !== custom).map((p) => p.order))).toBeGreaterThan(custom.order);
});

test('every preset starts its form with Making › Effects: Auto (the library where it fits, new where not) or All new', () => {
  for (const p of presets()) {
    const f = p.fields[0];
    expect([f?.id, f?.group?.zh, f?.options.map((o) => o.id)], p.id).toEqual(['library', '製作', ['none']]);
    expect(p.fields.filter((x) => x.id === 'library'), p.id).toHaveLength(1);
    // both choices explain themselves on hover, in all three languages
    for (const h of [f.autoHint, f.options[0].hint]) expect(Object.keys(h ?? {}).sort(), p.id).toEqual(['en', 'ja', 'zh']);
  }
  const none = presets()[0].fields[0].options[0].prompt;
  expect(none).toMatch(/common\./);                                              // no shared block: says what that means
  expect(none).toMatch(/style .*rebuild that look/);                            // a ticked style built on shared blocks is rebuilt
});

test('brand: the five v1 styles, 45–90 s at 16:9, Pixabay and Freesound, and the rules that make it work without footage', () => {
  const b = presets().find((p) => p.id === 'brand')!;
  expect(b.styles.map((s) => s.id)).toEqual(['real-3d', 'cinemascope', 'voiceover', 'globe', 'social-cut']);
  expect([b.length, b.ratios, b.sources]).toEqual([[45, 90], ['16:9'], ['pixabay', 'freesound']]);
  // the body names the tools the film is made with
  for (const s of ['tellcut -- logo', 'ThreeKit', 'three: true', 'assets search', 'tellcut -- frames']) expect(b.prompt, s).toContain(s);
  // the rules the spec sets (§4)
  expect(b.prompt).toMatch(/only numbers .* in the user's (own )?(text|words)/i);
  expect(b.prompt).toMatch(/search .* before .* (script|copy)/i);
  expect(b.prompt).toMatch(/endors/i);
  expect(b.styles.find((s) => s.id === 'globe')!.prompt).toMatch(/no places?.*(skip|leave out|do not)/i);
  expect(b.styles.find((s) => s.id === 'cinemascope')!.prompt).toMatch(/between the bars/i);
});

// 2026-10-28: the recipe-made films fell short of the spike and a film written for its company came close, so every brand film is
// written for its company (the recipe and its blocks are gone); footage minimums, one look, no stock clichés, its own picture budget
test('brand films are written for their company, with footage minimums, one look and its own picture budget', () => {
  const b = presets().find((p) => p.id === 'brand')!;
  expect(b.prompt).toMatch(/no recipe and no shared block/i);
  expect(b.prompt).not.toMatch(/c\.recipe|common\.(logo|wall|dolly|globe)|c\.dolly/);
  for (const s of ['storyboard.md', '--kind image']) expect(b.prompt, s).toContain(s);
  expect(b.prompt).toMatch(/each beat acted out/i);
  expect(b.prompt).toMatch(/at least 12 distinct clips/i);
  expect(b.prompt).toMatch(/no shot twice/i);
  expect(b.prompt).toMatch(/stock clichés/i);
  expect(b.prompt).toMatch(/one look for the whole film/i);
  expect(b.prompt).toMatch(/about 40 pictures/i);
  for (const s of b.styles) expect(s.prompt, s.id).not.toMatch(/recipe|common\.(logo|wall|dolly|globe)/);
  const wf = readFileSync(join(TELLCUT_ROOT, 'guides/workflow.md'), 'utf8');
  expect(wf).toMatch(/a preset may allow more/i);
});

test('brand films start from the brand: the brand card, the site, the form, no default look (2026-10-28 rethink)', () => {
  const b = presets().find((p) => p.id === 'brand')!;
  expect(b.fields.map((f) => f.id)).toEqual(['library', 'tone', 'type']);
  expect(b.fields[1].options.map((o) => o.id)).toEqual(['tech', 'warm', 'premium', 'playful']);
  expect(b.fields[2].options.map((o) => o.id)).toEqual(['sans', 'serif', 'round']);
  for (const s of ['brand.md', 'tellcut -- site', 'tellcut -- font3d', 'storyboard.md', '--kind image']) expect(b.prompt, s).toContain(s);
  expect(b.prompt).toMatch(/user's message .* form .* website .* logo/i);           // the order of the sources
  expect(b.prompt).toMatch(/company name in the film's language/i);
  expect(b.prompt).toMatch(/common\.tone[^.]*colou?r[^.]*brand/i);
  expect(b.prompt).not.toMatch(/warm light|warm dusk|warm sunsets?|Inter for Latin|Noto Sans TC for Chinese|pile, the wall|the ball of the 3D|default when no style/i);
  expect(b.prompt).not.toMatch(/c\.recipe|common\.(logo|wall|dolly|globe)/);
  for (const s of b.styles) expect(s.prompt, s.id).not.toMatch(/default when no style|warmer grade|recipe/i);
  expect(b.facts.en!.join(' ')).not.toMatch(/3D/);
  expect(b.summary.en).not.toMatch(/3D/);
});

test("celebration's name title and vlog's time stamps and notes have their blocks now (2026-10-27, group C): not custom, and they name them", () => {
  const style = (p: string, s: string) => presets().find((x) => x.id === p)!.styles.find((x) => x.id === s)!;
  for (const [p, s, blocks] of [['celebration', 'slow-title', ["common.headline look: 'name'", "common.outro look: 'credits'"]], ['vlog', 'day-clock', ["common.tag look: 'day'"]],
    ['vlog', 'handwritten-notes', ["common.tag look: 'tape'", "common.caption style: 'strip'"]]] as const) {
    expect(style(p, s).custom, `${p}.${s}`).toBeFalsy();
    for (const b of blocks) expect(style(p, s).prompt, `${p}.${s}`).toContain(b);
  }
});

test("podcast's solo framing and end card name their blocks (2026-10-28, group B)", () => {
  const p = presets().find((x) => x.id === 'podcast')!;
  expect(p.styles.find((x) => x.id === 'solo')!.prompt).toContain("common.duo mode: 'solo'");
  const body = readFileSync(join(TELLCUT_ROOT, 'guides', 'presets', 'podcast', 'preset.md'), 'utf8');
  for (const b of ["common.outro look: 'episode'", 'outroWindow', "common.progress mode: 'slots'", 'common.slip']) expect(body).toContain(b);
});
