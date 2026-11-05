// ElevenLabs: online voices through its HTTP API, with character times (the with-timestamps endpoint), so no transcription is needed.
// The key comes from ELEVENLABS_API_KEY, else `keys.elevenlabs` in tellcut/sources.local.json (git ignores it); it is never written anywhere.
import { rmSync, writeFileSync } from 'node:fs';
import { ffmpeg, probeDuration } from '../ffmpeg.ts';
import { loadSourcesConfig } from '../sources/config.ts';
import type { ProviderStatus, TtsProvider, TtsWord } from './types.ts';

const API = 'https://api.elevenlabs.io/v1';
export const ELEVENLABS_KEY_ENV = 'ELEVENLABS_API_KEY';
/** "George", the premade voice of ElevenLabs' own quickstart: every account may use it */
export const ELEVENLABS_DEFAULT_VOICE = 'JBFqnCBsd6RMkjVDRZzb';
/** speaks Mandarin, English, Japanese … and gives character times */
export const ELEVENLABS_DEFAULT_MODEL = 'eleven_multilingual_v2';
const HOW_TO_KEY = `把 key 放進 tellcut/sources.local.json 的 "keys": { "elevenlabs": "…" }，或設環境變數 ${ELEVENLABS_KEY_ENV}（key 在 elevenlabs.io 的設定 › API Keys 建立）`;

export interface ElevenLabsOptions { voice?: string; model?: string; voices?: string[] }
export interface ElevenLabsDeps { fetch?: typeof fetch; key?: () => string | undefined }

/** The key: the environment first, then sources.local.json (a broken local file is no key, not a crash). */
export function elevenLabsKey(env: NodeJS.ProcessEnv = process.env): string | undefined {
  if (env[ELEVENLABS_KEY_ENV]) return env[ELEVENLABS_KEY_ENV];
  try { return loadSourcesConfig().keys.elevenlabs || undefined; } catch { return undefined; }
}

/** Tellcut's rate (percent faster) as ElevenLabs' speed, kept inside the 0.7–1.2 it accepts. */
export const elevenSpeed = (rate: number) => +Math.min(1.2, Math.max(0.7, 1 + rate / 100)).toFixed(3);

const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const PUNCT_ONLY = /^[\p{P}\p{S}]+$/u;
const FULL_WIDTH = /[　-〿＀-￯]/;
export interface Alignment { characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[] }
/** Words from character times: a Chinese/Japanese/Korean character is a word of its own, other letters run until a space; marks alone are dropped. */
export function wordsFromAlignment(a: Alignment): TtsWord[] {
  const out: TtsWord[] = [];
  let cur: { text: string; start: number; end: number } | null = null;
  const flush = () => { if (cur && !PUNCT_ONLY.test(cur.text)) out.push({ text: cur.text, start: +cur.start.toFixed(3), end: +cur.end.toFixed(3) }); cur = null; };
  a.characters.forEach((ch, i) => {
    const start = a.character_start_times_seconds[i] ?? 0, end = a.character_end_times_seconds[i] ?? start;
    // a space or a full-width mark (，。「」…) ends a word and is not part of one
    if (/\s/.test(ch) || (FULL_WIDTH.test(ch) && PUNCT_ONLY.test(ch))) return flush();
    if (CJK.test(ch)) { flush(); cur = { text: ch, start, end }; return flush(); }
    if (cur) { cur.text += ch; cur.end = end; } else cur = { text: ch, start, end };
  });
  flush();
  return out;
}

/** ElevenLabs' error as one line, without the key: { detail: { message } }, { detail: "…" } or the raw text. */
async function failure(res: Response): Promise<Error> {
  const body = await res.text().catch(() => '');
  let msg = body.slice(0, 200);
  try {
    const d = (JSON.parse(body) as { detail?: unknown }).detail;
    msg = typeof d === 'string' ? d : (d as { message?: string })?.message ?? (Array.isArray(d) ? JSON.stringify(d).slice(0, 200) : msg);
  } catch { /* not JSON: the text itself */ }
  const hint = res.status === 401 ? '（key 不對或沒有這個權限）' : res.status === 402 ? '（要付費方案，或額度用完了）' : res.status === 429 ? '（太頻繁，稍後再試）' : '';
  return new Error(`ElevenLabs 回 ${res.status}${hint}：${msg}`);
}

export function elevenLabsTts(options: ElevenLabsOptions = {}, deps: ElevenLabsDeps = {}): TtsProvider {
  const doFetch = deps.fetch ?? fetch, getKey = deps.key ?? (() => elevenLabsKey());
  const defaultVoice = options.voice ?? ELEVENLABS_DEFAULT_VOICE, model = options.model ?? ELEVENLABS_DEFAULT_MODEL;
  return {
    id: 'elevenlabs', label: 'ElevenLabs（線上語音，要 API key）', online: true,
    voices: () => [...new Set([defaultVoice, ...(options.voices ?? [])])], defaultVoice,
    async check(): Promise<ProviderStatus> {
      const key = getKey();
      if (!key) return { ok: false, detail: '沒有 API key', install: HOW_TO_KEY };
      try {
        const res = await doFetch(`${API}/models`, { headers: { 'xi-api-key': key } });
        if (!res.ok) {
          const err = (await failure(res)).message;
          // a key restricted to text-to-speech may not list the models, but ElevenLabs has accepted it: that is all this check asks
          if (res.status === 401 && /missing the permission/i.test(err)) return { ok: true, detail: `聲音 ${defaultVoice}、模型 ${model}；key 有效（只開了部分權限）；要連網，用的是 ElevenLabs 帳號的額度` };
          return { ok: false, detail: err, install: HOW_TO_KEY };
        }
        return { ok: true, detail: `聲音 ${defaultVoice}、模型 ${model}；要連網，用的是 ElevenLabs 帳號的額度` };
      } catch (e) { return { ok: false, detail: `連不上 ElevenLabs：${(e as Error).message.slice(0, 120)}` }; }
    },
    async synth(req) {
      const key = getKey();
      if (!key) throw new Error(`ElevenLabs 沒有 API key：${HOW_TO_KEY}`);
      const body: Record<string, unknown> = { text: req.text, model_id: model };
      if (req.rate) body.voice_settings = { speed: elevenSpeed(req.rate) };
      const res = await doFetch(`${API}/text-to-speech/${encodeURIComponent(req.voice ?? defaultVoice)}/with-timestamps?output_format=mp3_44100_128`, {
        method: 'POST', headers: { 'xi-api-key': key, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: req.signal,
      });
      if (!res.ok) throw await failure(res);
      const data = await res.json() as { audio_base64?: string; alignment?: Alignment | null };
      if (!data.audio_base64) throw new Error('ElevenLabs 沒有回傳聲音');
      const mp3 = `${req.out}.mp3`;
      try {
        writeFileSync(mp3, Buffer.from(data.audio_base64, 'base64'));
        await ffmpeg(['-i', mp3, '-ac', '1', '-ar', '24000', '-c:a', 'pcm_s16le', req.out], { signal: req.signal });
      } finally { rmSync(mp3, { force: true }); }
      const dur = +(await probeDuration(req.out)).toFixed(3);
      // without character times the caller times the words from a transcript of the audio
      const words = data.alignment?.characters?.length ? wordsFromAlignment(data.alignment) : null;
      return { dur, words };
    },
  };
}
