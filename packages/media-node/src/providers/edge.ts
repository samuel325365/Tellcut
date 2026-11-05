// edge-tts: Microsoft's online voices, with word times. Run through `uv tool run` (its own throwaway env inside tellcut/, never the system Python).
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { ffmpeg, probeDuration } from '../ffmpeg.ts';
import { renameRetry } from '../fsutil.ts';
import { PY_DIR, runUv } from '../py.ts';
import type { ProviderStatus, TtsProvider } from './types.ts';

export const EDGE_VOICES = ['zh-TW-HsiaoChenNeural', 'zh-TW-HsiaoYuNeural', 'zh-TW-YunJheNeural', 'zh-CN-XiaoxiaoNeural', 'zh-CN-YunxiNeural', 'en-US-JennyNeural', 'ja-JP-NanamiNeural'];

/** `run` is the way to start `uv` (a test swaps it); it resolves stdout. */
export function edgeTts(options: { version?: string; voice?: string } = {}, run: typeof runUv = runUv): TtsProvider {
  const pkg = `edge-tts${options.version ? `==${options.version}` : ''}`, defaultVoice = options.voice ?? EDGE_VOICES[0];
  return {
    id: 'edge', label: 'edge-tts（微軟線上語音）', online: true,
    voices: () => EDGE_VOICES, defaultVoice,
    async check(): Promise<ProviderStatus> {
      try {
        const v = (await run(['tool', 'run', '--from', pkg, 'python', '-c', 'import importlib.metadata as m; print(m.version("edge-tts"))'])).trim();
        return { ok: true, version: v, detail: `聲音 ${defaultVoice}；要連網才能說話` };
      } catch (e) { return { ok: false, detail: `跑不起來：${(e as Error).message.slice(0, 120)}`, install: `npm run setup（edge-tts 本身在第一次使用時自動下載）` }; }
    },
    async synth(req) {
      // this process's own temp names, the wav renamed into place only when whole: an interrupted run never leaves half a wav
      // that the scene's .json (written after) still calls up to date, and two runs on one scene don't share a file
      const mp3 = `${req.out}.${process.pid}.tmp.mp3`, wav = `${req.out}.${process.pid}.tmp.wav`;
      try {
        const stdout = await run(['tool', 'run', '--from', pkg, 'python', join(PY_DIR, 'tts_edge.py')], {
          input: JSON.stringify({ text: req.text, voice: req.voice ?? defaultVoice, rate: req.rate ?? 0, pitch: req.pitch, out: mp3 }), signal: req.signal,
        });
        const words = (JSON.parse(stdout.trim().split(/\r?\n/).pop() ?? '{}') as { words?: Array<{ text: string; t: number; d: number }> }).words ?? [];
        await ffmpeg(['-i', mp3, '-ac', '1', '-ar', '24000', '-c:a', 'pcm_s16le', wav], { signal: req.signal });
        const dur = +(await probeDuration(wav)).toFixed(3);
        renameRetry(wav, req.out);
        return { dur, words: words.map((w) => ({ text: w.text, start: +w.t.toFixed(3), end: +(w.t + w.d).toFixed(3) })) };
      } finally { rmSync(mp3, { force: true }); rmSync(wav, { force: true }); }
    },
  };
}
