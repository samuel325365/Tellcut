// Text in images with Windows' built-in OCR (toolkit phase 5): nothing to install beyond the Chinese (Taiwan) OCR language.
// One PowerShell run per batch (tools/ps/ocr.ps1), never one per image: starting PowerShell is the slow part.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TELLCUT_ROOT } from '../paths.ts';
import type { OcrProvider, OcrResult, ProviderStatus } from './types.ts';

const SCRIPT = join(TELLCUT_ROOT, 'tools', 'ps', 'ocr.ps1');

/** `powershell <args>`: stdout, or the error it printed. `run` is swappable for tests. */
function powershell(args: string[], signal?: AbortSignal): Promise<string> {
  return new Promise((res, rej) => {
    const p = spawn('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', ...args], { windowsHide: true });
    let out = '', err = '';
    p.stdout.setEncoding('utf8').on('data', (d: string) => { out += d; });
    p.stderr.setEncoding('utf8').on('data', (d: string) => { err += d; });
    const kill = () => p.kill();
    signal?.addEventListener('abort', kill, { once: true });
    p.on('error', rej);
    p.on('close', (code) => {
      signal?.removeEventListener('abort', kill);
      if (signal?.aborted) rej(new DOMException('Aborted', 'AbortError'));
      else if (code) rej(new Error(err.trim().split(/\r?\n/).find((l) => l.trim() && !l.startsWith('At ') && !l.startsWith('+')) ?? `powershell exit ${code}`));
      else res(out);
    });
  });
}

/** How long a run of OCR over `images` pictures may take: the start-up (PowerShell or the recogniser, cold on a busy PC) plus a
 *  little per picture. A run that hangs held the server's one background slot, and every project's analysis behind it, forever. */
export const ocrTimeout = (images: number) => 60000 + 2000 * images;

/** `work` given a signal that also aborts after `ms`: past it, a "could not read" error at once (not waiting for the process
 *  to close), so the caller treats it like any OCR that broke; the caller's own abort still comes back as an abort. */
export async function withTimeout<T>(ms: number, signal: AbortSignal | undefined, work: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const clock = new AbortController(), timer = setTimeout(() => clock.abort(), ms);
  const late = new Promise<never>((_, rej) => clock.signal.addEventListener('abort', () => rej(new Error(`文字辨識超過 ${Math.round(ms / 1000)} 秒沒有回應`)), { once: true }));
  try { return await Promise.race([work(signal ? AbortSignal.any([signal, clock.signal]) : clock.signal), late]); }
  finally { clearTimeout(timer); }
}

export const parseOcrLines = (stdout: string): OcrResult[] =>
  stdout.split(/\r?\n/).filter((l) => l.trim().startsWith('{')).map((l) => {
    const r = JSON.parse(l) as OcrResult;
    return { ...r, lines: Array.isArray(r.lines) ? r.lines : r.lines ? [r.lines as never] : [] };   // ConvertTo-Json flattens a one-item array
  });

export function windowsOcr(options: { lang?: string; /** a test's shorter clock */ timeout?: (images: number) => number } = {}, run: typeof powershell = powershell): OcrProvider {
  const timeout = options.timeout ?? ocrTimeout;
  const lang = options.lang ?? 'zh-Hant-TW';
  return {
    id: 'windows', label: 'Windows 內建文字辨識', online: false,
    async check(): Promise<ProviderStatus> {
      if (process.platform !== 'win32') return { ok: false, detail: '只有 Windows 有', install: '把 tellcut/providers.json 裡 ocr 的 "use" 改成 "system"（用這台系統自己的文字辨識）' };
      try {
        const out = await withTimeout(timeout(0), undefined, (s) => run(['-Command', `[Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime] | Out-Null; [Windows.Globalization.Language, Windows.Globalization, ContentType = WindowsRuntime] | Out-Null; [Windows.Media.Ocr.OcrEngine]::IsLanguageSupported((New-Object Windows.Globalization.Language '${lang}'))`], s));
        return out.trim() === 'True' ? { ok: true, detail: `語言 ${lang}` }
          : { ok: false, detail: `沒有 ${lang} 的文字辨識`, install: '設定 → 時間與語言 → 語言：加入中文（台灣），在語言選項裡安裝「光學字元辨識」' };
      } catch (e) { return { ok: false, detail: `跑不起來：${(e as Error).message.slice(0, 120)}` }; }
    },
    async read(images, o = {}) {
      if (!images.length) return [];
      const dir = mkdtempSync(join(tmpdir(), 'ocr-')), list = join(dir, 'list.txt');
      try {
        writeFileSync(list, images.join('\n'), 'utf8');
        return parseOcrLines(await withTimeout(timeout(images.length), o.signal, (s) => run(['-File', SCRIPT, '-List', list, '-Lang', lang], s)));
      } finally { rmSync(dir, { recursive: true, force: true }); }
    },
  };
}
