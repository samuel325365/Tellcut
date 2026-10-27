// What Tellcut needs on a PC, checked one by one (spec 2026-10-17-studio-handover §7–8). npm run setup installs what it can and
// then runs these; npm run doctor only runs these (nothing is installed, no Claude tokens are spent).
import { exec, execFile } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { chromeSpec, CLAUDE, CLAUDE_MIN_VERSION, claudeEnv, facesProvider, FFMPEG, FFPROBE, loadProvidersConfig, locate, modelsDir, ocrProvider, onPathDirs, playerBuildStale, PY_PROJECT, runUv, TELLCUT_ROOT, UV, VENDOR_DIR, type ExeSpec, type Provider } from '@tellcut/media-node';

const run = promisify(execFile);
/** a whole command line through the shell (claude is a .cmd file; TELLCUT_CLAUDE may be a command with arguments) */
const runLine = (line: string, timeout = 60000) => promisify(exec)(line, { windowsHide: true, timeout, env: claudeEnv() });

export interface Check { name: string; ok: boolean; detail: string; fix?: string }

/** "ffmpeg version 8.0.1-essentials…" → 8 */
export const ffmpegMajor = (versionText: string) => { const m = /ffmpeg version n?(\d+)\./.exec(versionText); return m ? Number(m[1]) : null; };
/** "2.1.281 (Claude Code)" is at least "2.1.242"; null when the text has no version */
export const versionAtLeast = (versionText: string, min: string): boolean | null => {
  const m = /(\d+)\.(\d+)\.(\d+)/.exec(versionText);
  if (!m) return null;
  const a = m.slice(1).map(Number), b = min.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return true;
};
export const nodeMajor = (v = process.versions.node) => Number(v.split('.')[0]);

const where = (spec: ExeSpec) => locate(spec);
const fromLabel = { env: '環境變數', vendor: 'tellcut/vendor', known: '安裝位置', path: 'PATH' } as const;

export function checkPlatform(): Check {
  return process.platform === 'win32' ? { name: 'Windows', ok: true, detail: process.platform }
    : { name: 'Windows', ok: false, detail: `這台是 ${process.platform}`, fix: 'Tellcut 目前只支援 Windows 10／11' };
}

export function checkNode(): Check {
  const n = nodeMajor();
  return n >= 24 ? { name: 'Node.js', ok: true, detail: `v${process.versions.node}` } : { name: 'Node.js', ok: false, detail: `v${process.versions.node}`, fix: '安裝 Node.js 24 以上（https://nodejs.org/）' };
}

export function checkNpm(): Check {
  return existsSync(join(TELLCUT_ROOT, 'node_modules', '.package-lock.json')) ? { name: 'npm 套件', ok: true, detail: 'node_modules' }
    : { name: 'npm 套件', ok: false, detail: '還沒安裝', fix: 'npm run setup' };
}

async function exeVersion(spec: ExeSpec, args: string[], shell = false): Promise<Check> {
  const f = where(spec);
  if (!f) return { name: spec.name, ok: false, detail: '找不到', fix: spec.install };
  try {
    const { stdout } = shell ? await runLine(`"${f.path}" ${args.join(' ')}`) : await run(f.path, args, { windowsHide: true, timeout: 60000 });
    return { name: spec.name, ok: true, detail: `${stdout.trim().split(/\r?\n/)[0].slice(0, 70)}（${fromLabel[f.from]}）` };
  } catch (e) { return { name: spec.name, ok: false, detail: `${f.path} 跑不起來：${(e as Error).message.slice(0, 100)}`, fix: spec.install }; }
}

export async function checkFfmpeg(): Promise<Check[]> {
  const ff = await exeVersion(FFMPEG, ['-hide_banner', '-version']);
  if (ff.ok) {
    const major = ffmpegMajor(ff.detail);
    if (major !== null && major < 8) Object.assign(ff, { ok: false, fix: `要 ffmpeg 8 以上（這個是 ${major}）：npm run setup 會下載到 tellcut/vendor` });
  }
  return [ff, await exeVersion(FFPROBE, ['-hide_banner', '-version'])];
}

export const checkUv = () => exeVersion(UV, ['--version']);

