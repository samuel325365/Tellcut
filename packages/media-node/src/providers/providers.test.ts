import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createProviders, DEFAULT_PROVIDERS, fakeTranscribe, fakeTts, loadProvidersConfig, ProvidersConfigZ, PROVIDERS_FILE, TTS_FACTORIES } from './index.ts';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'prov-')); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

test('a missing providers.json means the defaults; a good one is read; a broken one says why', () => {
  expect(loadProvidersConfig(join(dir, 'none.json'))).toEqual(DEFAULT_PROVIDERS);
  const f = join(dir, 'p.json');
  writeFileSync(f, JSON.stringify({ tts: { use: 'fake' }, transcribe: { use: 'fake', options: { fake: { x: 1 } } } }));
  expect(loadProvidersConfig(f)).toEqual({ tts: { use: 'fake', options: {} }, transcribe: { use: 'fake', options: { fake: { x: 1 } } }, ocr: DEFAULT_PROVIDERS.ocr, faces: DEFAULT_PROVIDERS.faces });
  writeFileSync(f, '{ nope');
  expect(() => loadProvidersConfig(f)).toThrow('不是合法的 JSON');
  writeFileSync(f, JSON.stringify({ tts: { use: '' }, transcribe: { use: 'x' } }));
  expect(() => loadProvidersConfig(f)).toThrow('tts.use');
});

test('the providers.json in the repo is valid and names providers that exist', () => {
  const c = loadProvidersConfig(PROVIDERS_FILE);
  expect(JSON.parse(readFileSync(PROVIDERS_FILE, 'utf8')).tts.use).toBe(c.tts.use);
  expect(c.transcribe.use).toBe('faster-whisper');
});

test('createProviders builds what the config names, and an unknown name is a sentence, not a crash later', () => {
  const p = createProviders(ProvidersConfigZ.parse({ tts: { use: 'fake', options: {} }, transcribe: { use: 'fake', options: {} } }));
  expect([p.tts.id, p.transcribe.id]).toEqual(['fake', 'fake']);
  const odd = createProviders(ProvidersConfigZ.parse({ tts: { use: 'nope', options: {} }, transcribe: { use: 'fake', options: {} } }));
  expect(odd.transcribe.id).toBe('fake');                     // the broken one does not get in the way of the other
  expect(() => odd.tts).toThrow('tts 用「nope」');
  expect(Object.keys(TTS_FACTORIES)).toContain('fake');
});

test('the fake tts gives a wav of the right length with word times; without word times it says so; the fake transcribe writes a transcript', async () => {
  const out = join(dir, 'a.wav'), t = fakeTts();
  const r = await t.synth({ text: '你好 世界', out });
  expect(r.dur).toBeCloseTo(4 * 0.18, 2);
  expect(r.words!.map((w) => w.text)).toEqual(['你', '好', '世', '界']);
  expect(r.words![3].end).toBeCloseTo(r.dur, 2);
  expect(readFileSync(out).subarray(0, 4).toString()).toBe('RIFF');
  expect((await fakeTts({ words: false }).synth({ text: '嗨', out })).words).toBeNull();
  expect((await fakeTts({ ok: false }).check()).ok).toBe(false);
  const tr = fakeTranscribe('哈囉'), f = join(dir, 't.json');
  await tr.transcribe('x.mp4', f);
  expect(JSON.parse(readFileSync(f, 'utf8')).segments[0].text).toBe('哈囉');
  expect(tr.calls).toEqual(['x.mp4']);
});
