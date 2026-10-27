import { join } from 'node:path';
import { chromeSpec, claudeEnv, DepError, FFMPEG, locate, need, onPathDirs, pythonEnv, UV, type LookupEnv } from './deps.ts';

const fake = (files: string[], env: NodeJS.ProcessEnv = {}): LookupEnv =>
  ({ env: { PATHEXT: '.EXE;.CMD', ...env }, exists: (p) => files.includes(p), vendorDir: 'V:\\tellcut\\vendor', platform: 'win32' });

test('the environment variable wins, then tellcut/vendor, then PATH', () => {
  const vendored = join('V:\\tellcut\\vendor', 'ffmpeg', 'bin', 'ffmpeg.exe'), onPath = join('C:\\tools', 'ffmpeg.exe');
  expect(locate(FFMPEG, fake([vendored, onPath], { TELLCUT_FFMPEG: 'D:\\mine\\ffmpeg.exe', PATH: 'C:\\tools' }))).toEqual({ path: 'D:\\mine\\ffmpeg.exe', from: 'env' });
  expect(locate(FFMPEG, fake([vendored, onPath], { PATH: 'C:\\tools' }))).toEqual({ path: vendored, from: 'vendor' });
  expect(locate(FFMPEG, fake([onPath], { PATH: 'C:\\nothing;C:\\tools' }))).toEqual({ path: onPath, from: 'path' });
});

test('PATH is searched with the Windows extensions', () => {
  expect(onPathDirs('uv', fake([join('C:\\bin', 'uv.exe')], { PATH: 'C:\\bin' }))).toBe(join('C:\\bin', 'uv.exe'));
  expect(onPathDirs('claude', fake([join('C:\\npm', 'claude.cmd')], { PATH: 'C:\\npm' }))).toBe(join('C:\\npm', 'claude.cmd'));
  expect(onPathDirs('uv', fake([], { PATH: 'C:\\bin' }))).toBeNull();
});

test('Chrome is found in Program Files, Program Files (x86) or the user\'s own install, never from PATH', () => {
  const env = { ProgramFiles: 'C:\\Program Files', 'ProgramFiles(x86)': 'C:\\Program Files (x86)', LOCALAPPDATA: 'C:\\Users\\u\\AppData\\Local', PATH: 'C:\\bin' };
  const user = join('C:\\Users\\u\\AppData\\Local', 'Google', 'Chrome', 'Application', 'chrome.exe');
  const l = fake([user, join('C:\\bin', 'chrome.exe')], env);
  expect(locate(chromeSpec(l), l)).toEqual({ path: user, from: 'known' });
  const none = fake([join('C:\\bin', 'chrome.exe')], env);
  expect(locate(chromeSpec(none), none)).toBeNull();
});

test('a missing program is an error that says how to get it', () => {
  expect(() => need(UV, fake([], { PATH: '' }))).toThrow(DepError);
  expect(() => need(UV, fake([], { PATH: '' }))).toThrow(/找不到 uv：.*npm run setup.*TELLCUT_UV/);
});

test('a models folder of the user\u2019s own (TELLCUT_MODELS_DIR) also holds the Hugging Face cache; HF_HOME set on purpose still wins', () => {
  expect(pythonEnv({ TELLCUT_MODELS_DIR: 'D:\models' }).HF_HOME).toBe(join('D:\models', 'hf'));
  expect(pythonEnv({ TELLCUT_MODELS_DIR: 'D:\models', HF_HOME: 'E:\hf' }).HF_HOME).toBe('E:\hf');
});

test("claude runs without the calling session's variables but keeps the user's own login and setup", () => {
  const env = claudeEnv({ PATH: 'p', CLAUDECODE: '1', CLAUDE_CODE_SESSION_ID: 's', CLAUDE_CODE_ENTRYPOINT: 'cli', ANTHROPIC_API_KEY: 'k',
    CLAUDE_CONFIG_DIR: 'c', CLAUDE_CODE_GIT_BASH_PATH: 'b', CLAUDE_CODE_OAUTH_TOKEN: 't', CLAUDE_CODE_USE_BEDROCK: '1', CLAUDE_CODE_USE_VERTEX: '1' });
  expect(env).toEqual({ PATH: 'p', CLAUDE_CONFIG_DIR: 'c', CLAUDE_CODE_GIT_BASH_PATH: 'b', CLAUDE_CODE_OAUTH_TOKEN: 't', CLAUDE_CODE_USE_BEDROCK: '1', CLAUDE_CODE_USE_VERTEX: '1' });
});

test('a shell set up for an API gateway does not carry it into claude: no other key, endpoint or model than the login’s', () => {
  const env = claudeEnv({ PATH: 'p', ANTHROPIC_AUTH_TOKEN: 'gw', ANTHROPIC_BASE_URL: 'https://gw', ANTHROPIC_MODEL: 'm', ANTHROPIC_SMALL_FAST_MODEL: 's',
    ANTHROPIC_DEFAULT_SONNET_MODEL: 'd', ANTHROPIC_CUSTOM_HEADERS: 'h', anthropic_base_url: 'x', ANTHROPIC_VERTEX_PROJECT_ID: 'v', ANTHROPIC_BEDROCK_BASE_URL: 'bb' });
  expect(env).toEqual({ PATH: 'p', ANTHROPIC_VERTEX_PROJECT_ID: 'v', ANTHROPIC_BEDROCK_BASE_URL: 'bb' });   // what the kept Bedrock/Vertex switches need
});
