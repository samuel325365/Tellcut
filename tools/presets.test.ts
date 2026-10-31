// The presets in git (guides/presets): what the home page and the chat rely on.
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ADAPTERS, TELLCUT_ROOT } from '@tellcut/media-node';
import { loadPresets } from '@tellcut/media-node';
import { commonPlugin } from '@tellcut/plugin-common';

const RULE = "These are defaults. If the user's message conflicts with any of them, follow the user and say in one sentence what you changed.";
const presets = () => loadPresets({ repo: join(TELLCUT_ROOT, 'guides', 'presets'), user: mkdtempSync(join(tmpdir(), 'nopresets-')) });
const LANGS = ['zh', 'en', 'ja'] as const;

test('the repo has the nine presets, in order', () => {
  const all = presets();
  expect(all.map((p) => p.id)).toEqual(['custom', 'travel', 'clips', 'podcast', 'food', 'vlog', 'celebration', 'brand', 'explainer']);
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
  expect(presets().find((p) => p.id === 'explainer')!.sources).toEqual(['pixabay', 'wikimedia']);
  for (const id of ['travel', 'food', 'vlog', 'celebration', 'podcast', 'clips']) expect(presets().find((p) => p.id === id)!.sources, id).not.toContain('pixabay');
});

test("every preset but custom has the length and ratios check compares with, and its facts say the same", () => {
  // "30–150 s", "1–3 min", "45 s–3 min": the first number takes the second's unit when it has none
  const seconds = (fact: string) => { const m = /(\d+)(?: (s|min))?–(\d+) (s|min)/.exec(fact); if (!m) return null; const u = (x?: string) => (x === 'min' ? 60 : 1); return [+m[1] * u(m[2] ?? m[4]), +m[3] * u(m[4])]; };
  for (const p of presets().filter((x) => x.id !== 'custom')) {
    expect(p.length, p.id).toBeTruthy();
    expect(p.ratios?.length, p.id).toBeTruthy();
    expect(p.facts.en!.map(seconds).filter(Boolean), p.id).toEqual([p.length]);
    for (const r of p.ratios!) expect(p.facts.en!.join(' '), `${p.id} ${r}`).toContain(r);
  }
  const custom = presets().find((x) => x.id === 'custom')!;
  expect([custom.length, custom.ratios]).toEqual([undefined, undefined]);
});

test('every preset but custom holds its whole direction and skips the genre cards (travel 2026-10-28, the rest 2026-10-31)', () => {
  expect(presets().filter((p) => p.genres).map((p) => p.id)).toEqual(['custom']);
});

// 2026-10-31: brand's styles are five forms and two looks; explainer takes in the education genres (myth, listicle, dataviz, quiz,
// tutorial) as forms of its own, at 9:16 or 16:9
test('brand and explainer: forms first, each prompt starting with its kind', () => {
  const p = (id: string) => presets().find((x) => x.id === id)!;
  const style = (id: string, s: string) => p(id).styles.find((x) => x.id === s)!.prompt;
  expect(p('brand').styles.map((s) => s.prompt.split(':')[0])).toEqual(['Form', 'Form', 'Form', 'Form', 'Form', 'Look', 'Look']);
  expect(p('brand').prompt).toMatch(/at most one form/i);
  expect(p('brand').prompt).toMatch(/logo on screen from start to finish/i);
  expect(p('brand').prompt).toMatch(/not only empty scenery/i);
  const e = p('explainer');
  expect(e.styles.map((s) => s.id)).toEqual(['flat', 'whiteboard', 'essay', 'kinetic', 'side-by-side', 'myth', 'listicle', 'data', 'quiz', 'chat', 'chapters', 'callouts']);
  for (const s of e.styles) expect(s.prompt, s.id).toMatch(/^(Form|Accent):/);
  for (const s of e.styles) expect(!!s.custom, s.id).toBe(s.id === 'flat');
  expect([e.length, e.ratios]).toEqual([[45, 180], ['9:16', '16:9']]);
  expect(e.prompt).toMatch(/at most one form/i);
  expect(e.prompt).toMatch(/never invent a number/i);
  expect(e.prompt).toMatch(/at 16:9 the diagram on the left/i);
  for (const [s, b] of [['whiteboard', "common.paper look: 'grid'"], ['essay', 'common.worldmap'], ['myth', 'common.strike'], ['myth', 'common.casefile'],
    ['listicle', "common.progress mode: 'slots'"], ['data', 'common.chart'], ['quiz', 'common.countdown'], ['chat', 'common.chat'], ['side-by-side', 'common.callout']] as const)
    expect(style('explainer', s), s).toContain(b);
});

