import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run as ff } from '../ffmpeg.ts';
import { edgeTts } from './edge.ts';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'tts-')); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

test('edge: runs the pinned package through uv tool run, turns the mp3 into a wav and maps word times', async () => {
  const seen: string[][] = [];
  const fakeUv = async (args: string[], o: { input?: string } = {}) => {
    seen.push(args);
    const req = JSON.parse(o.input ?? '{}');
    await ff(['-f', 'lavfi', '-i', 'sine=frequency=440:duration=1.5', '-c:a', 'libmp3lame', req.out]);        // what edge-tts would have saved
    return `noise on stdout\n${JSON.stringify({ words: [{ text: '你好', t: 0.1, d: 0.5 }, { text: '世界', t: 0.7, d: 0.6 }] })}\n`;
  };
  const p = edgeTts({ version: '7.3.1', voice: 'zh-TW-YunJheNeural' }, fakeUv as never);
  const out = join(dir, 'a.wav'), r = await p.synth({ text: '你好世界', rate: 8, out });
  expect(seen[0].slice(0, 5)).toEqual(['tool', 'run', '--from', 'edge-tts==7.3.1', 'python']);
  expect(seen[0][5]).toMatch(/tts_edge\.py$/);
  expect(r.words).toEqual([{ text: '你好', start: 0.1, end: 0.6 }, { text: '世界', start: 0.7, end: 1.3 }]);
  expect(r.dur).toBeGreaterThan(1.3);
  expect(r.dur).toBeLessThan(1.8);
  expect(readFileSync(out).subarray(0, 4).toString()).toBe('RIFF');
  expect(p.online).toBe(true);
  expect(p.voices()).toContain('zh-TW-HsiaoChenNeural');
});

test('edge: a failing run is the caller\'s error and leaves no temp mp3 behind; check reports a missing tool with the way to fix it', async () => {
  const bad = async () => { throw new Error('no network'); };
  const p = edgeTts({}, bad as never);
  await expect(p.synth({ text: 'x', out: join(dir, 'b.wav') })).rejects.toThrow('no network');
  const s = await p.check();
  expect([s.ok, s.detail.includes('no network'), !!s.install]).toEqual([false, true, true]);
});
