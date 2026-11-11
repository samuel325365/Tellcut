import { parseProject, type SceneItem } from '@tellcut/engine';
import { DEMO, audiogram, fullScale, peakLevelAt, sourceAt, soundSpans, speakerAt, speakerPaletteColor } from './audiogram.ts';

const crop = { from: { x: 0.5, y: 0.5, zoom: 1 }, to: { x: 0.5, y: 0.5, zoom: 1 } };
const audio = (id: string, source: string, start: number, end: number, inS: number, rate = 1) => ({ id, source, in: inS, rate, start, end, gain: 0, fadeIn: 0, fadeOut: 0 });
function project(o: { parent?: string; start?: number; end?: number; params?: Record<string, unknown> } = {}) {
  return parseProject({ version: 1,
    meta: { name: 't', width: 1080, height: 1920, fps: 30, duration: 20, plugins: [],
      mix: { master: 0.9, compressor: { threshold: -14, ratio: 3, attack: 0.01, release: 0.2 }, reverb: { seconds: 1, send: 0 } } },
    sources: { s1: { path: 'a.mp4', duration: 600, width: 1920, height: 1080 }, s2: { path: 'b.mp4', duration: 600, width: 1920, height: 1080 },
      ph: { path: 'c.jpg', duration: 1, width: 800, height: 800, kind: 'image' } },
    media: {}, grids: [],
    tracks: [
      // two clips of one talk, the second trimmed (in 40) and at 1.25×; the sound sits on the audio track as cut.ts links it
      { id: 'v1', kind: 'video', items: [{ id: 'c1', source: 's1', in: 10, speed: 1, start: 0, end: 4, crop }, { id: 'c2', source: 's1', in: 40, speed: 1.25, start: 4, end: 8, crop },
        { id: 'p1', source: 'ph', in: 0, speed: 1, start: 8, end: 10, crop }] },
      { id: 'a1', kind: 'audio', items: [audio('l1', 's1', 0, 4, 10), audio('l2', 's1', 4, 8, 40, 1.25), audio('l3', 's2', 8, 10, 100)] },
      { id: 'o', kind: 'overlay', items: [{ id: 'g', type: 'common.audiogram', start: o.start ?? 0, end: o.end ?? 4, params: o.params ?? {}, ...(o.parent ? { parent: o.parent } : {}) }] },
    ] });
}
const itemOf = (p: ReturnType<typeof project>) => p.tracks[2].items[0] as SceneItem;
const P = (o: Partial<{ source: string; at: number }> = {}) => ({ source: '', at: -1, ...o });

test('hung on a clip: the clip\'s source, in and speed turn film time into source time, also after a trim', () => {
  const p = project({ parent: 'c2', start: 0.5, end: 3.5 }), it = itemOf(p), spans = soundSpans(it, P(), p)!;
  expect(spans).toEqual([{ source: 's1', start: 4, end: 8, in: 40, rate: 1.25 }]);
  expect(sourceAt(spans, 4)).toEqual({ source: 's1', s: 40 });
  expect(sourceAt(spans, 6)!.s).toBeCloseTo(42.5, 9);
  expect(sourceAt(spans, 8)).toBeNull();   // past the clip: nothing heard
  expect(sourceAt(spans, 3.9)).toBeNull();
  // trimming the clip's head (in and start move together) keeps every film moment on the same source second
  const trimmed = project({ parent: 'c2', start: 0.5, end: 3.5 });
  const c2 = trimmed.tracks[0].items[1] as any; c2.in = 41.25; c2.start = 5;
  expect(sourceAt(soundSpans(itemOf(trimmed), P(), trimmed)!, 6)!.s).toBeCloseTo(42.5, 9);
  // an audio clip as parent reads its rate
  expect(soundSpans(itemOf(project({ parent: 'l2' })), P(), project({ parent: 'l2' }))).toEqual([{ source: 's1', start: 4, end: 8, in: 40, rate: 1.25 }]);
});

test('not hung: it follows the speech playing on the audio tracks (tightened clips too), one source when named, a fixed second with at', () => {
  const p = project({ end: 10 }), it = itemOf(p);
  const all = soundSpans(it, P(), p)!;
  expect(all.map((s) => s.source)).toEqual(['s1', 's1', 's2']);
  expect(sourceAt(all, 1)).toEqual({ source: 's1', s: 11 });
  expect(sourceAt(all, 5)!.s).toBeCloseTo(41.25, 9);
  expect(sourceAt(all, 9)).toEqual({ source: 's2', s: 101 });
  expect(soundSpans(it, P({ source: 's2' }), p)!.map((s) => s.source)).toEqual(['s2']);
  expect(sourceAt(soundSpans(it, P({ source: 's2' }), p)!, 1)).toBeNull();
  // at: the item's start is that second of the source, whatever the timeline plays
  const fixed = soundSpans(it, P({ source: 's2', at: 30 }), p)!;
  expect(sourceAt(fixed, 2.5)).toEqual({ source: 's2', s: 32.5 });
  // hung on a photo: it has no sound of its own, so the timeline's sound
  expect(soundSpans(itemOf(project({ parent: 'p1' })), P(), project({ parent: 'p1' }))!.length).toBe(3);
  // a muted clip or track is not heard
  const m = project(); (m.tracks[1].items[0] as any).muted = true;
  expect(soundSpans(itemOf(m), P(), m)!.length).toBe(2);
  // all of it muted: silence, not the made-up levels (those are only for a project with no sound clips at all)
  m.tracks[1].muted = true;
  expect(soundSpans(itemOf(m), P(), m)).toEqual([]);
  m.tracks[1].items = [];
  expect(soundSpans(itemOf(m), P(), m)).toBeNull();
});

