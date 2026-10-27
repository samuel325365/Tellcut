// Shared project for the command tests (not a test file itself).
import { parseProject, type Project } from '../schema.ts';
import { findItem } from './core.ts';

const crop = (z0: number, z1: number) => ({ from: { x: 0.5, y: 0.5, zoom: z0 }, to: { x: 0.5, y: 0.5, zoom: z1 } });

export function fixture(): Project {
  return parseProject({
    version: 1,
    meta: { name: 't', width: 320, height: 180, fps: 25, duration: 20, plugins: [],
      mix: { master: 0.9, compressor: { threshold: -12, ratio: 3, attack: 0.01, release: 0.2 }, reverb: { seconds: 0.5, send: 0.3 } } },
    sources: { s: { path: 's.mp4', duration: 30 }, a: { path: 'a.wav', duration: 30 } },
    media: { m: { path: 'm.mp3' } },
    grids: [{ id: 'g', at: 1, bpm: 120, until: 5 }],
    markers: [{ t: 7.3, label: 'x' }],
    tracks: [
      { id: 'sc', kind: 'scene', items: [{ id: 'blk', type: 'x.block', start: 2, end: 6, params: {} }] },
      { id: 'v', kind: 'video', items: [
        { id: 'c1', source: 's', in: 1, speed: 1, start: 0, end: 4, crop: crop(1, 2) },
        { id: 'c2', source: 's', in: 10, speed: 2, start: 4, end: 8, crop: crop(1, 1), transitionIn: { type: 'dissolve', dur: 0.5 }, freezeAt: 3 },
      ] },
      { id: 'v2', kind: 'video', items: [] },
      { id: 'mu', kind: 'music', items: [{ id: 'm1', media: 'm', in: 0, start: 0, end: 10, gain: 0, fadeIn: 1, fadeOut: 1, envelope: [[0, 0], [5, -6], [10, 0]] }] },
      { id: 'au', kind: 'audio', items: [{ id: 'a1', source: 'a', in: 2, rate: 1, start: 1, end: 3, gain: 0, fadeIn: 0, fadeOut: 0 }] },
      { id: 'fx', kind: 'sfx', items: [
        { id: 'tap', type: 'x.tap', start: 0.5, end: 0.6, params: {}, gain: 0, parent: 'blk' },
        { id: 'tap2', type: 'x.tap', start: 3, end: 3.1, params: {}, gain: 0, parent: 'blk' },
      ] },
    ],
  });
}

export const run = <A>(p: Project, cmd: (d: Project, a: A) => unknown, a: A): Project => { const d = structuredClone(p); cmd(d, a); return d; };
export const item = (p: Project, id: string): any => findItem(p, id).item;
