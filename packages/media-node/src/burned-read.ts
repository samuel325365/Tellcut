// The footage's own text, checked (2026-11-06): burned.ts finds edges that stay put over a moving picture, and so also finds a
// locked-off shot's buildings against moving clouds, a railing over water. Text recognition looks at just those boxes — a frame
// from the middle of each piece, the box cut with a margin and enlarged (the small "6:00 AM" of a 720p vlog was read only enlarged)
// — and what it reads is kept as the piece's words. A piece nothing is read in stays a guess.
// The crops come from the proxy (540 px high, a keyframe every 12 frames): a seek in the source decodes from its keyframe before,
// seconds away in stock footage, and a 4K clip's ten crops took 40 s; the proxy enlarged three times read as many pieces of a 16-minute
// vlog as the 720p source enlarged twice (23 against 25), in two thirds of the time.
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { abortError, ffmpeg, probeSize } from './ffmpeg.ts';
import { ocrProvider } from './providers/index.ts';
import type { OcrProvider } from './providers/types.ts';
import { readableWords, settleText, type Burned, type BurnedText } from './burned.ts';

/** around the box (fractions of the picture): the box is 16 px cells of a 480 px frame, a letter's edge may lie just outside */
const MARGIN = 0.03;
/** crops cut by one ffmpeg run (each its own input, seeked on its own): ffmpeg's start-up is the slow part, decoders the memory */
const BATCH = 8;

/** the crop of piece `t` as an ffmpeg filter, enlarged `k` times */
export function cropFilter(t: BurnedText, k: number): string {
  const [x, y, w, h] = t.rect, x0 = Math.max(0, x - MARGIN), y0 = Math.max(0, y - MARGIN), x1 = Math.min(1, x + w + MARGIN), y1 = Math.min(1, y + h + MARGIN);
  const f = (n: number) => n.toFixed(4);
  return `crop=w=iw*${f(x1 - x0)}:h=ih*${f(y1 - y0)}:x=iw*${f(x0)}:y=ih*${f(y0)}${k > 1 ? `,scale=w=iw*${k}:h=-2:flags=lanczos` : ''}`;
}

/** where in a piece's span to look: the middle, then (when the middle read nothing) a third of the way in */
const lookAt = (t: BurnedText, pass: number) => { const [a, b] = t.span; return +(a + (b - a) * (pass === 0 ? 0.5 : 0.3)).toFixed(2); };

/** one picture per job: the crop of `src` at `at` s into `out`; a job ffmpeg cannot make (a time past the end) is left out */
async function cutCrops(src: string, jobs: Array<{ at: number; filter: string; out: string }>, signal?: AbortSignal) {
  for (let i = 0; i < jobs.length; i += BATCH) {
    const part = jobs.slice(i, i + BATCH);
    const args = [...part.flatMap((j) => ['-ss', String(j.at), '-i', src]), '-filter_complex', part.map((j, k) => `[${k}:v]${j.filter}[o${k}]`).join(';'),
      ...part.flatMap((j, k) => ['-map', `[o${k}]`, '-frames:v', '1', j.out])];
    try { await ffmpeg(args, { signal }); } catch (e) {
      if (signal?.aborted) throw e;
      // one bad crop failed them all: each on its own
      for (const j of part) await ffmpeg(['-ss', String(j.at), '-i', src, '-vf', j.filter, '-frames:v', '1', j.out], { signal }).catch((e2) => { if (signal?.aborted) throw e2; });
    }
  }
}

/**
 * `b` with its text pieces read by text recognition (settleText), the crops cut from `video` (the proxy): enlarged three times
 * when it is up to 600 px high, twice up to 1080. Never
 * fails for want of OCR: with none (no OCR language, no swiftc on a Mac) or when it breaks or runs out of time (the providers'
 * ocrTimeout), the pieces stay guesses and `ocr` says why; sourceExtras reads such a result again next time. Only an abort is thrown.
 */
export async function readBurnedText(video: string, b: Burned, o: { ocr?: OcrProvider; signal?: AbortSignal } = {}): Promise<Burned> {
  const text = b.text ?? [];
  if (!text.length) return settleText(b, []);
  const why = (e: unknown) => (e as Error).message.split('\n')[0].slice(0, 120);
  let provider: OcrProvider;
  try { provider = o.ocr ?? ocrProvider(); } catch (e) { return settleText(b, null, why(e)); }
  const height = await probeSize(video).then((s) => s.height, () => 1080), k = height <= 600 ? 3 : height <= 1080 ? 2 : 1;
  const tmp = mkdtempSync(join(tmpdir(), 'burned-read-')), words: string[] = text.map(() => '');
  try {
    for (const pass of [0, 1]) {
      const todo = text.map((t, i) => ({ t, i })).filter(({ i }) => !readableWords(words[i]));
      if (!todo.length) break;
      const jobs = todo.map(({ t, i }) => ({ i, at: lookAt(t, pass), filter: cropFilter(t, k), out: join(tmp, `${pass}-${i}.png`) }));
      await cutCrops(video, jobs, o.signal);
      const made = jobs.filter((j) => existsSync(j.out));
      if (!made.length) continue;
      if (o.signal?.aborted) throw abortError();
      const read = await provider.read(made.map((j) => j.out), { signal: o.signal });
      const byImage = new Map(read.map((r) => [r.image, r.lines.map((l) => l.text).join(' ')]));
      // by the picture's name, else by its place (the results come in the order given)
      made.forEach((j, n) => { words[j.i] = byImage.get(j.out) ?? (read[n]?.lines ?? []).map((l) => l.text).join(' '); });
    }
  } catch (e) {
    if (o.signal?.aborted) throw e;
    return settleText(b, null, why(e));
  } finally { rmSync(tmp, { recursive: true, force: true }); }
  return settleText(b, words);
}
