// A busy project for timeline e2e and screenshots (spec 2026-10-28-timeline-refresh A1): many text blocks on overlay tracks
// and a ducked music bed, like what the agent makes, with no private material. The footage is the one src.mp4 that
// apps/server/src/test-utils.ts makeSource writes (4 s, 320×180, with a tone).
const MIX = { master: 0.9, compressor: { threshold: -12, ratio: 3, attack: 0.01, release: 0.2 }, reverb: { seconds: 0.5, send: 0.3 } };
const WORDS = ['A morning in the old town', '七百年的廣場', 'Coffee first', '巷子裡的麵包店', 'The market opens', '下午三點的光',
  'Up the hill', '海邊的風', 'Dinner by the river', '最後一班電車', 'Night walk', '明天見'];

export function denseProject(o: { width?: number; height?: number } = {}): any {
  const clips = Array.from({ length: 5 }, (_, i) => ({ id: `c${i}`, source: 's1', in: 0, speed: 1, start: i * 4, end: i * 4 + 4,
    crop: { from: { x: 0.5, y: 0.5, zoom: 1 }, to: { x: 0.5, y: 0.5, zoom: 1.1 } } }));
  const titles = WORDS.map((text, i) => ({ id: `t${i}`, type: 'core.caption', start: i * 1.6, end: i * 1.6 + 1.5, params: { text } }));
  const marks = Array.from({ length: 6 }, (_, i) => ({ id: `l${i}`, type: 'core.lowerThird', start: i * 3.2 + 0.4, end: i * 3.2 + 2.8, params: { text: WORDS[(i * 5) % WORDS.length], sub: 'Day 1' } }));
  const heads = Array.from({ length: 4 }, (_, i) => ({ id: `h${i}`, type: 'core.title', start: i * 5, end: i * 5 + 1.8, params: { text: `Chapter ${i + 1}` } }));
  const flashes = Array.from({ length: 4 }, (_, i) => ({ id: `f${i}`, type: 'core.flash', start: i * 5 + 3.9, end: i * 5 + 4.2, params: {} }));
  // a ducked bed: 30 points dipping under every caption
  const envelope: Array<[number, number]> = Array.from({ length: 30 }, (_, i) => [Math.round(i * (3.9 / 29) * 1000) / 1000, i % 3 === 1 ? -9 : 0]);
  return {
    version: 1,
    meta: { name: 'Dense', width: o.width ?? 1920, height: o.height ?? 1080, fps: 30, duration: 20, plugins: [], cut: { crf: 23, preset: 'ultrafast' }, mix: MIX },
    sources: { s1: { path: 'src.mp4', duration: 4, width: 320, height: 180 } },
    media: { bed: { path: 'src.mp4', duration: 4 } },
    grids: [],
    tracks: [
      { id: 'v', kind: 'video', items: clips },
      { id: 'heads', kind: 'overlay', name: 'Titles', items: heads },
      { id: 'caps', kind: 'overlay', name: 'Text', items: titles },
      { id: 'marks', kind: 'overlay', name: 'Marks', items: [...marks, ...flashes] },
      { id: 'mu', kind: 'music', name: 'Music', gain: 0, items: [{ id: 'm1', media: 'bed', in: 0, start: 0, end: 4, gain: 0, fadeIn: 0.5, fadeOut: 0.5, envelope }] },
    ],
  };
}
