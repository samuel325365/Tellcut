// What Tellcut needs on a PC, checked one by one (spec 2026-10-17-studio-handover §7–8). npm run setup installs what it can and
// then runs these; npm run doctor only runs these (nothing is installed, no Claude tokens are spent).
// Everything here is in English, like examples.ts: the people who run setup and doctor have just cloned Tellcut from GitHub
// (the other tools print Chinese). Texts that come from media-node (an ExeSpec's install, a provider's check) are Chinese there,
// so the rows here carry their own English.
import { exec, execFile } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { release as osRelease } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { chromeSpec, CLAUDE, CLAUDE_MIN_VERSION, claudeEnv, editorBuildStale, facesProvider, FFMPEG, FFPROBE, loadProvidersConfig, locate, modelsDir, ocrProvider, onPathDirs, playerBuildStale, PY_PROJECT, runUv, TELLCUT_ROOT, UV, VENDOR_DIR, type ExeSpec, type Provider } from '@tellcut/media-node';

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
const fromLabel = { env: 'environment variable', vendor: 'tellcut/vendor', known: 'install folder', path: 'PATH' } as const;

/** Chinese, Japanese or full-width text: a message from media-node or a source that has no English of its own */
export const hasCjk = (s: string) => /[⺀-鿿＀-￯]/.test(s);
/** `s` when it reads in English (a system's own error message mostly does), else undefined */
const english = (s: string | undefined) => (s && !hasCjk(s) ? s : undefined);

/** the row name of the Claude Code check (setup asks for the login only when it passed) */
export const CLAUDE_CHECK = 'Claude Code (claude)';

/** how to install each program, in English (media-node's ExeSpec.install is in Chinese, for the other tools) */
export function installHint(spec: ExeSpec, platform: NodeJS.Platform = process.platform): string {
  const hints: Record<string, string> = {
    TELLCUT_FFMPEG: platform === 'darwin' ? 'install the full build with stabilisation (vid.stab) from Homebrew: brew install ffmpeg-full'
      : 'run npm run setup in tellcut/ (it downloads it into tellcut/vendor/ffmpeg)',
    TELLCUT_UV: 'run npm run setup in tellcut/ (it downloads it into tellcut/vendor/uv)',
    TELLCUT_CHROME: 'install Google Chrome (https://www.google.com/chrome/). Export and check need the real Chrome: the Chromium Playwright downloads cannot play H.264',
    TELLCUT_CLAUDE: 'install Claude Code and sign in (https://claude.com/claude-code): the chat in the editor runs on it',
  };
  hints.TELLCUT_FFPROBE = hints.TELLCUT_FFMPEG;
  return hints[spec.env] ?? english(spec.install) ?? `install ${spec.name}, or point ${spec.env} at it`;
}

export function checkPlatform(platform: NodeJS.Platform = process.platform, release = osRelease()): Check {
  if (platform === 'win32') return { name: 'Windows', ok: true, detail: platform };
  if (platform === 'darwin') return { name: 'macOS', ok: true, detail: `Darwin ${release}` };
  return { name: 'System', ok: false, detail: `this is ${platform}`, fix: 'Tellcut supports Windows 10/11 and macOS' };
}

/** `ffmpeg -filters` lists vidstabdetect and vidstabtransform: stabilised cuts need them (Homebrew's plain ffmpeg has neither) */
export const hasVidstab = (filters: string) => /\bvidstabdetect\b/.test(filters) && /\bvidstabtransform\b/.test(filters);

export function checkNode(): Check {
  const n = nodeMajor();
  return n >= 24 ? { name: 'Node.js', ok: true, detail: `v${process.versions.node}` } : { name: 'Node.js', ok: false, detail: `v${process.versions.node}`, fix: 'install Node.js 24 or later (https://nodejs.org/)' };
}

export function checkNpm(): Check {
  return existsSync(join(TELLCUT_ROOT, 'node_modules', '.package-lock.json')) ? { name: 'npm packages', ok: true, detail: 'node_modules' }
    : { name: 'npm packages', ok: false, detail: 'not installed yet', fix: 'npm run setup' };
}

async function exeVersion(spec: ExeSpec, args: string[]): Promise<Check> {
  const f = where(spec);
  if (!f) return { name: spec.name, ok: false, detail: 'not found', fix: installHint(spec) };
  try {
    const { stdout } = await run(f.path, args, { windowsHide: true, timeout: 60000 });
    return { name: spec.name, ok: true, detail: `${stdout.trim().split(/\r?\n/)[0].slice(0, 70)} (${fromLabel[f.from]})` };
  } catch (e) { return { name: spec.name, ok: false, detail: `${f.path} does not run: ${(e as Error).message.slice(0, 100)}`, fix: installHint(spec) }; }
}

