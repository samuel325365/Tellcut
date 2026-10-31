// What the Cut API's tests share (cut*.test.ts): a small project with one clip, a photo and a song, its inventory, a fresh Cut, a WAV.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseProject } from '@tellcut/engine';
import { Cut } from './cut.ts';
import type { Inventory } from './inventory.ts';

export const MIX = { master: 0.9, compressor: { threshold: -14, ratio: 3, attack: 0.01, release: 0.2 }, reverb: { seconds: 1.6, send: 0.35 } };

export const base = () => parseProject({ version: 1, meta: { name: 't', width: 1920, height: 1080, fps: 30, duration: 60, plugins: [], mix: MIX },
  sources: { v: { path: 'v.mp4', duration: 10, width: 1920, height: 1080, kind: 'video', audio: true }, ph: { path: 'p.jpg', duration: 3600, width: 900, height: 1200, kind: 'image' } },
  media: { song: { path: 'song.wav' } }, grids: [], tracks: [] });

export const inv = (dir: string): Inventory => ({ id: 't', dir, project: base(), chapters: [], photoSheets: [], overview: [],
  sources: [{ id: 'v', kind: 'video', duration: 10, width: 1920, height: 1080, orientation: 'landscape', audio: true, speech: '', sheets: [],
    segments: [[0, 2], [2, 7], [7, 10]], transcript: { language: 'zh', segments: [{ start: 1, end: 2.5, text: '大家好' }, { start: 6, end: 8, text: '出發' }] } }],
  music: [{ id: 'song', duration: 30, beats: { bpm: 120, offset: 0.25, beats: Array.from({ length: 60 }, (_, i) => 0.25 + i * 0.5) } }] });

export const fresh = () => { const dir = mkdtempSync(join(tmpdir(), 'cut-')); return new Cut(base(), inv(dir), dir); };

export const items = (c: Cut, track: string) => c.p.tracks.find((t) => t.id === track)!.items as any[];

/** a 16-bit mono WAV of `sec` seconds of silence at `sr` */
export const silentWav = (sec: number, sr = 48000) => {
  const n = Math.round(sec * sr), b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  return b;
};
