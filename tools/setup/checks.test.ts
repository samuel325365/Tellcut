import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FFMPEG, UV } from '@tellcut/media-node';
import { checkFonts, checkPlatform, editorBuildCheck, ffmpegMajor, hasCjk, hasVidstab, hfCachedWhisper, installHint, MODEL_COMPLETE, nodeMajor, playerBuildCheck, providerLabel, providerStatus, table, versionAtLeast, whisperModelDir } from './checks.ts';

test('versions: Claude Code at least the minimum', () => {
  expect(versionAtLeast('2.1.281 (Claude Code)', '2.1.242')).toBe(true);
  expect(versionAtLeast('2.1.242 (Claude Code)', '2.1.242')).toBe(true);
  expect(versionAtLeast('2.1.99 (Claude Code)', '2.1.242')).toBe(false);
  expect(versionAtLeast('3.0.0', '2.1.242')).toBe(true);
  expect(versionAtLeast('oops', '2.1.242')).toBeNull();
});

test('versions: ffmpeg builds and Node', () => {
  expect(ffmpegMajor('ffmpeg version 8.0.1-essentials_build-www.gyan.dev Copyright (c) 2000-2025')).toBe(8);
  expect(ffmpegMajor('ffmpeg version n7.1 Copyright')).toBe(7);
  expect(ffmpegMajor('something else')).toBeNull();
  expect(nodeMajor('24.15.0')).toBe(24);
});

test('the whisper model counts only with its model.bin: tellcut\'s own copy, or a snapshot in a Hugging Face cache to copy from', () => {
  const models = mkdtempSync(join(tmpdir(), 'models-')), own = join(models, 'whisper', 'large-v3-turbo');
  mkdirSync(own, { recursive: true });
  expect(whisperModelDir('large-v3-turbo', models)).toBeNull();             // an interrupted download
  writeFileSync(join(own, 'model.bin'), '');
  expect(whisperModelDir('large-v3-turbo', models)).toBeNull();             // model.bin but no completion stamp: an interrupted copy
  writeFileSync(join(own, MODEL_COMPLETE), '');
  expect(whisperModelDir('large-v3-turbo', models)).toBe(own);
  expect(whisperModelDir('tiny', models)).toBeNull();
  const hf = mkdtempSync(join(tmpdir(), 'hf-')), snap = join(hf, 'hub', 'models--mobiuslabsgmbh--faster-whisper-large-v3-turbo', 'snapshots', 'abc');
  mkdirSync(snap, { recursive: true });
  expect(hfCachedWhisper('large-v3-turbo', hf)).toBeNull();
  writeFileSync(join(snap, 'model.bin'), '');
  expect(hfCachedWhisper('large-v3-turbo', hf)).toBe(snap);
});

test('the table marks each item and says what to do next', () => {
  const t = table([{ name: 'Node.js', ok: true, detail: 'v24' }, { name: 'Speech model', ok: false, detail: 'not downloaded yet', fix: 'npm run setup' }]);
  expect(t).toContain('✓ Node.js');
  expect(t).toContain('✗ Speech model');
  expect(t).toContain('→ npm run setup');
  expect(t).toContain('1 item needs fixing');
  expect(table([{ name: 'Node.js', ok: true, detail: 'v24' }])).toContain('All set');
});

test('fonts: a fonts.css without any face counts as missing fonts (an offline download used to write that)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fonts-'));
  expect(checkFonts(dir)).toMatchObject({ ok: false, detail: 'not downloaded yet' });
  writeFileSync(join(dir, 'fonts.css'), '');
  expect(checkFonts(dir).ok).toBe(false);
  writeFileSync(join(dir, 'fonts.css'), "@font-face { font-family: 'A'; src: url(files/a.woff2); }");
  expect(checkFonts(dir).ok).toBe(true);
});

test('fonts: a full fonts.css from an older install, but without the TTF the 3D letters are extruded from, asks for npm run fonts', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fonts-'));
  writeFileSync(join(dir, 'fonts.css'), "@font-face { font-family: 'A'; src: url(files/a.woff2); }");
  const c = checkFonts(dir, ['Inter-700.ttf']);
  expect(c).toMatchObject({ ok: false, fix: expect.stringContaining('npm run fonts') });
  expect(c.detail).toContain('Inter-700.ttf');
  mkdirSync(join(dir, 'files'));
  writeFileSync(join(dir, 'files', 'Inter-700.ttf'), 'ttf');
  expect(checkFonts(dir, ['Inter-700.ttf']).ok).toBe(true);
});