export async function checkPython(): Promise<Check> {
  if (!existsSync(join(TELLCUT_ROOT, '.venv'))) return { name: 'Python 環境', ok: false, detail: 'tellcut/.venv 還沒建立', fix: 'npm run setup' };
  try {
    const out = await runUv(['run', '--project', PY_PROJECT, '--quiet', '--no-sync', 'python', '-c',
      'import sys, faster_whisper, PIL, pillow_heif, opencc, av, numpy, yt_dlp, mediapipe; print(sys.version.split()[0], sys.prefix)']);
    return { name: 'Python 環境', ok: true, detail: `Python ${out.trim().split(' ')[0]}（tellcut/.venv）` };
  } catch (e) { return { name: 'Python 環境', ok: false, detail: (e as Error).message.slice(0, 120), fix: 'npm run setup' }; }
}

/** the file written last into a model folder: without it the folder is an interrupted copy or download */
export const MODEL_COMPLETE = '.tellcut-complete';
export { modelsDir } from '@tellcut/media-node';
/** the speech model transcription will use: TELLCUT_WHISPER_MODEL first, as transcribe.py does */
export const whisperModelName = (configured: string) => process.env.TELLCUT_WHISPER_MODEL ?? configured;

/** tellcut's own copy of the faster-whisper model `model` (plain files, see tools/py/transcribe.py), if it is complete */
export function whisperModelDir(model: string, dir = modelsDir()): string | null {
  const d = join(dir, 'whisper', model);
  return existsSync(join(d, 'model.bin')) && existsSync(join(d, MODEL_COMPLETE)) ? d : null;
}

/** the same model in a Hugging Face cache (this user's own, before Tellcut had its copy): its complete snapshot folder */
export function hfCachedWhisper(model: string, hfHome: string): string | null {
  const hub = join(hfHome, 'hub');
  if (!existsSync(hub)) return null;
  for (const d of readdirSync(hub)) {
    if (!d.startsWith('models--') || !d.endsWith(`--faster-whisper-${model}`)) continue;
    const snaps = join(hub, d, 'snapshots');
    if (!existsSync(snaps)) continue;
    for (const s of readdirSync(snaps)) if (existsSync(join(snaps, s, 'model.bin'))) return join(snaps, s);
  }
  return null;
}

export function checkWhisperModel(model: string): Check {
  const dir = whisperModelDir(model);
  return dir ? { name: '語音辨識模型', ok: true, detail: `${model}（tellcut/models/whisper）` }
    : { name: '語音辨識模型', ok: false, detail: `${model} 還沒下載`, fix: 'npm run setup（約 1.6 GB；這台電腦的使用者快取裡已經有的話會直接複製）' };
}

/** fonts.css with its faces: one with none (an offline download used to write that, review R4-T2) leaves every font to the system.
 *  `named`: font files kept under their own name in files/ with no @font-face (the TTF common.logo extrudes its letters from).
 *  An install from before they were added has a full fonts.css but not them, and the 3D letters quietly become cut-outs. */
export function checkFonts(dir = join(TELLCUT_ROOT, 'apps', 'player', 'public', 'fonts'), named: string[] = []): Check {
  let css: string;
  try { css = readFileSync(join(dir, 'fonts.css'), 'utf8'); } catch { return { name: '字型', ok: false, detail: '還沒下載', fix: 'npm run setup（或 npm run fonts）' }; }
  const faces = css.match(/@font-face/g)?.length ?? 0;
  if (!faces) return { name: '字型', ok: false, detail: 'fonts.css 是空的：預覽和輸出會退回系統字型', fix: '連上網路後跑 npm run fonts' };
  const missing = named.filter((n) => !existsSync(join(dir, 'files', n)));
  return missing.length ? { name: '字型', ok: false, detail: `少了 ${missing.join('、')}：立體商標的英文字母會變成切字`, fix: '連上網路後跑 npm run fonts' }
    : { name: '字型', ok: true, detail: `apps/player/public/fonts（${faces} 個字面）` };
}
/** the font files the plugins keep under their own name (FontSpec.file) */
async function namedFonts(): Promise<string[]> {
  const { plugins } = await import('@tellcut/plugins');
  return plugins.flatMap((p) => p.fonts ?? []).flatMap((f) => (typeof f !== 'string' && f.file ? [f.file] : []));
}

export function checkBuilds(): Check[] {
  const stale = playerBuildStale();
  const editor = existsSync(join(TELLCUT_ROOT, 'apps', 'editor', 'dist', 'index.html'));
  return [
    stale ? { name: '播放器建置', ok: false, detail: stale, fix: 'npm run build:player' } : { name: '播放器建置', ok: true, detail: 'apps/player/dist' },
    editor ? { name: '編輯器建置', ok: true, detail: 'apps/editor/dist' } : { name: '編輯器建置', ok: false, detail: '還沒建置', fix: 'npm run build:editor' },
  ];
}

