// The speech-to-text provider Tellcut has always used: faster-whisper on the CPU, run in tellcut's own Python environment (tools/py/transcribe.py).
import { PY_PROJECT, runPy, runUv } from '../py.ts';
import type { ProviderStatus, TranscribeProvider } from './types.ts';

export function fasterWhisper(options: { model?: string } = {}): TranscribeProvider {
  return {
    id: 'faster-whisper', label: 'faster-whisper（本機 CPU）', online: false,
    // the env override stays the strongest (tests use a tiny model); transcribe.py's own default otherwise
    get model() { return process.env.TELLCUT_WHISPER_MODEL ?? options.model ?? 'large-v3-turbo'; },
    async check(): Promise<ProviderStatus> {
      try {
        const v = (await runUv(['run', '--project', PY_PROJECT, '--quiet', '--no-sync', '--offline', 'python', '-c', 'import importlib.metadata as m; print(m.version("faster-whisper"))'])).trim();
        return { ok: true, version: v, detail: `模型 ${options.model ?? 'large-v3-turbo'}（第一次使用會下載模型）` };
      } catch (e) { return { ok: false, detail: `跑不起來：${(e as Error).message.slice(0, 120)}`, install: 'npm run setup' }; }
    },
    async transcribe(src, out, o = {}) {
      const model = process.env.TELLCUT_WHISPER_MODEL ?? o.model ?? options.model;   // the env override stays the strongest (tests use a tiny model)
      await runPy('transcribe.py', [src, out, ...(model ? [model] : [])], { signal: o.signal });
    },
  };
}
