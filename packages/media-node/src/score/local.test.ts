import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { generateScore, inKey, loadAllStyles, loadStyles, parseKey, SCORE_LIBRARY } from './index.ts';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'styles-')); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const STYLE = (id: string, extra = '') => `export default {
  id: '${id}', label: '測試風格', doc: '一行說明', defaults: { bpm: 96, key: 'Dm' }, swing: 0.05,
  build(ctx) {
    const out = [];
    for (let b = 0; b < ctx.bars; b++) {
      const end = ctx.role(b) === 'end';
      ctx.chordOn(1 + (b % 4), { octave: 4 }).forEach((m, k) => out.push({ t: ctx.at(b, k * 0.5), inst: 'glass', midi: m, dur: ctx.beat, vel: 0.7, pan: 0 }));
      if (!end) out.push({ t: ctx.at(b, 0), inst: 'kick', vel: 0.9, pan: 0 });
      if (!end && ctx.rng() < 0.5) out.push({ t: ctx.at(b, 3), inst: 'hat', vel: 0.4, pan: 0.2 });
    }
    return out;
  },
  voices: { glass: (sr, r, e, synth) => synth.bell(sr, 440 * 2 ** ((e.midi - 69) / 12), e.dur ?? 0.5, 0.8) },
  ${extra}
};\n`;

test('a style file with its own instrument loads, plays in its key, and renders through its own voice', async () => {
  writeFileSync(join(dir, 'glassy.js'), STYLE('glassy'));
  const l = await loadStyles([dir]);
  expect(l.errors).toEqual([]);
  expect(Object.keys(l.styles)).toEqual(['glassy']);
  const s = generateScore({ style: 'glassy', styles: l.styles, length: 10, seed: 2 });
  expect(s.events.filter((e) => e.inst === 'glass').every((e) => inKey(parseKey('Dm'), e.midi!))).toBe(true);
  let peak = 0;
  for (const v of s.L) peak = Math.max(peak, Math.abs(v));
  expect(peak).toBeGreaterThan(0.2);
  expect(s.info.style).toBe('glassy');
});

