// Narration for a project (toolkit phase 3): projects/<id>/narration.json → media/voice/<scene>.wav + <scene>.json.
// The .json keeps the shape the earlier hand-made narrations used: { text, dur, phrases: [{ text, t0, t1 }], words: [{ text, t, d }] },
// so a cut.ts written for them reads it unchanged. Which speech engine speaks is the TtsProvider's business.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import type { TranscribeProvider, TtsProvider, TtsWord } from './providers/types.ts';
import { renameRetry } from './fsutil.ts';

const RateZ = z.union([z.number(), z.string()]).optional();
export const NarrationZ = z.object({
  /** the voice of the edge engine (what earlier narration.json files wrote) */
  voice: z.string().optional(),
  /** voices by engine id ({ edge: 'zh-TW-HsiaoChenNeural', other: 'a-voice-of-another-engine' }): a voice name only means something to its own engine */
  voices: z.record(z.string()).default({}),
  /** speed: a number of percent (8) or the "+8%" an earlier narration.json wrote */
  rate: RateZ,
  /** a pitch shift as the engine writes it (edge: "+5Hz") */
  pitch: z.string().optional(),
  /** same-length homophone swaps for the speech engine only (一行 → 一航); captions keep the written text */
  pron: z.record(z.string()).default({}),
  scenes: z.array(z.object({ id: z.string().regex(/^[\w-]+$/, '場景 id 只能用字母、數字、底線、連字號'), text: z.string().min(1), rate: RateZ, voice: z.string().optional(),
    /** bilingual captions: one translation per caption phrase (phraseParts), shown under it */
    gloss: z.array(z.string()).optional() })).min(1),
}).superRefine((n, ctx) => {
  const seen = new Set<string>();
  n.scenes.forEach((s, i) => { if (seen.has(s.id)) ctx.addIssue({ code: 'custom', path: ['scenes', i, 'id'], message: `場景 id ${s.id} 重複` }); seen.add(s.id); });
  n.scenes.forEach((s, i) => {
    const parts = phraseParts(s.text);
    if (s.gloss && s.gloss.length !== parts.length) ctx.addIssue({ code: 'custom', path: ['scenes', i, 'gloss'],
      message: `${s.id} 的字幕切成 ${parts.length} 句，gloss 有 ${s.gloss.length} 行（一句一行翻譯）：\n${parts.map((p, k) => `${k + 1}. ${p}`).join('\n')}` });
  });
});
export type Narration = z.infer<typeof NarrationZ>;

/** The voice for a scene on an engine: the scene's own, else that engine's entry in `voices`, else (edge only) the old `voice`; absent: the provider's default. */
export function voiceFor(n: Narration, scene: { voice?: string }, engine: string): string | undefined {
  return scene.voice ?? n.voices[engine] ?? (engine === 'edge' ? n.voice : undefined);
}

export interface Phrase { text: string; t0: number; t1: number }
export interface VoiceInfo { text: string; dur: number; phrases: Phrase[]; words: Array<{ text: string; t: number; d: number }>; engine: string; key: string }

export function parseNarration(raw: unknown): Narration {
  const r = NarrationZ.safeParse(raw);
  if (!r.success) throw new Error(`narration.json 的內容不對：${r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('；')}`);
  return r.data;
}

/** "+6%", "-10%", "8" or 8 as a number of percent */
export function ratePercent(rate: number | string | undefined): number {
  if (rate === undefined || rate === '') return 0;
  const n = typeof rate === 'number' ? rate : parseFloat(rate.replace('%', ''));
  return Number.isFinite(n) ? n : 0;
}

// Chinese punctuation always cuts; an English one only before a space or the end, so github.com, 3.5 and Node.js stay whole
const SPLIT = /[，。！？、；：]|——|…+|\.{2,}|[,.!?;:](?=\s|$)/;
// quotes and brackets too: an engine's word text normally leaves them out
const PUNCT = new Set([...'，。！？、；：,.!?;:—…「」『』“”‘’"\'《》〈〉（）()【】']);
const compact = (s: string) => s.replace(/\s+/g, '');
/** The characters of a text a spoken word can hold (no spaces, no punctuation). */
const voiced = (s: string) => [...compact(s)].filter((c) => !PUNCT.has(c));

/** The caption phrases of a text, untimed: cut at punctuation, trimmed, the empty ones left out. */
export const phraseParts = (text: string) => text.split(SPLIT).map((p) => p.trim()).filter(Boolean);

/** Caption phrases: the text cut at punctuation, each timed by the spoken words that make up its characters. */
export function phrasesOf(text: string, words: Array<{ text: string; t: number; d: number }>): Phrase[] {
  const parts = phraseParts(text), out: Phrase[] = [];
  let wi = 0;
  for (const part of parts) {
    // counted the way the words are: a single — or a quote left in would wait for a character no word brings
    const need = voiced(part).length;
    let got = 0, t0: number | null = null, t1 = 0;
    while (wi < words.length && got < need) {
      const w = words[wi++], piece = voiced(w.text);
      if (!piece.length) continue;
      got += piece.length;
      t0 ??= w.t;
      t1 = w.t + w.d;
    }
    if (t0 !== null) out.push({ text: part.trim(), t0: +t0.toFixed(3), t1: +t1.toFixed(3) });
  }
  return out;
}

