import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkFonts, ffmpegMajor, hfCachedWhisper, MODEL_COMPLETE, nodeMajor, table, versionAtLeast, whisperModelDir } from './checks.ts';

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
  const t = table([{ name: 'Node.js', ok: true, detail: 'v24' }, { name: '語音辨識模型', ok: false, detail: '還沒下載', fix: 'npm run setup' }]);
  expect(t).toContain('✓ Node.js');
  expect(t).toContain('✗ 語音辨識模型');
  expect(t).toContain('→ npm run setup');
  expect(t).toContain('1 項要處理');
  expect(table([{ name: 'Node.js', ok: true, detail: 'v24' }])).toContain('全部就緒');
});

test('fonts: a fonts.css without any face counts as missing fonts (an offline download used to write that)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fonts-'));
  expect(checkFonts(dir)).toMatchObject({ ok: false, detail: '還沒下載' });
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