test('fonts: a family the plugins added after the last download is named, so npm run fonts gets it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fonts-'));
  writeFileSync(join(dir, 'fonts.css'), "@font-face {\n  font-family: 'Noto Sans TC';\n  src: url(files/a.woff2);\n}\n@font-face { font-family: Bangers; src: url(files/b.woff2); }");
  expect(checkFonts(dir, [], ['Noto Sans TC', 'Bangers']).ok).toBe(true);
  const c = checkFonts(dir, [], ['Noto Sans TC', 'Iansui', 'Press Start 2P']);
  expect(c).toMatchObject({ ok: false, fix: expect.stringContaining('npm run fonts') });
  expect(c.detail).toContain('Iansui, Press Start 2P');
});

test('Windows and macOS are both supported systems; anything else is told so', () => {
  expect(checkPlatform('win32', '10.0.26100')).toEqual({ name: 'Windows', ok: true, detail: 'win32' });   // as before macOS support
  expect(checkPlatform('darwin', '25.5.0')).toEqual({ name: 'macOS', ok: true, detail: 'Darwin 25.5.0' });
  expect(checkPlatform('linux', '6.1')).toMatchObject({ ok: false });
});

test('ffmpeg needs both vid.stab filters for stabilised cuts', () => {
  const both = ' ... vidstabdetect      V->V       Extract relative transformations\n ... vidstabtransform   V->V       Transform the frames';
  expect(hasVidstab(both)).toBe(true);
  expect(hasVidstab(' ... vflip   V->V  Flip the input video vertically.')).toBe(false);
});

test('setup and doctor speak English: the install hints and the player build say it in their own words', () => {
  expect(installHint(UV)).toMatch(/^run npm run setup in tellcut\//);
  expect(installHint(FFMPEG, 'darwin')).toContain('brew install ffmpeg-full');
  expect(installHint(FFMPEG, 'win32')).toContain('tellcut/vendor/ffmpeg');
  expect(hasCjk(installHint(FFMPEG))).toBe(false);
  expect(playerBuildCheck(null, true)).toMatchObject({ ok: true });
  expect(playerBuildCheck('播放器還沒建置', false)).toMatchObject({ ok: false, detail: 'not built yet', fix: 'npm run build:player' });
  expect(playerBuildCheck('播放器的建置檔比原始碼舊', true).detail).toMatch(/^older than its source/);
  expect(editorBuildCheck(null, true)).toMatchObject({ ok: true, detail: 'apps/editor/dist' });
  expect(editorBuildCheck('編輯器還沒建置', false)).toMatchObject({ ok: false, detail: 'not built yet', fix: 'npm run build:editor' });
  expect(editorBuildCheck('編輯器的建置檔比原始碼舊', true)).toMatchObject({ ok: false, fix: 'npm run build:editor' });
  expect(editorBuildCheck('編輯器的建置檔比原始碼舊', true).detail).toMatch(/^older than its source/);
});

test('a provider row keeps only words that read in English, and gives its fix in English', () => {
  const win = { id: 'windows', label: 'Windows 內建文字辨識' };
  expect(providerLabel(win)).toBe('Windows built-in OCR');
  expect(providerLabel({ id: 'someday', label: '新的' })).toBe('someday');
  // the provider's own Chinese words are dropped, its Chinese fix replaced by this file's
  expect(providerStatus(win, { ok: false, detail: '沒有 zh-Hant-TW 的文字辨識', install: '設定 → 時間與語言' })).toEqual({ detail: undefined, fix: expect.stringContaining('Optical character recognition') });
  // a fix already in English, and a system's own error, come through as they are
  expect(providerStatus({ id: 'macos', label: 'x' }, { ok: false, detail: 'spawn swiftc ENOENT', install: 'xcode-select --install' })).toEqual({ detail: 'spawn swiftc ENOENT', fix: 'xcode-select --install' });
  expect(providerStatus(win, { ok: true, detail: '語言 zh-Hant-TW' })).toEqual({ detail: undefined, fix: undefined });
  // an unknown provider with a Chinese fix points at the providers list
  expect(providerStatus({ id: 'other', label: 'o' }, { ok: false, detail: '壞了', install: '修好它' }).fix).toBe('npm run providers -- --all');
});