test('media(): the peaks of what it listens to, and the cover still; nothing for a photo', () => {
  const p = project({ parent: 'c1' }), it = itemOf(p);
  expect(audiogram.media!(it, p)).toEqual({ videos: [], stills: [], peaks: ['s1'] });
  const free = project({ end: 10 });
  expect(audiogram.media!(itemOf(free), free).peaks).toEqual(['s1', 's2']);
  const art = { ...itemOf(free), params: { artSource: 's2', artT: 12.5 } };
  expect(audiogram.media!(art, free).stills).toEqual([{ source: 's2', t: 12.5, w: 1080 }]);
  // a picture file wins over a still of the footage
  expect(audiogram.media!({ ...art, params: { ...art.params, art: 'media/cover.jpg' } }, free).stills).toEqual([]);
  const none = project(); none.tracks[1].items = [];
  expect(audiogram.media!(itemOf(none), none)).toEqual({ videos: [], stills: [], peaks: [] });
});

test('level: root mean square of the peaks around the moment, against the 95th percentile, times gain', () => {
  // 100 a second: one second of 0.5, one of silence, a single spike of 1 at 2.5 s
  const peaks = [...Array(100).fill(0.5), ...Array(100).fill(0), ...Array(50).fill(0), 1, ...Array(49).fill(0)];
  const d = { rate: 100, peaks };
  expect(fullScale(d)).toBe(0.5);   // the spike is above the 95th percentile: it does not make everything else small
  expect(peakLevelAt(d, 0.5, 0.06)).toBeCloseTo(1, 9);
  expect(peakLevelAt(d, 0.5, 0.06, 0.5)).toBeCloseTo(0.5, 9);
  expect(peakLevelAt(d, 1.5, 0.06)).toBe(0);
  expect(peakLevelAt(d, 2.5, 0.06)).toBeGreaterThan(0.5);
  expect(peakLevelAt(d, 2.5, 0.06)).toBeLessThan(1);   // one spike in a 0.12 s window is softened
  // the window straddling the end of the loud second falls off smoothly
  const edge = [0.94, 0.97, 1, 1.03, 1.06].map((s) => peakLevelAt(d, s, 0.06));
  expect(edge.every((v, i) => i === 0 || v < edge[i - 1])).toBe(true);
  // outside the data, no data, all silence: 0, never a throw
  expect(peakLevelAt(d, -3, 0.06)).toBe(0);
  expect(peakLevelAt(d, 99, 0.06)).toBe(0);
  expect(peakLevelAt(null, 1, 0.06)).toBe(0);
  expect(peakLevelAt({ rate: 100, peaks: [] }, 1, 0.06)).toBe(0);
  expect(peakLevelAt({ rate: 100, peaks: [0, 0, 0] }, 0.01, 0.06)).toBe(0);
  expect(peakLevelAt(d, 0.5, 0.06, 5)).toBe(1);
});

test('speaker: the colour and the name switch exactly on the change, colours from the theme unless given', () => {
  const sp = [[0, 5, 1], [5, 9, 2], [12, 14, 1]];
  expect(speakerAt(sp, 4.999)).toBe(1);
  expect(speakerAt(sp, 5)).toBe(2);
  expect(speakerAt(sp, 10)).toBe(0);
  expect(speakerAt(sp, 12)).toBe(1);
  expect(speakerAt('nonsense', 3)).toBe(0);
  expect(speakerAt([[1, 'x', 2], null], 1.5)).toBe(0);
  const theme = { palette: { ink: '#111111', paper: '#ffffff', accent: '#ff0000', accent2: '#00ff00', hl: '#0000ff' } } as any;
  expect([0, 1, 2, 3, 4].map((w) => speakerPaletteColor(w, [], theme))).toEqual(['#ff0000', '#ff0000', '#00ff00', '#0000ff', '#ff0000']);
  expect(speakerPaletteColor(2, ['', '', '#abcdef'], theme)).toBe('#abcdef');
  expect(speakerPaletteColor(1, ['', '', '#abcdef'], theme)).toBe('#ff0000');
});

test('with nothing to listen to it shows made-up speech: the same every time, with pauses', () => {
  expect(DEMO.rate).toBe(100);
  expect(DEMO.peaks.length).toBeGreaterThan(800);
  const levels = DEMO.peaks.map((_, i) => peakLevelAt(DEMO, i / 100, 0.06));
  expect(Math.max(...levels)).toBeGreaterThan(0.9);
  expect(levels.filter((v) => v < 0.05).length).toBeGreaterThan(50);   // breaths between phrases
  expect(DEMO.peaks.every((v) => v >= 0 && v <= 1)).toBe(true);
});
