// The Cut API: tighten (pauses in talk shortened on the word times).
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Cut } from './cut.ts';
import { CUT_API } from './api-doc.ts';
import { tightenClip } from './tighten.ts';
import { cropAt } from '@tellcut/engine';
import { base, inv, items } from './cut-test-kit.ts';

describe('tighten (pauses in talk shortened on the word times)', () => {
  const talk = (segments: any[]) => { const dir = mkdtempSync(join(tmpdir(), 'cut-')), i = inv(dir); i.sources[0].transcript = { language: 'zh', segments }; return new Cut(base(), i, dir); };
  const A = { start: 1, end: 2, text: '大家好', words: [{ start: 1, end: 1.4, word: '大家' }, { start: 1.4, end: 2, word: '好' }] };
  const B = { start: 3.5, end: 4.6, text: '我們出發', words: [{ start: 3.5, end: 4, word: '我們' }, { start: 4.1, end: 4.6, word: '出發' }] };

  test('silences longer than maxGap shrink to keep: before the first word, between words, after the last; the sound is cut with the picture', async () => {
    const c = talk([A, B]), id = c.clip('v', { from: 0, len: 10 });
    const ids = c.tighten(id);
    expect(items(c, "v1").some((i) => i.id === id)).toBe(false);   // the head pause was the start of the clip: the pieces are new
    expect(items(c, 'v1').map((i) => [i.in, i.start, i.end])).toEqual([[0.85, 0, 1.3], [3.35, 1.3, 2.7]]);
    expect(items(c, 'orig').map((i) => [i.parent, i.in, i.start, i.end])).toEqual([[ids[0], 0.85, 0, 1.3], [ids[1], 3.35, 0, 1.4]]);
    expect(items(c, 'orig').every((i) => i.fadeIn >= 0.03 && i.fadeOut >= 0.03)).toBe(true);
    expect(c.time).toBe(2.7);
    expect(c.notes.join()).toContain('3 個停頓');
    // the head and tail keep half of keep (0.85 is 0.15 before the first word), as the cut-api line says
    expect(CUT_API.find(([n]) => n === 'tighten')![2]).toContain('頭尾超過 maxGap 秒的只留 keep 的一半');
    // the rest of the script goes on from the new end
    c.clip('v', { from: 0, len: 1 });
    expect(items(c, 'v1').at(-1).start).toBe(2.7);
    await c.save();
  });

  test('a short pause stays; no transcript or no speech leaves the clip alone with a note', () => {
    const c = talk([B]), id = c.clip('v', { from: 3.5, len: 1.1 });
    expect(c.tighten(id)).toEqual([id]);
    expect(items(c, 'v1').map((i) => [i.in, i.end])).toEqual([[3.5, 1.1]]);
    const none = talk([A]), n = none.clip('v', { from: 5, len: 3 });
    expect(none.tighten(n)).toEqual([n]);
    expect(none.notes.join()).toContain('沒有講話');
    // a 0.5 s pause is under the default maxGap (0.6 s)
    const half = talk([{ start: 3.5, end: 5, text: '我們出發', words: [{ start: 3.5, end: 4, word: '我們' }, { start: 4.5, end: 5, word: '出發' }] }]);
    const h = half.clip('v', { from: 3.5, len: 1.5 });
    expect(half.tighten(h)).toEqual([h]);
    // over maxGap, but what keep leaves of it is under 0.1 s: not worth a cut (0.3 s pause, 0.25 s kept)
    const tiny = talk([{ start: 3.5, end: 4.8, text: '我們出發', words: [{ start: 3.5, end: 4, word: '我們' }, { start: 4.3, end: 4.8, word: '出發' }] }]);
    const t = tiny.clip('v', { from: 3.5, len: 1.3 });
    expect(tiny.tighten(t, { maxGap: 0.2, keep: 0.25 })).toEqual([t]);
    // a long word that overlaps the next one: the pause is measured from where the long one ends, not the short one
    const over = talk([{ start: 1, end: 3.5, text: '啊好了', words: [{ start: 1, end: 3, word: '啊' }, { start: 1.5, end: 2, word: '好' }, { start: 3.2, end: 3.5, word: '了' }] }]);
    const o = over.clip('v', { from: 1, len: 2.5 });
    expect(over.tighten(o)).toEqual([o]);
  });

  test('only the newest clip, before anything hangs on it', () => {
    const c = talk([A, B]), a = c.clip('v', { from: 0, len: 5 });
    c.clip('v', { from: 5, len: 2 });
    expect(() => c.tighten(a)).toThrow('最新的一段');
    const d = talk([A, B]), b = d.clip('v', { from: 0, len: 5 });
    d.speechCaptions(b);
    expect(() => d.tighten(b)).toThrow('先 tighten');
  });

  test('a head pause that ends inside the dissolve into the clip is still cut, and the dissolve stays', () => {
    const c = talk([A, B]);
    c.clip('v', { from: 5, len: 3, sound: false });
    c.tighten(c.clip('v', { from: 0, len: 10, transition: { type: 'dissolve', dur: 1 } }));   // the head pause ends at 0.85 s, inside the 1 s dissolve
    const v = items(c, 'v1');
    expect(v[1].transitionIn).toEqual({ type: 'dissolve', dur: 1 });
    expect(v[1].start).toBe(2);                                                    // still on the overlap
    expect(v[1].in).toBe(0.85);
  });

  test('review fixes: an effect laid over the clip keeps the film long enough; a dissolve into the clip stays; the camera move runs on across the joins', async () => {
    const c = talk([A, B]);
    c.effect('common.slam', { at: 0, len: 8, text: '開場' });
    c.tighten(c.clip('v', { from: 0, len: 10 }));
    expect((await c.save()).meta.duration).toBe(8);
    const d = talk([A, B]);
    d.clip('v', { from: 5, len: 3, sound: false });
    d.tighten(d.clip('v', { from: 0, len: 10, transition: { type: 'dissolve', dur: 0.5 } }));
    const v = items(d, 'v1');
    expect(v[1].transitionIn).toEqual({ type: 'dissolve', dur: 0.5 });
    expect(v[1].start).toBe(2.5);                                                   // still on the overlap
    const e = talk([A, B]), ids = e.tighten(e.clip('v', { from: 0, len: 10, crop: { from: { x: 0.5, y: 0.5, zoom: 1 }, to: { x: 0.5, y: 0.5, zoom: 1.27 } } }));
    const [p1, p2] = ids.map((id) => items(e, 'v1').find((i) => i.id === id));
    expect([p1.crop.from.zoom, p2.crop.to.zoom]).toEqual([1, 1.27]);
    expect(p1.crop.to.zoom).toBeCloseTo(p2.crop.from.zoom, 6);                       // no jump at the join
    // a move with keys is left as the engine's split cut it, each piece where its source moment is (it starts 0.85 s in, x 0.466),
    // not spread over the pieces from the move's start (x 0.5)
    const keyed = { from: { x: 0.5, y: 0.5, zoom: 1 }, to: { x: 0.5, y: 0.5, zoom: 1.27 }, keys: [{ t: 0, x: 0.5, y: 0.5, zoom: 1 }, { t: 5, x: 0.3, y: 0.5, zoom: 1.2 }] };
    const k = talk([A, B]), kids = k.tighten(k.clip('v', { from: 0, len: 10, crop: keyed as any }));
    expect(kids.length).toBe(2);
    expect(items(k, 'v1').find((i) => i.id === kids[0]).crop.from.x).toBeCloseTo(0.466, 6);
    // the keys are kept, not flattened into each piece's from / to: a key inside a piece stays on its source moment, and every
    // moment of every piece shows what that source moment showed in the untightened clip (source 0, speed 1: a piece's in is the
    // clip's own time). Pieces: source 0.85–2.15 and 3.35–4.75.
    const turn = { from: { x: 0.5, y: 0.5, zoom: 1 }, to: { x: 0.5, y: 0.5, zoom: 1 }, keys: [{ t: 1.5, x: 0.3, y: 0.5, zoom: 1.2 }, { t: 4, x: 0.7, y: 0.5, zoom: 1.6 }] };
    const m = talk([A, B]), mids = m.tighten(m.clip('v', { from: 0, len: 10, crop: turn as any }));
    const piece = (id: string) => items(m, 'v1').find((i) => i.id === id);
    expect([piece(mids[0]).crop.keys, piece(mids[1]).crop.keys]).toEqual([[{ t: 0.65, x: 0.3, y: 0.5, zoom: 1.2 }], [{ t: 0.65, x: 0.7, y: 0.5, zoom: 1.6 }]]);
    for (const id of mids) {
      const c = piece(id), len = c.end - c.start;
      for (let s = 0; s <= len + 1e-9; s += len / 8) {
        const now = cropAt(c.crop, s, len), was = cropAt(turn as any, c.in + s, 10);
        expect([now.x, now.zoom].map((v) => v.toFixed(6))).toEqual([was.x, was.zoom].map((v) => v.toFixed(6)));
      }
    }
  });

  test('captions over the pieces: each sentence once, on the piece it starts in; a sentence across a join is one caption', () => {
    const c = talk([A, B]), ids = c.tighten(c.clip('v', { from: 0, len: 10 }));
    c.speechCaptions(ids, { karaoke: true, type: 'common.caption' });
    expect(items(c, 'text').map((i) => [i.parent, i.start, i.end, i.params.text, i.params.words])).toEqual([
      [ids[0], 0.15, 1.15, '大家好', [[0, 2], [0.4, 3]]],
      [ids[1], 0.15, 1.25, '我們出發', [[0, 2], [0.6, 4]]],
    ]);
    const d = talk([{ start: 1, end: 4.6, text: '大家好我們出發', words: [...A.words, ...B.words] }]), jd = d.tighten(d.clip('v', { from: 0, len: 10 }));
    d.speechCaptions(jd);
    expect(items(d, 'text').map((i) => [i.parent, i.start, i.end])).toEqual([[jd[0], 0.15, 2.55]]);
    expect(d.wordTimes(jd, '出發')).toEqual([[2.05, 2.55]]);
  });
});

