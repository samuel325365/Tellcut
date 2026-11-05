import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run as ff } from '../ffmpeg.ts';
import { ELEVENLABS_DEFAULT_VOICE, elevenLabsKey, elevenLabsTts, elevenSpeed, wordsFromAlignment } from './elevenlabs.ts';
import { TTS_FACTORIES } from './index.ts';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'eleven-')); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const align = (text: string, step = 0.1) => {
  const characters = [...text];
  return { characters, character_start_times_seconds: characters.map((_, i) => +(i * step).toFixed(3)), character_end_times_seconds: characters.map((_, i) => +((i + 1) * step).toFixed(3)) };
};

test('words from character times: one word per Chinese character, English runs to a space, marks alone dropped', () => {
  expect(wordsFromAlignment(align('你好，world!'))).toEqual([
    { text: '你', start: 0, end: 0.1 }, { text: '好', start: 0.1, end: 0.2 }, { text: 'world!', start: 0.3, end: 0.9 },
  ]);
  expect(wordsFromAlignment(align('Node.js is ok')).map((w) => w.text)).toEqual(['Node.js', 'is', 'ok']);
  expect(wordsFromAlignment(align('「』 。'))).toEqual([]);
});

test('speed: Tellcut percent to ElevenLabs speed, kept inside 0.7–1.2', () => {
  expect([elevenSpeed(8), elevenSpeed(-10), elevenSpeed(50), elevenSpeed(-60)]).toEqual([1.08, 0.9, 1.2, 0.7]);
});

test('synth: posts to with-timestamps with the key header, turns the mp3 into a wav and maps character times', async () => {
  const mp3 = join(dir, 'src.mp3');
  await ff(['-f', 'lavfi', '-i', 'sine=frequency=440:duration=1.2', '-c:a', 'libmp3lame', mp3]);
  const seen: Array<{ url: string; init: RequestInit }> = [];
  const fakeFetch = async (url: string, init: RequestInit) => {
    seen.push({ url, init });
    return new Response(JSON.stringify({ audio_base64: readFileSync(mp3).toString('base64'), alignment: align('你好 hi') }), { status: 200 });
  };
  const p = elevenLabsTts({ voice: 'v123', model: 'eleven_v3' }, { fetch: fakeFetch as never, key: () => 'sk-test' });
  const out = join(dir, 'a.wav'), r = await p.synth({ text: '你好 hi', rate: 10, out });
  expect(seen[0].url).toBe('https://api.elevenlabs.io/v1/text-to-speech/v123/with-timestamps?output_format=mp3_44100_128');
  expect((seen[0].init.headers as Record<string, string>)['xi-api-key']).toBe('sk-test');
  expect(JSON.parse(seen[0].init.body as string)).toEqual({ text: '你好 hi', model_id: 'eleven_v3', voice_settings: { speed: 1.1 } });
  expect(r.words!.map((w) => w.text)).toEqual(['你', '好', 'hi']);
  expect(r.dur).toBeGreaterThan(1.1);
  expect(r.dur).toBeLessThan(1.5);
  expect(readFileSync(out).subarray(0, 4).toString()).toBe('RIFF');
  // a scene's own voice wins; no rate means no voice_settings (the voice keeps its own)
  await p.synth({ text: 'x', voice: 'other', out: join(dir, 'b.wav') });
  expect(seen[1].url).toContain('/text-to-speech/other/');
  expect(JSON.parse(seen[1].init.body as string).voice_settings).toBeUndefined();
});

test('without character times the words are null (the caller transcribes); an API error is one line without the key', async () => {
  const mp3 = join(dir, 'src.mp3');
  await ff(['-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.5', '-c:a', 'libmp3lame', mp3]);
  const ok = async () => new Response(JSON.stringify({ audio_base64: readFileSync(mp3).toString('base64'), alignment: null }), { status: 200 });
  expect((await elevenLabsTts({}, { fetch: ok as never, key: () => 'k' }).synth({ text: 'x', out: join(dir, 'c.wav') })).words).toBeNull();
  const bad = async () => new Response(JSON.stringify({ detail: { status: 'invalid_api_key', message: 'Invalid API key' } }), { status: 401 });
  const err = await elevenLabsTts({}, { fetch: bad as never, key: () => 'sk-secret' }).synth({ text: 'x', out: join(dir, 'd.wav') }).catch((e: Error) => e);
  expect((err as Error).message).toMatch(/401.*Invalid API key/);
  expect((err as Error).message).not.toContain('sk-secret');
});

test('check: no key says where to put one without calling out; a key is tried against the models list', async () => {
  let calls = 0;
  const fakeFetch = async () => { calls++; return new Response('[]', { status: 200 }); };
  const none = await elevenLabsTts({}, { fetch: fakeFetch as never, key: () => undefined }).check();
  expect([none.ok, calls, none.install?.includes('sources.local.json')]).toEqual([false, 0, true]);
  await expect(elevenLabsTts({}, { key: () => undefined }).synth({ text: 'x', out: join(dir, 'e.wav') })).rejects.toThrow('沒有 API key');
  const yes = await elevenLabsTts({}, { fetch: fakeFetch as never, key: () => 'k' }).check();
  expect([yes.ok, calls]).toEqual([true, 1]);
  // a key with only the text-to-speech permission is accepted but may not list models: still a working key
  const narrow = async () => new Response(JSON.stringify({ detail: { status: 'missing_permissions', message: 'The API key you used is missing the permission models_read to execute this operation.' } }), { status: 401 });
  expect((await elevenLabsTts({}, { fetch: narrow as never, key: () => 'k' }).check()).ok).toBe(true);
  const wrong = async () => new Response(JSON.stringify({ detail: { status: 'invalid_api_key', message: 'Invalid API key' } }), { status: 401 });
  expect((await elevenLabsTts({}, { fetch: wrong as never, key: () => 'k' }).check()).ok).toBe(false);
  const p = elevenLabsTts({ voices: ['a', 'b'] });
  expect([p.defaultVoice, p.voices()]).toEqual([ELEVENLABS_DEFAULT_VOICE, [ELEVENLABS_DEFAULT_VOICE, 'a', 'b']]);
  expect(Object.keys(TTS_FACTORIES)).toContain('elevenlabs');
});

test('the key: the environment variable first', () => {
  expect(elevenLabsKey({ ELEVENLABS_API_KEY: 'from-env' })).toBe('from-env');
});
