// ElevenLabs: online voices through its HTTP API, with character times (the with-timestamps endpoint), so no transcription is needed.
// The key comes from ELEVENLABS_API_KEY, else `keys.elevenlabs` in tellcut/sources.local.json (git ignores it); it is never written anywhere.
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { ffmpeg, probeDuration } from '../ffmpeg.ts';
import { renameRetry, replaceFile } from '../fsutil.ts';
import { loadSourcesConfig } from '../sources/config.ts';
import type { ProviderStatus, TtsProvider, TtsWord } from './types.ts';

const API = 'https://api.elevenlabs.io/v1';
export const ELEVENLABS_KEY_ENV = 'ELEVENLABS_API_KEY';
/** "George", the premade voice of ElevenLabs' own quickstart: every account may use it */
export const ELEVENLABS_DEFAULT_VOICE = 'JBFqnCBsd6RMkjVDRZzb';
/** speaks Mandarin, English, Japanese … and gives character times */
export const ELEVENLABS_DEFAULT_MODEL = 'eleven_multilingual_v2';
const HOW_TO_KEY = `把 key 放進 tellcut/sources.local.json 的 "keys": { "elevenlabs": "…" }，或設環境變數 ${ELEVENLABS_KEY_ENV}（key 在 elevenlabs.io 的設定 › API Keys 建立）`;
const HOW_TO_KEY_EN = `put the key in tellcut/sources.local.json as "keys": { "elevenlabs": "…" }, or set ${ELEVENLABS_KEY_ENV} (make one at elevenlabs.io: Settings › API Keys)`;

export interface ElevenLabsOptions { voice?: string; model?: string; voices?: string[] }
/** ms: the key check (doctor, the providers route) and one spoken scene (a long one takes ElevenLabs a while) */
export const ELEVENLABS_TIMEOUTS = { check: 15_000, synth: 90_000 };
export interface ElevenLabsDeps { fetch?: typeof fetch; key?: () => string | undefined; timeouts?: Partial<typeof ELEVENLABS_TIMEOUTS> }

interface Paid { audio_base64?: string; alignment?: Alignment | null }
/** where a received result waits until its wav is made (next to the scene's wav; removed once the wav is in place) */
export const elevenLabsPaidFile = (out: string) => `${out}.elevenlabs.json`;
/** the kept result of the very same request (url and body: voice, model, text, speed), else null */
function readPaid(file: string, ask: string): Paid | null {
  try {
    const p = JSON.parse(readFileSync(file, 'utf8')) as Paid & { ask?: string };
    return p.ask === ask && p.audio_base64 ? p : null;
  } catch { return null; }
}

/** The key: the environment first, then sources.local.json (a broken local file is no key, not a crash). */
export function elevenLabsKey(env: NodeJS.ProcessEnv = process.env): string | undefined {
  if (env[ELEVENLABS_KEY_ENV]) return env[ELEVENLABS_KEY_ENV];
  try { return loadSourcesConfig().keys.elevenlabs || undefined; } catch { return undefined; }
}

/** Tellcut's rate (percent faster) as ElevenLabs' speed, kept inside the 0.7–1.2 it accepts. */
export const elevenSpeed = (rate: number) => +Math.min(1.2, Math.max(0.7, 1 + rate / 100)).toFixed(3);

// letters only, by script (as check's rules.ts counts them): plugin-common words.ts's CJK also takes full-width marks, which here
// end a word instead of being one
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

/** ElevenLabs' error as one line, without the key: { detail: { message } }, { detail: "…" } or the raw text; `en` for doctor. */
async function failureText(res: Response): Promise<{ zh: string; en: string }> {
  const body = await res.text().catch(() => '');
  let msg = body.slice(0, 200);
  try {
    const d = (JSON.parse(body) as { detail?: unknown }).detail;
    msg = typeof d === 'string' ? d : (d as { message?: string })?.message ?? (Array.isArray(d) ? JSON.stringify(d).slice(0, 200) : msg);
  } catch { /* not JSON: the text itself */ }
  const hint = res.status === 401 ? '（key 不對或沒有這個權限）' : res.status === 402 ? '（要付費方案，或額度用完了）' : res.status === 429 ? '（太頻繁，稍後再試）' : '';
  const hintEn = res.status === 401 ? ' (a wrong key, or one without this permission)' : res.status === 402 ? ' (a paid plan is needed, or the credits ran out)' : res.status === 429 ? ' (too often: try again later)' : '';
  return { zh: `ElevenLabs 回 ${res.status}${hint}：${msg}`, en: `ElevenLabs answered ${res.status}${hintEn}: ${msg}` };
}
const failure = async (res: Response) => new Error((await failureText(res)).zh);