describe('tighten counts what it cut', () => {
  const talk = (segments: any[]) => { const dir = mkdtempSync(join(tmpdir(), 'cut-')), i = inv(dir); i.sources[0].transcript = { language: 'zh', segments }; return new Cut(base(), i, dir); };
  // with keep 0.02, the pause after a word ending at the clip's in point starts 0.02 s in: closer than a frame to the clip's edge,
  // so split cannot cut it there and it stays
  const edge = { start: -0.5, end: 0.01, text: '前', words: [{ start: -0.5, end: 0.01, word: '前' }] };
  const mid = { start: 2, end: 2.5, text: '大家好', words: [{ start: 2, end: 2.5, word: '大家好' }] };
  const last = { start: 4, end: 5, text: '出發', words: [{ start: 4, end: 5, word: '出發' }] };

  test('the note counts only the pauses really cut', () => {
    const c = talk([edge, mid, last]), id = c.clip('v', { from: 0, len: 5 });
    c.tighten(id, { keep: 0.02 });
    expect(c.notes.join()).toContain('tighten 剪掉 1 個停頓');
  });

  test('nothing cut: not reported as cut (the cursor and the end are left alone)', () => {
    const c = talk([edge, { ...mid, end: 5, words: [{ start: 2, end: 5, word: '大家好' }] }]), id = c.clip('v', { from: 0, len: 5 });
    expect(tightenClip(c.p, id, () => c.inv.sources[0].transcript, { keep: 0.02 }, []).cut).toBe(false);
    expect(c.notes.join()).not.toMatch(/剪掉/);
  });
});