test('what is wrong is said per file, and the good files still load', async () => {
  writeFileSync(join(dir, 'a-good.js'), STYLE('fine'));
  writeFileSync(join(dir, 'b-builtin.js'), STYLE('lofi'));
  writeFileSync(join(dir, 'c-badid.js'), STYLE('Bad Id'));
  writeFileSync(join(dir, 'd-tempo.js'), STYLE('slow').replace('bpm: 96', 'bpm: 20'));
  writeFileSync(join(dir, 'e-key.js'), STYLE('nokey').replace("key: 'Dm'", "key: 'H'"));
  writeFileSync(join(dir, 'f-chance.js'), STYLE('chancy').replace('ctx.rng() < 0.5', 'Math.random() < 0.5'));
  writeFileSync(join(dir, 'g-broken.js'), 'export default { id: ');
  writeFileSync(join(dir, 'h-silent.js'), STYLE('silent').replace('return out;', 'return [];'));
  writeFileSync(join(dir, 'i-nodoc.js'), STYLE('undoc').replace("doc: '一行說明', ", ''));
  writeFileSync(join(dir, 'j-voices.js'), STYLE('badvoice', "voices: { glass: 3 },").replace(/  voices: \{ glass: \(sr[^\n]*\n/, ''));
  const l = await loadStyles([dir]);
  expect(Object.keys(l.styles).sort()).toEqual(['fine', 'undoc']);
  const why = (f: string) => l.errors.find((e) => e.file.endsWith(f))?.message ?? '';
  expect(why('b-builtin.js')).toContain('已經有人用了');
  expect(why('c-badid.js')).toContain('小寫英文');
  expect(why('d-tempo.js')).toContain('40–200');
  expect(why('e-key.js')).toContain('看不懂調性');
  expect(why('f-chance.js')).toContain('ctx.rng');
  expect(why('g-broken.js')).toContain('載入失敗');
  expect(why('h-silent.js')).toContain('沒有產生任何音符');
  expect(why('j-voices.js')).toContain('voices');
  expect(l.warnings.map((w) => w.message)).toEqual(['undoc 沒有 doc（風格清單裡看不到它適合什麼）']);
});

test('a project style cannot take an id the library already has; the library folder is where loadAllStyles looks first', async () => {
  const lib = join(dir, 'lib'), proj = join(dir, 'proj');
  mkdirSync(lib); mkdirSync(proj);
  writeFileSync(join(lib, 'shared.js'), STYLE('shared'));
  writeFileSync(join(proj, 'shared.js'), STYLE('shared'));
  const l = await loadStyles([lib, proj]);
  expect(Object.keys(l.styles)).toEqual(['shared']);
  expect(l.styles.shared.file.startsWith(lib)).toBe(true);
  expect(l.errors[0].message).toContain('已經有人用了');
  expect(SCORE_LIBRARY.replace(/\\/g, '/')).toMatch(/tellcut\/score-library$/);
});

test('every style in the shared library passes the same checks as the built-in ones', async () => {
  const l = await loadAllStyles();
  expect(l.errors).toEqual([]);
  for (const s of Object.values(l.styles)) {
    const score = generateScore({ style: s.id, styles: l.styles, length: 12, seed: 1 });
    const key = parseKey(s.defaults.key), own = s.scale && new Set(s.scale.map((n) => (key.root + n) % 12));
    const fits = (m: number) => (own ? own.has(((m % 12) + 12) % 12) : inKey(key, m));
    expect(score.events.filter((e) => e.midi !== undefined && e.inst !== 'sub').every((e) => fits(e.midi!)), s.id).toBe(true);
    expect(Math.abs(score.L[score.L.length - 1]), s.id).toBeLessThan(1e-3);
  }
});

test('library: mischief lays its sections back from the end at any length; garden-folk has no fixed sound-effect times', async () => {
  const l = await loadAllStyles();
  for (const bars of [3, 6, 9, 12, 17, 24]) {
    const s = generateScore({ style: 'mischief', styles: l.styles, length: bars * 2, seed: 1 });
    expect(s.events.length, String(bars)).toBeGreaterThan(0);
  }
  // 17 bars of 2 s (120 bpm): the boom is bar 14, as the baking-sin cut planned it
  const s17 = generateScore({ style: 'mischief', styles: l.styles, length: 34, bpm: 120, seed: 1 });
  expect(s17.events.some((e) => e.inst === 'openHat' && Math.abs(e.t - 28) < 1e-6)).toBe(true);
  const g = generateScore({ style: 'garden-folk', styles: l.styles, length: 20, seed: 1 });
  expect(g.events.some((e) => ['rustle', 'tick', 'thump'].includes(e.inst))).toBe(false);
});

test('library: rail-beat lays out its sections by the bar count (16 bars = the uk-beat plan); postcard-felt fits any length', async () => {
  const { railPlan } = await import(pathToFileURL(join(SCORE_LIBRARY, 'rail-beat.js')).href);
  expect(railPlan(16).join(' ')).toBe('open arc g1 g1 food g1fill jump g2fill jump g2 g3 g3 g3 build break end');
  for (const bars of [1, 2, 3, 5, 8, 12, 20, 33]) {
    const plan: string[] = railPlan(bars);
    expect(plan.length, String(bars)).toBe(bars);
    expect(plan[bars - 1]).toBe('end');
    if (bars >= 8) expect(plan.filter((x) => x === 'jump').length, String(bars)).toBeGreaterThan(0);
  }
  const l = await loadAllStyles();
  for (const bars of [4, 9, 16, 24]) {
    const s = generateScore({ style: 'rail-beat', styles: l.styles, length: bars * 2, bpm: 120, seed: 3 });
    // the closing hit: a kick and a crash on the downbeat of the last bar
    expect(s.events.some((e) => e.inst === 'crash' && Math.abs(e.t - (bars - 1) * 2) < 1e-6), String(bars)).toBe(true);
  }
  const f = generateScore({ style: 'postcard-felt', styles: l.styles, length: 47, seed: 1 });
  expect(f.events.some((e) => e.inst === 'felt')).toBe(true);
});

test('library: queue-call rings its ding-dong where sections start (no fixed times) and hits the bar before the close; receipt-hop fits any length', async () => {
  const l = await loadAllStyles();
  for (const bars of [3, 8, 13, 20]) {
    const s = generateScore({ style: 'queue-call', styles: l.styles, length: bars * 2.4, bpm: 100, seed: 1 });
    const bar = 2.4, dings = s.events.filter((e) => e.inst === 'dingdong' && e.vel === 1).map((e) => Math.round(e.t / bar));
    expect(dings.length, String(bars)).toBeGreaterThan(0);
    // every ding sits on a downbeat that starts a section: after the intro or after a fill
    for (const b of dings) expect(['intro', 'fill', undefined]).toContain(b > 0 ? s.info.roles[b - 1] : undefined);
    expect(s.events.some((e) => e.inst === 'tom' && e.vel === 0.8 && Math.round(e.t / bar) === s.info.bars - 2), String(bars)).toBe(true);
  }
  const r = generateScore({ style: 'receipt-hop', styles: l.styles, length: 41, seed: 1 });
  expect(r.events.some((e) => e.inst === 'till')).toBe(true);
});

test('library: quote-drop lays its punchline out by the bar count (14 bars = the podcast-quote cut) and goes quiet before it', async () => {
  const { quoteDropPlan } = await import(pathToFileURL(join(SCORE_LIBRARY, 'quote-drop.js')).href);
  expect(quoteDropPlan(14)).toEqual({ hook: 0, hush: 7, hit: 8, turn: 9, end: 13 });
  expect(quoteDropPlan(5).hook).toBe(-1);
  const l = await loadAllStyles(), bar = 240 / 84;
  for (const bars of [4, 6, 9, 14, 24]) {
    const s = generateScore({ style: 'quote-drop', styles: l.styles, length: bars * bar, bpm: 84, seed: 1 });
    const P = quoteDropPlan(s.info.bars), hit = P.hit * bar;
    expect(s.events.some((e) => e.inst === 'boom' && Math.abs(e.t - hit) < 1e-6), String(bars)).toBe(true);
    // the half bar before the punchline: only the drone, the riser and the whoosh into the hush
    expect(s.events.filter((e) => e.t > hit - bar / 2 + 0.01 && e.t < hit - 1e-6).every((e) => ['drone', 'riser', 'whoosh'].includes(e.inst)), String(bars)).toBe(true);
    expect(s.events.some((e) => e.inst === 'epiano' && Math.abs(e.t - P.end * bar) < 0.2), String(bars)).toBe(true);
  }
});

test('library: bout-bell rings a round where every section starts (no cue times) and closes on a hit', async () => {
  const l = await loadAllStyles(), bar = 2.4;
  for (const bars of [5, 9, 13, 20]) {
    const s = generateScore({ style: 'bout-bell', styles: l.styles, length: bars * bar, bpm: 100, seed: 1 });
    const rings = s.events.filter((e) => e.inst === 'ring' && e.vel === 0.75).map((e) => Math.round((e.t - 0.08) / bar));
    const starts = s.info.roles.map((r, b) => (b > 0 && r !== 'intro' && r !== 'end' && ['intro', 'fill'].includes(s.info.roles[b - 1]) ? b : -1)).filter((b) => b >= 0);
    expect(rings, String(bars)).toEqual(starts);
    expect(s.events.some((e) => e.inst === 'ring' && Math.abs(e.t - 0.02) < 1e-6)).toBe(true);
    expect(s.events.some((e) => e.inst === 'kick' && e.vel === 1 && Math.abs(e.t - (s.info.bars - 1) * bar) < 1e-6), String(bars)).toBe(true);
  }
});

test('library: the second-round styles fit 4, 12 and 60 bars, close on their last bar and carry no sound effects', async () => {
  const { composeEvents } = await import('./styles.ts');
  const { rng } = await import('./synth.ts');
  const l = await loadAllStyles();
  const SFX = ['scratch', 'stamp', 'stampHit', 'shutter', 'swish', 'page', 'tick', 'crunch', 'flap', 'sizzle', 'pour', 'whoosh'];
  for (const id of ['chiptune', 'guzheng-pop', 'walking-pizz', 'steelpan-bossa', 'funk-minor', 'hijaz-route', 'lullaby-box']) {
    const s = l.styles[id];
    expect(s, id).toBeDefined();
    expect(Object.keys(s.voices ?? {}).filter((v) => SFX.includes(v)), id).toEqual([]);
    for (const bars of [4, 12, 60]) {
      const ev = composeEvents(s, { bpm: s.defaults.bpm, key: s.defaults.key, bars, rng: rng(1) }), bar = 240 / s.defaults.bpm, end = (bars - 1) * bar;
      expect(ev.every((e) => e.t >= 0 && e.t < bars * bar), `${id} ${bars}`).toBe(true);
      expect(ev.filter((e) => Math.abs(e.t - end) < 0.1).length, `${id} ${bars}`).toBeGreaterThanOrEqual(3);
      expect(ev.some((e) => SFX.includes(e.inst)), `${id} ${bars}`).toBe(false);
      // something plays in every bar
      for (let b = 0; b < bars; b++) expect(ev.some((e) => e.t >= b * bar - 1e-6 && e.t < (b + 1) * bar - 1e-6), `${id} ${bars} bar ${b}`).toBe(true);
    }
  }
  // guzheng-pop is written in D but plays in the key asked for
  const g = l.styles['guzheng-pop'], inG = composeEvents(g, { bpm: 96, key: 'G', bars: 12, rng: rng(1) });
  expect(inG.filter((e) => e.midi !== undefined && e.inst !== 'sub').every((e) => inKey(parseKey('G'), e.midi!))).toBe(true);
});

test('library: hijaz-route, lullaby-box and steelpan-bossa lay their sections out by the bar count', async () => {
  const { arrangement } = await import('./styles.ts');
  const { hijazPlan } = await import(pathToFileURL(join(SCORE_LIBRARY, 'hijaz-route.js')).href);
  const { lullabyPlan } = await import(pathToFileURL(join(SCORE_LIBRARY, 'lullaby-box.js')).href);
  const { panPlan } = await import(pathToFileURL(join(SCORE_LIBRARY, 'steelpan-bossa.js')).href);
  const hz = (bars: number) => { const a = arrangement(bars); return hijazPlan(bars, a.role, a.layers) as string[]; };
  expect(hz(4)).toEqual(['sparse', 'sparse', 'sparse', 'end']);
  expect(hz(12)).toEqual(['open', 'open', 'sparse', 'sparse', 'sparse', 'sparse', 'full', 'full', 'full', 'full', 'return', 'end']);
  const h60 = hz(60), hush = h60.indexOf('hush');
  expect(hush / 60).toBeGreaterThan(0.65);
  expect(h60.slice(hush).filter((x) => x === 'hush').length).toBe(6);
  expect(h60.slice(h60.lastIndexOf('hush') + 1, 59).every((x) => x === 'return')).toBe(true);
  expect(h60.includes('rich')).toBe(true);
  // lullaby: the minor part sits in the middle, the breath before the end
  expect(lullabyPlan(4)).toEqual(['warm', 'warm', 'warm', 'end']);
  const n12 = lullabyPlan(12, arrangement(12).role);
  expect(n12).toEqual(['intro', 'intro', 'warm', 'warm', 'minor', 'minor', 'minor', 'glow', 'glow', 'glow', 'breath', 'end']);
  const n60: string[] = lullabyPlan(60, arrangement(60).role), m = n60.indexOf('minor');
  expect(m / 60).toBeGreaterThan(0.3); expect(n60.lastIndexOf('minor') / 60).toBeLessThan(0.56);
  expect(n60.slice(-3)).toEqual(['glow', 'glow', 'end']);
  expect(n60.filter((x) => x === 'breath').length).toBe(4);
  // steelpan: thin for talking, open for an interlude and the last stretch after the climax
  const p4 = panPlan(4), p17 = panPlan(17), p60 = panPlan(60);
  expect(p4.open).toEqual([false, false, true, false]);
  expect(p17.open.slice(p17.climax, 16).every(Boolean)).toBe(true);
  expect(p17.open.slice(1, p17.climax).filter(Boolean).length).toBe(1);
  expect(p60.open.slice(1, p60.climax).filter(Boolean).length).toBe(4);
  expect(p60.open.filter(Boolean).length).toBeLessThan(15);
});

test('a style that names its own scale is checked against it, and a bad scale is refused', async () => {
  writeFileSync(join(dir, 'a-mode.js'), STYLE('modal', 'scale: [0, 1, 4, 5, 7, 8, 10],'));
  writeFileSync(join(dir, 'b-badscale.js'), STYLE('badscale', 'scale: [1, 13],'));
  const l = await loadStyles([dir]);
  expect(l.styles.modal.scale).toEqual([0, 1, 4, 5, 7, 8, 10]);
  expect(l.errors.find((e) => e.file.endsWith('b-badscale.js'))?.message).toContain('scale');
});

test('every style in the library is named in guides/workflow.md, where the page chat and the batch agents read about scores', async () => {
  const { readFileSync } = await import('node:fs');
  const guide = readFileSync(join(SCORE_LIBRARY, '..', 'guides', 'workflow.md'), 'utf8');
  const l = await loadAllStyles();
  expect(Object.keys(l.styles).filter((id) => !guide.includes(`\`${id}\``))).toEqual([]);
});

test('library: candle-glow (katie-sweet16) follows its cues — minor at low, silent at shout, only a pad at quiet — and fits any length without them', async () => {
  const { composeEvents } = await import('./styles.ts');
  const { rng } = await import('./synth.ts');
  const s = (await loadAllStyles()).styles['candle-glow'], bar = 240 / 72;
  expect(s).toBeDefined();
  const cues = { low: 4 * bar, bright: 8 * bar, wait: 12 * bar, shout: 14 * bar, party: 16 * bar, quiet: 20 * bar, tender: 22 * bar };
  const ev = composeEvents(s, { bpm: 72, key: 'D', bars: 26, rng: rng(1), cues });
  const within = (a: number, b: number) => ev.filter((e) => e.t >= a * bar - 1e-6 && e.t < b * bar - 1e-6);
  // low: no plucked pulse and no shaker, and its chords sit on B minor's notes (B D F#) or G (G B D) or F# minor
  expect(within(4, 8).some((e) => e.inst === 'pluck' || e.inst === 'shaker')).toBe(false);
  expect(within(4, 8).some((e) => e.inst === 'sub')).toBe(true);
  // the shout: nothing for 2.4 s, then it plays again before the party cue
  expect(ev.filter((e) => e.t >= cues.shout - 1e-6 && e.t < cues.shout + 2.4 - 1e-6)).toEqual([]);
  // the party grooves (shaker, soft snare); quiet keeps only pad and sub; tender is piano and celesta
  expect(within(16, 20).some((e) => e.inst === 'softSnare')).toBe(true);
  expect(new Set(within(20, 22).map((e) => e.inst))).toEqual(new Set(['pad']));
  expect(within(22, 25).every((e) => e.inst === 'epiano' || e.inst === 'bell')).toBe(true);
  // without cues: every bar plays, the last bar is a rolled chord
  for (const bars of [4, 12, 40]) {
    const plain = composeEvents(s, { bpm: 72, key: 'D', bars, rng: rng(1) }), end = (bars - 1) * bar;
    for (let b = 0; b < bars; b++) expect(plain.some((e) => e.t >= b * bar - 1e-6 && e.t < (b + 1) * bar - 1e-6), `${bars} bar ${b}`).toBe(true);
    expect(plain.filter((e) => e.t >= end - 1e-6).length, String(bars)).toBeGreaterThanOrEqual(5);
  }
});