export function checkChrome(): Check {
  const spec = chromeSpec(), f = locate(spec);
  return f ? { name: 'Google Chrome', ok: true, detail: `${f.path}（${fromLabel[f.from]}）` } : { name: 'Google Chrome', ok: false, detail: '找不到', fix: spec.install };
}

/** Claude Code is there and starts (no request, no tokens). */
export async function checkClaude(): Promise<Check> {
  const own = process.env.TELLCUT_CLAUDE;
  if (!own && !onPathDirs('claude', { env: process.env, exists: existsSync, vendorDir: VENDOR_DIR, platform: process.platform })) return { name: CLAUDE.name, ok: false, detail: '找不到', fix: CLAUDE.install };
  try {
    const { stdout } = await runLine(`${own ?? 'claude'} --version`);
    const line = stdout.trim().split(/\r?\n/)[0];
    // the page chat's 1-hour cache and its isolation need a recent Claude Code (CLAUDE_MIN_VERSION)
    if (versionAtLeast(line, CLAUDE_MIN_VERSION) === false) return { name: CLAUDE.name, ok: false, detail: `${line}：太舊，需要 ${CLAUDE_MIN_VERSION} 以上`, fix: '在終端機執行 claude update' };
    return { name: CLAUDE.name, ok: true, detail: line };
  } catch (e) { return { name: CLAUDE.name, ok: false, detail: `跑不起來：${(e as Error).message.slice(0, 100)}`, fix: CLAUDE.install }; }
}

/** One tiny request: tells whether Claude Code is logged in (setup only; it spends a few tokens). */
export async function checkClaudeLogin(): Promise<Check> {
  try {
    const { stdout } = await runLine(`${process.env.TELLCUT_CLAUDE ?? 'claude'} -p "Reply with the single word OK." --output-format json`, 180000);
    const r = JSON.parse(stdout.trim().split(/\r?\n/).pop() ?? '{}') as { is_error?: boolean; result?: string };
    return r.is_error ? { name: 'Claude Code 登入', ok: false, detail: String(r.result ?? '').slice(0, 100), fix: '在終端機執行 claude 並登入' } : { name: 'Claude Code 登入', ok: true, detail: '可以回話' };
  } catch (e) { return { name: 'Claude Code 登入', ok: false, detail: (e as Error).message.slice(0, 120), fix: '在終端機執行 claude 並登入' }; }
}

/** The table at the end of setup and doctor. */
export function table(checks: Check[]): string {
  const w = Math.max(...checks.map((c) => [...c.name].reduce((n, ch) => n + (/[⺀-￯]/.test(ch) ? 2 : 1), 0)));
  const pad = (s: string) => s + ' '.repeat(Math.max(0, w - [...s].reduce((n, ch) => n + (/[⺀-￯]/.test(ch) ? 2 : 1), 0)));
  const lines = checks.map((c) => `${c.ok ? '✓' : '✗'} ${pad(c.name)}  ${c.detail}${!c.ok && c.fix ? `\n  ${' '.repeat(w)}  → ${c.fix}` : ''}`);
  const bad = checks.filter((c) => !c.ok).length;
  return [...lines, '', bad ? `${bad} 項要處理（照 → 後面做，然後再跑一次）` : '全部就緒：npm run server，然後開 http://127.0.0.1:5174/editor/'].join('\n');
}

/** Every check doctor runs, in the order a newcomer fixes them. */
/** A provider's own check as a row (the face detection and text recognition of toolkit phase 5). */
async function providerCheck(name: string, p: Provider): Promise<Check> {
  const s = await p.check().catch((e: Error) => ({ ok: false, detail: e.message.slice(0, 100), install: undefined, version: undefined }));
  return { name, ok: s.ok, detail: `${p.label}${s.version ? ` v${s.version}` : ''}：${s.detail}`, fix: s.install };
}

export async function allChecks(o: { whisperModel: string }): Promise<Check[]> {
  const [ffmpeg, uv, claude] = await Promise.all([checkFfmpeg(), checkUv(), checkClaude()]);
  const python = await checkPython();
  const config = loadProvidersConfig();
  const [faces, ocr, named] = await Promise.all([providerCheck('人臉偵測', facesProvider(config)), providerCheck('文字辨識', ocrProvider(config)), namedFonts().catch(() => [])]);
  return [checkPlatform(), checkNode(), checkNpm(), uv, ...ffmpeg, python, checkWhisperModel(o.whisperModel), faces, ocr, checkFonts(undefined, named), ...checkBuilds(), checkChrome(), claude];
}