export async function checkFfmpeg(): Promise<Check[]> {
  const ff = await exeVersion(FFMPEG, ['-hide_banner', '-version']);
  if (ff.ok) {
    const major = ffmpegMajor(ff.detail);
    if (major !== null && major < 8) Object.assign(ff, { ok: false, fix: `Tellcut needs ffmpeg 8 or later (this one is ${major}): ${process.platform === 'darwin' ? installHint(FFMPEG) : 'npm run setup downloads it into tellcut/vendor'}` });
  }
  // macOS only: Windows' vendored build has vid.stab, and a Mac's plain Homebrew ffmpeg does not
  if (ff.ok && process.platform === 'darwin') {
    const filters = await run(locate(FFMPEG)!.path, ['-hide_banner', '-filters'], { timeout: 60000 }).then((r) => r.stdout, () => null);
    if (filters === null) ff.detail += ' (cannot tell whether it has stabilisation, vid.stab: ffmpeg -filters does not run)';
    else if (!hasVidstab(filters)) Object.assign(ff, { ok: false, detail: `${ff.detail}: no stabilisation (vid.stab)`, fix: installHint(FFMPEG) });
  }
  return [ff, await exeVersion(FFPROBE, ['-hide_banner', '-version'])];
}

export const checkUv = () => exeVersion(UV, ['--version']);

export async function checkPython(): Promise<Check> {
  if (!existsSync(join(TELLCUT_ROOT, '.venv'))) return { name: 'Python environment', ok: false, detail: 'tellcut/.venv is not there yet', fix: 'npm run setup' };
  try {
    const out = await runUv(['run', '--project', PY_PROJECT, '--quiet', '--no-sync', 'python', '-c',
      'import sys, faster_whisper, PIL, pillow_heif, opencc, av, numpy, yt_dlp, mediapipe; print(sys.version.split()[0], sys.prefix)']);
    return { name: 'Python environment', ok: true, detail: `Python ${out.trim().split(' ')[0]} (tellcut/.venv)` };
  } catch (e) { return { name: 'Python environment', ok: false, detail: (e as Error).message.slice(0, 120), fix: 'npm run setup' }; }
}

/** the file written last into a model folder: without it the folder is an interrupted copy or download */
export const MODEL_COMPLETE = '.tellcut-complete';
export { modelsDir } from '@tellcut/media-node';
/** the speech model transcription will use: TELLCUT_WHISPER_MODEL first, as transcribe.py does */
export const whisperModelName = (configured: string) => process.env.TELLCUT_WHISPER_MODEL ?? configured;
/** the small model the tests transcribe with (about 75 MB; tools/test-env.ts): each of them loading large-v3-turbo ran a machine
 *  short of memory in a full npm test (faster-whisper's mkl_malloc failed and the job with it). npm run setup puts it next to the
 *  user's model; a test run without it downloads it on first use (transcribe.py). */
export const TEST_WHISPER_MODEL = 'tiny';

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
  return dir ? { name: 'Speech model', ok: true, detail: `${model} (tellcut/models/whisper)` }
    : { name: 'Speech model', ok: false, detail: `${model} is not downloaded yet`, fix: 'npm run setup (about 1.6 GB; copied instead when this PC\'s Hugging Face cache has it already)' };
}

/** fonts.css with its faces: one with none (an offline download used to write that, review R4-T2) leaves every font to the system.
 *  `named`: font files kept under their own name in files/ with no @font-face (INTER_3D, the TTF ThreeKit's loadFont and word3d extrude 3D letters from).
 *  An install from before they were added has a full fonts.css but not them, and the 3D letters quietly become cut-outs. */