/**
 * Word times for text whose engine gave none, from a transcript of the audio: the transcript's words are spread over their characters, and the
 * written text is laid on that timeline by position (the two rarely agree character for character, so it is proportional).
 */
export function wordsFromTranscript(text: string, heard: Array<{ start: number; end: number; word: string }>): Array<{ text: string; t: number; d: number }> {
  const chars = voiced(text);
  const line: Array<{ t: number; d: number }> = [];
  for (const w of heard) {
    const n = Math.max(1, voiced(w.word).length), d = (w.end - w.start) / n;
    for (let i = 0; i < n; i++) line.push({ t: w.start + i * d, d });
  }
  if (!line.length || !chars.length) return [];
  return chars.map((c, i) => { const p = line[Math.min(line.length - 1, Math.floor((i / chars.length) * line.length))]; return { text: c, t: +p.t.toFixed(3), d: +p.d.toFixed(3) }; });
}

export const voiceFiles = (dir: string, id: string) => ({ wav: join(dir, 'media', 'voice', `${id}.wav`), info: join(dir, 'media', 'voice', `${id}.json`) });

/** What decides whether a scene's audio is still good: the spoken text, the voice, the speed, the engine and the pitch (only when
 *  set, so the audio made before the pitch counted keeps its key). */
export function sceneKey(spoken: string, voice: string | undefined, rate: number, engine: string, pitch?: string): string {
  return createHash('sha1').update(JSON.stringify([spoken, voice ?? '', rate, engine, ...(pitch ? [pitch] : [])])).digest('hex').slice(0, 12);
}

export interface RenderVoiceOptions {
  dir: string; narration: Narration; tts: TtsProvider;
  /** speech-to-text, used for word times when the engine has none */
  transcribe?: TranscribeProvider;
  only?: string[]; force?: boolean; log?: (s: string) => void; signal?: AbortSignal;
}

/** Speak every scene (or `only`) whose audio is missing or out of date; returns the info of all scenes asked for. */
export async function renderVoice(o: RenderVoiceOptions): Promise<Record<string, VoiceInfo>> {
  const log = o.log ?? (() => {}), out: Record<string, VoiceInfo> = {};
  mkdirSync(join(o.dir, 'media', 'voice'), { recursive: true });
  for (const scene of o.narration.scenes) {
    if (o.only?.length && !o.only.includes(scene.id)) continue;
    const f = voiceFiles(o.dir, scene.id), rate = ratePercent(scene.rate ?? o.narration.rate), voice = voiceFor(o.narration, scene, o.tts.id);
    const spoken = Object.entries(o.narration.pron).reduce((s, [a, b]) => s.split(a).join(b), scene.text);
    const pitch = o.narration.pitch || undefined, key = sceneKey(spoken, voice, rate, o.tts.id, pitch);
    if (!o.force && existsSync(f.wav) && existsSync(f.info)) {
      const old = JSON.parse(readFileSync(f.info, 'utf8')) as VoiceInfo;
      if (old.key === key && old.text === scene.text) { out[scene.id] = old; log(`${scene.id} 沒變，略過`); continue; }
    }
    const r = await o.tts.synth({ text: spoken, voice, rate, pitch, out: f.wav, signal: o.signal });
    let words: TtsWord[] | null = r.words;
    let timed = words?.map((w) => ({ text: w.text, t: w.start, d: +(w.end - w.start).toFixed(3) })) ?? null;
    if (!timed) {
      if (!o.transcribe) throw new Error(`${o.tts.id} 沒有逐字時間，而且沒有可用的逐字稿提供者可以補`);
      const tmp = `${f.info}.heard.json`;
      let heard: Array<{ start: number; end: number; word: string }>;
      try {
        await o.transcribe.transcribe(f.wav, tmp, { signal: o.signal });
        heard = (JSON.parse(readFileSync(tmp, 'utf8')) as { segments: Array<{ words?: Array<{ start: number; end: number; word: string }> }> }).segments.flatMap((s) => s.words ?? []);
      } finally { rmSync(tmp, { force: true }); }
      timed = wordsFromTranscript(scene.text, heard);
      words = null;
    }
    const info: VoiceInfo = { text: scene.text, dur: r.dur, phrases: phrasesOf(scene.text, timed), words: timed, engine: o.tts.id, key };
    // written under a temp name and renamed over the old one (analysis.ts atomic() would leave an old file alone)
    writeFileSync(`${f.info}.tmp`, JSON.stringify(info, null, 1));
    renameRetry(`${f.info}.tmp`, f.info);
    out[scene.id] = info;
    log(`${scene.id} ${r.dur.toFixed(2)}s ${info.phrases.map((p) => p.text).join(' | ')}`);
  }
  return out;
}