// 2026-10-31: the same review as travel's for five more. Each style's prompt starts with its kind (Form, Captions, Cut, Accent, Look),
// at most one form and one look, and the forms name the blocks they are built on
test('clips, podcast, food, vlog and celebration: forms first, then the rest, each naming its blocks', () => {
  const ids = (p: string) => presets().find((x) => x.id === p)!.styles.map((s) => s.id);
  const style = (p: string, s: string) => presets().find((x) => x.id === p)!.styles.find((x) => x.id === s)!.prompt;
  expect(ids('clips')).toEqual(['quote-card', 'search', 'live-replay', 'title-bar', 'big-captions', 'telop', 'punch-in', 'tease', 'progress']);
  expect(ids('podcast')).toEqual(['stacked', 'solo', 'versus', 'group-chat', 'quote-card', 'waveform', 'big-captions', 'qa-captions', 'telop', 'list-slots']);
  expect(ids('food')).toEqual(['receipt', 'street-route', 'shutter', 'judge', 'search', 'chat', 'rating', 'verdict-stamp', 'polaroid', 'ember-tag', 'price-chart', 'sound-closeups', 'warm']);
  expect(ids('vlog')).toEqual(['planner', 'notifications', 'chat', 'album', 'silent', 'photo-dump', 'transitions', 'jump-cuts', 'day-clock', 'handwritten-notes', 'polaroid', 'cinematic', 'retro']);
  expect(ids('celebration')).toEqual(['frame', 'postcard', 'timeline', 'memories', 'group-chat', 'magazine', 'slow-title', 'dissolves', 'photo-dump', 'polaroid', 'cinematic', 'retro', 'film']);
  for (const p of ['clips', 'podcast', 'food', 'vlog', 'celebration']) {
    const pre = presets().find((x) => x.id === p)!;
    expect(pre.prompt, p).toMatch(/at most one form/i);
    for (const s of pre.styles) expect(s.prompt, `${p}.${s.id}`).toMatch(/^(Form|Captions|Cut|Accent|Look):/);
    // only the audiogram has no shared block yet (TODO 2026-10-31)
    for (const s of pre.styles) expect(!!s.custom, `${p}.${s.id}`).toBe(p === 'podcast' && s.id === 'waveform');
  }
  for (const [p, s, b] of [['clips', 'quote-card', 'common.quote'], ['clips', 'live-replay', 'common.comments'], ['podcast', 'versus', 'common.versus'],
    ['podcast', 'group-chat', 'chatWindow'], ['food', 'receipt', 'common.printer'], ['food', 'street-route', 'common.route'], ['food', 'shutter', 'common.rolldoor'],
    ['food', 'judge', 'common.gauge'], ['food', 'ember-tag', "look: 'ember'"], ['vlog', 'planner', 'common.paper'], ['vlog', 'silent', "style: 'strip'"],
    ['celebration', 'frame', 'frameWindow'], ['celebration', 'timeline', "common.meter look: 'band'"], ['celebration', 'memories', 'mode foryou']] as const)
    expect(style(p, s), `${p}.${s}`).toContain(b);
  expect(presets().find((x) => x.id === 'food')!.prompt).toMatch(/info cards .* welcome/i);
  for (const p of ['clips', 'podcast', 'vlog', 'celebration']) expect(presets().find((x) => x.id === p)!.prompt, p).toMatch(/no info cards/i);
});

