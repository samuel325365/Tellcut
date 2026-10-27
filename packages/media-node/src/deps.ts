// The outside programs Tellcut runs, found in one place (spec 2026-10-17-studio-handover §5). Order: an environment variable
// (TELLCUT_FFMPEG…), then tellcut/vendor/ (what `npm run setup` downloads), then the usual install folders, then PATH.
// A missing program is an error that says how to get it, instead of a bare ENOENT from spawn.
import { existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { TELLCUT_ROOT } from './paths.ts';

export const VENDOR_DIR = join(TELLCUT_ROOT, 'vendor');
export const MODELS_DIR = join(TELLCUT_ROOT, 'models');
/** where the models are: TELLCUT_MODELS_DIR when the user set it (setup, doctor, transcribe.py and the face model read the same), else tellcut/models */
export const modelsDir = () => process.env.TELLCUT_MODELS_DIR ?? MODELS_DIR;

export interface ExeSpec {
  /** what the user calls it, for messages */
  name: string;
  /** the environment variable that overrides everything */
  env: string;
  /** candidates inside tellcut/vendor (relative) */
  vendor?: string[];
  /** absolute candidates in the usual install folders */
  known?: string[];
  /** the bare command looked up on PATH (with Windows' PATHEXT); none: never from PATH */
  path?: string;
  /** what to do when it is nowhere */
  install: string;
}

export class DepError extends Error {
  constructor(public spec: ExeSpec, msg: string) { super(msg); this.name = 'DepError'; }
}

export interface LookupEnv { env: NodeJS.ProcessEnv; exists: (p: string) => boolean; vendorDir: string; platform: NodeJS.Platform }
const live = (): LookupEnv => ({ env: process.env, exists: existsSync, vendorDir: VENDOR_DIR, platform: process.platform });

/** The command on PATH: its full path, or null. */
export function onPathDirs(cmd: string, l: LookupEnv): string | null {
  const exts = l.platform === 'win32' ? ['', ...(l.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').map((e) => e.toLowerCase())] : [''];
  const pathVar = l.env.PATH ?? l.env.Path ?? '';
  for (const d of pathVar.split(l.platform === 'win32' ? ';' : delimiter)) {
    if (!d) continue;
    for (const e of exts) { const p = join(d, cmd + e); if (l.exists(p)) return p; }
  }
  return null;
}

/** Where `spec` is, or null; `from` says which rule found it (for npm run doctor). */
export function locate(spec: ExeSpec, l: LookupEnv = live()): { path: string; from: 'env' | 'vendor' | 'known' | 'path' } | null {
  const own = l.env[spec.env];
  if (own) return { path: own, from: 'env' };   // taken as given; a wrong one fails loudly when it runs
  for (const v of spec.vendor ?? []) { const p = join(l.vendorDir, v); if (l.exists(p)) return { path: p, from: 'vendor' }; }
  for (const p of spec.known ?? []) if (l.exists(p)) return { path: p, from: 'known' };
  if (spec.path) { const p = onPathDirs(spec.path, l); if (p) return { path: p, from: 'path' }; }
  return null;
}

export function need(spec: ExeSpec, l: LookupEnv = live()): string {
  const f = locate(spec, l);
  if (!f) throw new DepError(spec, `找不到 ${spec.name}：${spec.install}（或用環境變數 ${spec.env} 指到它）`);
  return f.path;
}

const exe = (n: string) => (process.platform === 'win32' ? `${n}.exe` : n);
const programFiles = (l: LookupEnv) => [l.env.ProgramFiles, l.env['ProgramFiles(x86)'], l.env.LOCALAPPDATA].filter((x): x is string => !!x);

export const FFMPEG: ExeSpec = { name: 'ffmpeg', env: 'TELLCUT_FFMPEG', vendor: [join('ffmpeg', 'bin', exe('ffmpeg'))], path: 'ffmpeg', install: '在 tellcut/ 跑 npm run setup（會下載到 tellcut/vendor/ffmpeg）' };
export const FFPROBE: ExeSpec = { name: 'ffprobe', env: 'TELLCUT_FFPROBE', vendor: [join('ffmpeg', 'bin', exe('ffprobe'))], path: 'ffprobe', install: '在 tellcut/ 跑 npm run setup（會下載到 tellcut/vendor/ffmpeg）' };
export const UV: ExeSpec = { name: 'uv', env: 'TELLCUT_UV', vendor: [join('uv', exe('uv'))], path: 'uv', install: '在 tellcut/ 跑 npm run setup（會下載到 tellcut/vendor/uv）' };
export const chromeSpec = (l: LookupEnv = live()): ExeSpec => ({
  name: 'Google Chrome', env: 'TELLCUT_CHROME', path: undefined,
  known: programFiles(l).map((d) => join(d, 'Google', 'Chrome', 'Application', 'chrome.exe')),
  install: '安裝 Google Chrome（https://www.google.com/chrome/）。匯出與檢查要用正式版 Chrome：Playwright 下載的 Chromium 不能播 H.264',
});
export const CLAUDE: ExeSpec = { name: 'Claude Code（claude）', env: 'TELLCUT_CLAUDE', path: 'claude', install: '安裝 Claude Code 並登入（https://claude.com/claude-code），頁面聊天要用' };

/**
 * What every uv / Python child runs with: the environment (tellcut/.venv), Python itself (tellcut/vendor/python, never a system
 * Python), uv's cache and tools (edge-tts) and the models (tellcut/models: whisper/<model> as plain files, hf/ for anything else) all inside tellcut/. A variable the user
 * set on purpose is kept.
 */
export function pythonEnv(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const own = (k: string, v: string) => base[k] ?? v;
  return {
    ...base,
    UV_PROJECT_ENVIRONMENT: own('UV_PROJECT_ENVIRONMENT', join(TELLCUT_ROOT, '.venv')),
    UV_PYTHON_INSTALL_DIR: own('UV_PYTHON_INSTALL_DIR', join(VENDOR_DIR, 'python')),
    UV_PYTHON_PREFERENCE: own('UV_PYTHON_PREFERENCE', 'only-managed'),
    UV_CACHE_DIR: own('UV_CACHE_DIR', join(TELLCUT_ROOT, '.cache', 'uv')),
    UV_TOOL_DIR: own('UV_TOOL_DIR', join(VENDOR_DIR, 'uv-tools')),
    // the Hugging Face cache lives in the models folder, the user's own one too (TELLCUT_MODELS_DIR)
    HF_HOME: own('HF_HOME', join(base.TELLCUT_MODELS_DIR ?? MODELS_DIR, 'hf')),
    TELLCUT_MODELS_DIR: own('TELLCUT_MODELS_DIR', MODELS_DIR),
    PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8',
  };
}

// looked up once per process: a program does not move while Tellcut runs
const memo = new Map<string, string>();
const once = (key: string, f: () => string) => { let v = memo.get(key); if (v === undefined) { v = f(); memo.set(key, v); } return v; };
export const ffmpegPath = () => once('ffmpeg', () => need(FFMPEG));
export const ffprobePath = () => once('ffprobe', () => need(FFPROBE));
export const uvPath = () => once('uv', () => need(UV));
export const chromePath = () => once('chrome', () => need(chromeSpec()));
/** the chat's command line program: TELLCUT_CLAUDE may be a whole command (tests use `node fake.mjs`), so it is not looked up */
export const claudeCmd = () => process.env.TELLCUT_CLAUDE ?? 'claude';

/**
 * The environment Tellcut runs claude in (the page chat, setup and doctor). A process started from a Claude Code session carries
 * that session's variables (CLAUDECODE, CLAUDE_CODE_SESSION_ID, _ENTRYPOINT, _MESSAGING_SOCKET, CLAUDE_PID, CLAUDE_EFFORT…, a
 * list that grows with each release): every CLAUDE* is dropped except the user's own setup (where the login lives, Git Bash on
 * Windows, a token login, Bedrock or Vertex), and so is ANTHROPIC_API_KEY: Tellcut uses the user's Claude Code login, never an
 * API key (chat spec §1.2). So are an API gateway's key, address and headers and a model picked in the shell (review4: a server
 * started from such a shell ran the page chat on API billing, on another model); the Bedrock/Vertex settings stay with their switches.
 */
const KEEP_CLAUDE_VARS = new Set(['CLAUDE_CONFIG_DIR', 'CLAUDE_CODE_GIT_BASH_PATH', 'CLAUDE_CODE_OAUTH_TOKEN', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX']);
const DROP_ANTHROPIC = /^ANTHROPIC_(API_KEY|AUTH_TOKEN|BASE_URL|CUSTOM_HEADERS|MODEL|SMALL_FAST_MODEL|DEFAULT_\w+_MODEL)$/i;
export function claudeEnv(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(base)) if ((!/^CLAUDE/i.test(k) || KEEP_CLAUDE_VARS.has(k.toUpperCase())) && !DROP_ANTHROPIC.test(k)) env[k] = v;
  return env;
}
/** the oldest Claude Code with what the page chat relies on: CLAUDE_CODE_PROMPT_CACHE_TTL (v2.1.242); claudeMdExcludes predates it */
export const CLAUDE_MIN_VERSION = '2.1.242';