export function elevenLabsTts(options: ElevenLabsOptions = {}, deps: ElevenLabsDeps = {}): TtsProvider {
  const doFetch = deps.fetch ?? fetch, getKey = deps.key ?? (() => elevenLabsKey()), timeouts = { ...ELEVENLABS_TIMEOUTS, ...deps.timeouts };
  const defaultVoice = options.voice ?? ELEVENLABS_DEFAULT_VOICE, model = options.model ?? ELEVENLABS_DEFAULT_MODEL;
  return {
    id: 'elevenlabs', label: 'ElevenLabs（線上語音，要 API key）', online: true,
    voices: () => [...new Set([defaultVoice, ...(options.voices ?? [])])], defaultVoice,
    async check(): Promise<ProviderStatus> {
      const key = getKey();
      if (!key) return { ok: false, detail: '沒有 API key', install: HOW_TO_KEY, en: { detail: 'no API key', install: HOW_TO_KEY_EN } };
      try {
        // doctor, the providers route and voice all wait on this: a stalled connection is "can't reach", not a hang
        const res = await doFetch(`${API}/models`, { headers: { 'xi-api-key': key }, signal: AbortSignal.timeout(timeouts.check) });
        if (!res.ok) {
          const err = await failureText(res);
          // a key restricted to text-to-speech may not list the models, but ElevenLabs has accepted it: that is all this check asks
          if (res.status === 401 && /missing the permission/i.test(err.zh)) return { ok: true, detail: `聲音 ${defaultVoice}、模型 ${model}；key 有效（只開了部分權限）；要連網，用的是 ElevenLabs 帳號的額度`,
            en: { detail: `voice ${defaultVoice}, model ${model}; the key works (with some permissions only); online, on the ElevenLabs account's credits` } };
          return { ok: false, detail: err.zh, install: HOW_TO_KEY, en: { detail: err.en, install: HOW_TO_KEY_EN } };
        }
        return { ok: true, detail: `聲音 ${defaultVoice}、模型 ${model}；要連網，用的是 ElevenLabs 帳號的額度`, en: { detail: `voice ${defaultVoice}, model ${model}; online, on the ElevenLabs account's credits` } };
      } catch (e) {
        const timedOut = (e as Error)?.name === 'TimeoutError', secs = Math.round(timeouts.check / 1000), msg = (e as Error).message.slice(0, 120);
        return { ok: false, detail: `連不上 ElevenLabs：${timedOut ? `${secs} 秒沒有回應` : msg}`, en: { detail: `cannot reach ElevenLabs: ${timedOut ? `no answer in ${secs} s` : msg}` } };
      }
    },
    async synth(req) {
      const key = getKey();
      if (!key) throw new Error(`ElevenLabs 沒有 API key：${HOW_TO_KEY}`);
      const body: Record<string, unknown> = { text: req.text, model_id: model };
      if (req.rate) body.voice_settings = { speed: elevenSpeed(req.rate) };
      const url = `${API}/text-to-speech/${encodeURIComponent(req.voice ?? defaultVoice)}/with-timestamps?output_format=mp3_44100_128`;
      const payload = JSON.stringify(body), ask = `${url}\n${payload}`, paid = elevenLabsPaidFile(req.out);
      // every request is billed, so a failure is never retried here, and a result received but not yet turned into the wav is
      // kept: the next run of the same request uses it instead of paying again
      let data = readPaid(paid, ask);
      if (!data) {
        // a stalled connection must not hang voice for ever; the caller's own abort still counts
        const signal = req.signal ? AbortSignal.any([req.signal, AbortSignal.timeout(timeouts.synth)]) : AbortSignal.timeout(timeouts.synth);
        try {
          const res = await doFetch(url, { method: 'POST', headers: { 'xi-api-key': key, 'Content-Type': 'application/json' }, body: payload, signal });
          if (!res.ok) throw await failure(res);
          data = await res.json() as Paid;
        } catch (e) {
          if ((e as Error)?.name === 'TimeoutError') throw new Error(`ElevenLabs ${Math.round(timeouts.synth / 1000)} 秒沒有回應，已放棄（不會自動重試；稍後再跑一次）`);
          throw e;
        }
        if (!data.audio_base64) throw new Error('ElevenLabs 沒有回傳聲音');
        replaceFile(paid, JSON.stringify({ ask, audio_base64: data.audio_base64, alignment: data.alignment ?? null }));
      }
      // this process's own temp names, the wav renamed into place only when whole: an interrupted run never leaves half a wav
      // that the scene's .json (written after) still calls up to date
      const mp3 = `${req.out}.${process.pid}.tmp.mp3`, wav = `${req.out}.${process.pid}.tmp.wav`;
      let dur: number;
      try {
        writeFileSync(mp3, Buffer.from(data.audio_base64!, 'base64'));
        await ffmpeg(['-i', mp3, '-ac', '1', '-ar', '24000', '-c:a', 'pcm_s16le', wav], { signal: req.signal });
        dur = +(await probeDuration(wav)).toFixed(3);
        renameRetry(wav, req.out);
      } catch (e) {
        if (req.signal?.aborted) throw e;
        throw new Error(`ElevenLabs 的聲音收到了，但轉成 wav 失敗（收到的留在 ${basename(paid)}，同樣的句子再跑一次會直接用它、不再計費）：${(e as Error).message.slice(0, 200)}`);
      } finally { rmSync(mp3, { force: true }); rmSync(wav, { force: true }); }
      rmSync(paid, { force: true });
      // without character times the caller times the words from a transcript of the audio
      const words = data.alignment?.characters?.length ? wordsFromAlignment(data.alignment) : null;
      return { dur, words };
    },
  };
}
