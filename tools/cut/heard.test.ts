// What check and the music's ducking hear: a clip's speech, by its transcript's words when it has them.
import { parseProject } from '@tellcut/engine';
import { heardSpeech } from './mix.ts';

const MIX = { master: 0.9, compressor: { threshold: -14, ratio: 3, attack: 0.01, release: 0.2 }, reverb: { seconds: 1, send: 0 } };
const project = (from: number, len: number) => parseProject({ version: 1, meta: { name: 't', width: 1080, height: 1920, fps: 30, duration: 10, plugins: [], mix: MIX },
  sources: { v: { path: 'v.mp4', duration: 60, kind: 'video', audio: true } }, media: {}, grids: [],
  tracks: [{ id: 'a', kind: 'audio', items: [{ id: 's', source: 'v', in: from, rate: 1, start: 0, end: len, gain: 0, fadeIn: 0, fadeOut: 0 }] }] });
const said = (at: number, text: string) => { const ws = text.split(' '); return { start: at, end: at + ws.length * 0.4, text, words: ws.map((w, k) => ({ start: at + k * 0.4, end: at + k * 0.4 + 0.35, word: ` ${w}` })) }; };

test('a sentence the clip cuts is heard as the words it plays (acceptance films 2026-11-05: its whole text matched the wrong caption)', () => {
  const tr = { language: 'en', segments: [said(0, 'we are so excited this is one of my favourite views')] };
  const h = heardSpeech(project(1.6, 3), () => tr);     // plays 1.6–4.6 s of the source: the words whose middle is in it
  expect(h.map((x) => x.text)).toEqual(['this is one of my favourite views']);
  expect(h[0].t[0]).toBeCloseTo(0);
  // without word times, the sentence as it is
  const plain = { language: 'en', segments: [{ start: 0, end: 4, text: 'we are so excited' }] };
  expect(heardSpeech(project(1, 2), () => plain).map((x) => x.text)).toEqual(['we are so excited']);
});