// 2026-10-31: the films need not be full-frame footage any more. Nine forms that each carry the whole film (at most one), two ways
// of cutting and two looks (at most one) that go with any of them; every style is built on shared blocks, none is custom
test('travel: nine whole-film forms, two cuts, two looks, and the rules that keep them apart', () => {
  const travel = presets().find((p) => p.id === 'travel')!, style = (id: string) => travel.styles.find((s) => s.id === id)!.prompt;
  expect(travel.styles.map((s) => s.id)).toEqual(['phone-album', 'chat', 'search', 'notifications', 'magazine', 'social', 'postcard', 'map-route', 'rail-trip',
    'photo-dump', 'transitions', 'cinematic', 'retro']);
  for (const s of travel.styles) expect(!!s.custom, s.id).toBe(false);
  expect(travel.prompt).toMatch(/at most one form/i);
  expect(travel.prompt).toMatch(/at most one look/i);
  expect(travel.prompt).toMatch(/no info cards/i);
  expect(travel.prompt).toMatch(/never invent/i);
  expect(travel.prompt).not.toMatch(/fill the frame/i);
  for (const b of ['common.ticket', 'common.routeboard', 'common.stations']) expect(style('rail-trip'), b).toContain(b);
  expect(style('postcard')).toContain('postcardWindow');
  expect(style('retro')).toMatch(/look vhs/);
  expect(style('cinematic')).toContain('common.tone');
  expect(style('photo-dump')).toContain('common.snap');
  expect(style('chat')).not.toMatch(/exception/i);
});

test('every common.* a preset names is a block or a sound there is', () => {
  const known = new Set([...(commonPlugin.items ?? []).map((i) => i.type), ...(commonPlugin.sfx ?? []).map((s) => s.type)]);
  for (const p of presets()) for (const text of [p.prompt, ...p.styles.map((s) => s.prompt), ...p.fields.flatMap((f) => f.options.map((o) => o.prompt))])
    for (const m of text.matchAll(/common\.[a-z][a-z0-9-]*/g)) expect(known.has(m[0]), `${p.id}: ${m[0]}`).toBe(true);
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

test('brand: seven whole-film styles, 45–90 s at 16:9, Pixabay and Freesound, and the rules that make it work without footage', () => {
  const b = presets().find((p) => p.id === 'brand')!;
  // 2026-10-28: every style is a way the whole film looks (voice-over is a form field, places a line in the body, no social cut)
  expect(b.styles.map((s) => s.id)).toEqual(['people', 'texture', 'manifesto', 'shapes', 'product-3d', 'minimal', 'cinemascope']);
  expect([b.length, b.ratios, b.sources]).toEqual([[45, 90], ['16:9'], ['pixabay', 'freesound']]);
  // the body names the tools the film is made with
  for (const s of ['tellcut -- logo', 'ThreeKit', 'three: true', 'assets search', 'tellcut -- frames']) expect(b.prompt, s).toContain(s);
  // the rules the spec sets (§4)
  expect(b.prompt).toMatch(/only numbers .* in the user's (own )?(text|words)/i);
  expect(b.prompt).toMatch(/search .* before .* (script|copy)/i);
  expect(b.prompt).toMatch(/endors/i);
  expect(b.prompt).toMatch(/places[^.]*user's text[^.]*map or globe/i);
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
  expect(b.fields.map((f) => f.id)).toEqual(['library', 'tone', 'type', 'voice']);
  expect(b.fields[3].options.map((o) => o.id)).toEqual(['original', 'tts', 'none']);
  // short names, so the dialog shows every field as buttons (a name over 8 characters turns it into a menu)
  for (const f of b.fields) for (const o of f.options) for (const l of LANGS) expect([...(o.name[l] ?? '')].length, `${f.id}.${o.id}.${l}`).toBeLessThanOrEqual(8);
  expect(b.fields[1].options.map((o) => o.id)).toEqual(['tech', 'warm', 'premium', 'playful']);
  expect(b.fields[2].options.map((o) => o.id)).toEqual(['sans', 'serif', 'round']);
  for (const s of ['brand.md', 'tellcut -- site', 'tellcut -- font3d', 'storyboard.md', '--kind image']) expect(b.prompt, s).toContain(s);
  expect(b.prompt).toMatch(/user's message .* form .* website .* logo/i);           // the order of the sources
  expect(b.prompt).toMatch(/company name in the film's language/i);
  expect(b.prompt).toMatch(/common\.tone[^.]*colou?r[^.]*brand/i);
  // both of common.tone's colours: its edge default is a dark brown that tints a technical film's corners (final review #3)
  expect(b.prompt).toMatch(/common\.tone[^.]*\bcolor\b[^.]*\bedge\b[^.]*brand/i);
  expect(b.styles.find((s) => s.id === 'cinemascope')!.prompt).toMatch(/common\.tone[^.]*\bcolor\b[^.]*\bedge\b/i);
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