export function checkFonts(dir = join(TELLCUT_ROOT, 'apps', 'player', 'public', 'fonts'), named: string[] = [], families: string[] = []): Check {
  let css: string;
  try { css = readFileSync(join(dir, 'fonts.css'), 'utf8'); } catch { return { name: 'Fonts', ok: false, detail: 'not downloaded yet', fix: 'npm run setup (or npm run fonts)' }; }
  const faces = css.match(/@font-face/g)?.length ?? 0;
  if (!faces) return { name: 'Fonts', ok: false, detail: 'fonts.css is empty: preview and export fall back to the system fonts', fix: 'npm run fonts, once online' };
  const missing = named.filter((n) => !existsSync(join(dir, 'files', n)));
  if (missing.length) return { name: 'Fonts', ok: false, detail: `${missing.join(', ')} missing: the letters of 3D logos become flat cut-outs`, fix: 'npm run fonts, once online' };
  // a family added after the last download (the caption looks' fonts, 2026-11-05): its words fall back to another font
  const absent = families.filter((f) => !new RegExp(`font-family:\\s*['"]?${f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]?\\s*;`).test(css));
  return absent.length ? { name: 'Fonts', ok: false, detail: `${absent.join(', ')} missing: captions and blocks that use them get another font`, fix: 'npm run fonts, once online' }
    : { name: 'Fonts', ok: true, detail: `apps/player/public/fonts (${faces} faces)` };
}
/** the font families the plugins load from Google Fonts ('Noto Sans TC:wght@500' → Noto Sans TC) */
async function googleFamilies(): Promise<string[]> {
  const { plugins } = await import('@tellcut/plugins');
  return [...new Set(plugins.flatMap((p) => p.fonts ?? []).flatMap((f) => (typeof f === 'string' ? [f.split(':')[0]] : [])))];
}
/** the font files the plugins keep under their own name (FontSpec.file) */
async function namedFonts(): Promise<string[]> {
  const { plugins } = await import('@tellcut/plugins');
  return plugins.flatMap((p) => p.fonts ?? []).flatMap((f) => (typeof f !== 'string' && f.file ? [f.file] : []));
}

/** the player build's row: media-node's playerBuildStale says why in Chinese, so only whether it is there tells the two apart */
export function playerBuildCheck(stale: string | null, built: boolean): Check {
  if (!stale) return { name: 'Player build', ok: true, detail: 'apps/player/dist' };
  return { name: 'Player build', ok: false, detail: built ? 'older than its source (a block or the engine changed): pictures would come from the old code' : 'not built yet', fix: 'npm run build:player' };
}

/** the editor build's row, the same way (editorBuildStale) */
export function editorBuildCheck(stale: string | null, built: boolean): Check {
  if (!stale) return { name: 'Editor build', ok: true, detail: 'apps/editor/dist' };
  return { name: 'Editor build', ok: false, detail: built ? 'older than its source: the editor page would come from the old code' : 'not built yet', fix: 'npm run build:editor' };
}

export function checkBuilds(): Check[] {
  const built = (app: string) => existsSync(join(TELLCUT_ROOT, 'apps', app, 'dist', 'index.html'));
  return [playerBuildCheck(playerBuildStale(), built('player')), editorBuildCheck(editorBuildStale(), built('editor'))];
}

export function checkChrome(): Check {
  const spec = chromeSpec(), f = locate(spec);
  return f ? { name: 'Google Chrome', ok: true, detail: `${f.path} (${fromLabel[f.from]})` } : { name: 'Google Chrome', ok: false, detail: 'not found', fix: installHint(spec) };
}

/** Claude Code is there and starts (no request, no tokens). */
export async function checkClaude(): Promise<Check> {
  const own = process.env.TELLCUT_CLAUDE;
  if (!own && !onPathDirs('claude', { env: process.env, exists: existsSync, vendorDir: VENDOR_DIR, platform: process.platform })) return { name: CLAUDE_CHECK, ok: false, detail: 'not found', fix: installHint(CLAUDE) };
  try {
    const { stdout } = await runLine(`${own ?? 'claude'} --version`);
    const line = stdout.trim().split(/\r?\n/)[0];
    // the page chat's 1-hour cache and its isolation need a recent Claude Code (CLAUDE_MIN_VERSION)
    if (versionAtLeast(line, CLAUDE_MIN_VERSION) === false) return { name: CLAUDE_CHECK, ok: false, detail: `${line}: too old, Tellcut needs ${CLAUDE_MIN_VERSION} or later`, fix: 'run claude update in a terminal' };
    return { name: CLAUDE_CHECK, ok: true, detail: line };
  } catch (e) { return { name: CLAUDE_CHECK, ok: false, detail: `does not run: ${(e as Error).message.slice(0, 100)}`, fix: installHint(CLAUDE) }; }
}

