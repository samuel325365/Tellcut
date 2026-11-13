// The speech-to-text provider Tellcut has always used: faster-whisper on the CPU, run in tellcut's own Python environment (tools/py/transcribe.py).
import { readFileSync, rmSync } from 'node:fs';
import { PY_CHECK_TIMEOUT, PY_PROJECT, runPy, runUv } from '../py.ts';
import type { ProviderStatus, TranscribeProvider } from './types.ts';

export function fasterWhisper(options: { model?: string } = {}): TranscribeProvider {
  return {
    id: 'faster-whisper', label: 'faster-whisper（本機 CPU）', online: false,
    // the env override stays the strongest (tests use a tiny model); transcribe.py's own default otherwise
    get model() { return process.env.TELLCUT_WHISPER_MODEL ?? options.model ?? 'large-v3-turbo'; },
    async check(): Promise<ProviderStatus> {
      try {
        const v = (await runUv(['run', '--project', PY_PROJECT, '--quiet', '--no-sync', '--offline', 'python', '-c', 'import importlib.metadata as m; print(m.version("faster-whisper"))'], { timeout: PY_CHECK_TIMEOUT })).trim();
        const model = options.model ?? 'large-v3-turbo';
        return { ok: true, version: v, detail: `模型 ${model}（第一次使用會下載模型）`, en: { detail: `model ${model} (downloaded on first use)` } };
      } catch (e) {
        const why = (e as Error).message.slice(0, 120);
        return { ok: false, detail: `跑不起來：${why}`, install: 'npm run setup', en: { detail: `does not run: ${why}`, install: 'npm run setup' } };
      }
    },
    async transcribe(src, out, o = {}) {
      const model = process.env.TELLCUT_WHISPER_MODEL ?? o.model ?? options.model;   // the env override stays the strongest (tests use a tiny model)
      // off Windows, a transcription whose JSON is complete but whose Python never exits (onnxruntime's teardown on macOS,
      // see transcribe.py) is ended after a grace period instead of holding the lock and the queue behind it for good
      // (a stale file from an earlier run is removed first, so only this run's own result counts)
      let done: (() => boolean) | undefined;
      if (process.platform !== 'win32') { rmSync(out, { force: true }); done = () => transcriptWritten(out); }
      await runPy('transcribe.py', [src, out, ...(model ? [model] : [])], { signal: o.signal, done });
    },
  };
}

/** the file transcribe.py writes last is whole: it parses, with its segments */
export function transcriptWritten(file: string): boolean {
  try { return Array.isArray(JSON.parse(readFileSync(file, 'utf8')).segments); } catch { return false; }
}
