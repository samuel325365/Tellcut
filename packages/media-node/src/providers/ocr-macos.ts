// Text in images with macOS' built-in Vision text recognition (toolkit phase 5): nothing to install beyond Xcode's command line
// tools (swiftc). tools/mac/ocr.swift is built once into .cache/bin (named by its hash, so an edit builds it again); one run per
// batch, never one per image. Its output is the same JSON line per image as Windows' tools/ps/ocr.ps1.
import { execFile, spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { TELLCUT_ROOT } from '../paths.ts';
import { parseOcrLines } from './ocr-windows.ts';
import type { OcrProvider, ProviderStatus } from './types.ts';

const SCRIPT = join(TELLCUT_ROOT, 'tools', 'mac', 'ocr.swift');
const BIN_DIR = join(TELLCUT_ROOT, '.cache', 'bin');

/** Vision names its languages without a region: zh-Hant-TW → zh-Hant (English is read along with it, as Windows does) */
export function visionLangs(lang: string): string[] {
  const m = /^zh-(hant|hans)/i.exec(lang), base = m ? `zh-${m[1][0].toUpperCase()}${m[1].slice(1).toLowerCase()}` : lang;
  return base.startsWith('en') ? [base] : [base, 'en-US'];
}

/** the built recogniser, building it first when this version of ocr.swift has none yet */
async function binary(): Promise<string> {
  const hash = createHash('sha256').update(readFileSync(SCRIPT)).digest('hex').slice(0, 12);
  const bin = join(BIN_DIR, `ocr-vision-${hash}`);
  if (existsSync(bin)) return bin;
  mkdirSync(BIN_DIR, { recursive: true });
  const tmp = `${bin}.${process.pid}-${randomUUID()}.partial`;
  try { await promisify(execFile)('xcrun', ['swiftc', '-O', SCRIPT, '-o', tmp], { timeout: 300000 }); }
  catch (e) { rmSync(tmp, { force: true }); throw new Error(`編譯 ocr.swift 失敗（要有 Xcode 命令列工具：xcode-select --install）：${(e as Error).message.slice(0, 200)}`); }
  renameSync(tmp, bin);   // two builds at once: the last rename wins, both are the same program
  return bin;
}

/** `<recogniser> <args>`: stdout, or the error it printed. `run` is swappable for tests. */
async function vision(args: string[], signal?: AbortSignal): Promise<string> {
  const bin = await binary();
  return new Promise((res, rej) => {
    const p = spawn(bin, args);
    let out = '', err = '';
    p.stdout.setEncoding('utf8').on('data', (d: string) => { out += d; });
    p.stderr.setEncoding('utf8').on('data', (d: string) => { err += d; });
    const kill = () => p.kill();
    signal?.addEventListener('abort', kill, { once: true });
    p.on('error', rej);
    p.on('close', (code) => {
      signal?.removeEventListener('abort', kill);
      if (signal?.aborted) rej(new DOMException('Aborted', 'AbortError'));
      else if (code) rej(new Error(err.trim().split(/\r?\n/).pop() || `ocr-vision exit ${code}`));
      else res(out);
    });
  });
}

export function macosOcr(options: { lang?: string } = {}, run: typeof vision = vision): OcrProvider {
  const langs = visionLangs(options.lang ?? 'zh-Hant-TW');
  return {
    id: 'macos', label: 'macOS 內建文字辨識', online: false,
    async check(): Promise<ProviderStatus> {
      if (process.platform !== 'darwin') return { ok: false, detail: '只有 macOS 有', install: '在 Mac 上使用' };
      try {
        const out = await run(['--supports', langs[0]]);
        return out.trim() === 'True' ? { ok: true, detail: `語言 ${langs.join('、')}` } : { ok: false, detail: `這台 Mac 的文字辨識沒有 ${langs[0]}`, install: '更新 macOS' };
      } catch (e) { return { ok: false, detail: `跑不起來：${(e as Error).message.slice(0, 120)}`, install: 'xcode-select --install' }; }
    },
    async read(images, o = {}) {
      if (!images.length) return [];
      const dir = mkdtempSync(join(tmpdir(), 'ocr-')), list = join(dir, 'list.txt');
      try {
        writeFileSync(list, images.join('\n'), 'utf8');
        return parseOcrLines(await run(['--list', list, '--lang', langs.join(',')], o.signal));
      } finally { rmSync(dir, { recursive: true, force: true }); }
    },
  };
}