/** One tiny request: tells whether Claude Code is logged in (setup only; it spends a few tokens). */
export async function checkClaudeLogin(): Promise<Check> {
  const name = 'Claude Code sign-in', fix = 'run claude in a terminal and sign in';
  try {
    const { stdout } = await runLine(`${process.env.TELLCUT_CLAUDE ?? 'claude'} -p "Reply with the single word OK." --output-format json`, 180000);
    const r = JSON.parse(stdout.trim().split(/\r?\n/).pop() ?? '{}') as { is_error?: boolean; result?: string };
    return r.is_error ? { name, ok: false, detail: String(r.result ?? '').slice(0, 100), fix } : { name, ok: true, detail: 'it answers' };
  } catch (e) { return { name, ok: false, detail: (e as Error).message.slice(0, 120), fix }; }
}

/** The table at the end of setup and doctor. */
export function table(checks: Check[]): string {
  const w = Math.max(...checks.map((c) => [...c.name].reduce((n, ch) => n + (/[⺀-￯]/.test(ch) ? 2 : 1), 0)));
  const pad = (s: string) => s + ' '.repeat(Math.max(0, w - [...s].reduce((n, ch) => n + (/[⺀-￯]/.test(ch) ? 2 : 1), 0)));
  const lines = checks.map((c) => `${c.ok ? '✓' : '✗'} ${pad(c.name)}  ${c.detail}${!c.ok && c.fix ? `\n  ${' '.repeat(w)}  → ${c.fix}` : ''}`);
  const bad = checks.filter((c) => !c.ok).length;
  return [...lines, '', bad ? `${bad} ${bad === 1 ? 'item needs' : 'items need'} fixing (do what follows each →, then run this again)` : 'All set: npm run server, then open http://127.0.0.1:5174/editor/'].join('\n');
}

/** English names of the providers Tellcut has (media-node's labels are Chinese) */
const PROVIDER_EN: Record<string, { label: string; install?: string }> = {
  edge: { label: 'edge-tts (Microsoft online voices)', install: 'npm run setup (edge-tts itself downloads on first use)' },
  elevenlabs: { label: 'ElevenLabs (online voices, needs an API key)', install: 'set ELEVENLABS_API_KEY, or keys.elevenlabs in tellcut/sources.local.json' },
  'faster-whisper': { label: 'faster-whisper (local CPU)' },
  mediapipe: { label: 'MediaPipe face landmarks (local CPU)' },
  windows: { label: 'Windows built-in OCR', install: 'Windows Settings → Time & language → Language & region: add "Chinese (Traditional, Taiwan)" and install "Optical character recognition" in its language options' },
  macos: { label: 'macOS built-in text recognition', install: 'update macOS: its text recognition does not have the language' },
  fake: { label: 'test stand-in' },
};
export const providerLabel = (p: Pick<Provider, 'id' | 'label'>) => PROVIDER_EN[p.id]?.label ?? english(p.label) ?? p.id;
/** A provider's check in English: its own words when they are English (a system error), else only whether it works, and for the
 *  fix the provider's own when it is English (npm run setup, xcode-select --install), else this file's for that provider. */
export function providerStatus(p: Pick<Provider, 'id' | 'label'>, s: { ok: boolean; detail: string; install?: string; version?: string }): { detail?: string; fix?: string } {
  return { detail: english(s.detail), fix: s.install ? english(s.install) ?? PROVIDER_EN[p.id]?.install ?? 'npm run providers -- --all' : undefined };
}

/** A provider's own check as a row (the face detection and text recognition of toolkit phase 5). */
export async function providerCheck(name: string, p: Provider): Promise<Check> {
  const s = await p.check().catch((e: Error) => ({ ok: false, detail: e.message.slice(0, 100), install: undefined, version: undefined }));
  const { detail, fix } = providerStatus(p, s);
  const head = `${providerLabel(p)}${s.version ? ` v${s.version}` : ''}`;
  return { name, ok: s.ok, detail: detail ? `${head}: ${detail}` : s.ok ? head : `${head}: does not work`, fix };
}

/** Every check doctor runs, in the order a newcomer fixes them. */
export async function allChecks(o: { whisperModel: string }): Promise<Check[]> {
  const [ffmpeg, uv, claude] = await Promise.all([checkFfmpeg(), checkUv(), checkClaude()]);
  const python = await checkPython();
  const config = loadProvidersConfig();
  const [faces, ocr, named, families] = await Promise.all([providerCheck('Face detection', facesProvider(config)), providerCheck('Text recognition', ocrProvider(config)), namedFonts().catch(() => []), googleFamilies().catch(() => [])]);
  return [checkPlatform(), checkNode(), checkNpm(), uv, ...ffmpeg, python, checkWhisperModel(o.whisperModel), faces, ocr, checkFonts(undefined, named, families), ...checkBuilds(), checkChrome(), claude];
}
