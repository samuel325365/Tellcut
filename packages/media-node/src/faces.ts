// Faces in a source over time (toolkit phase 5): sampled 5 times a second where they are asked for, from the proxy, by the
// faces provider (MediaPipe), kept in the source's analysis folder (faces.json) so a time is never looked at twice.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { analysisFiles } from './analysis.ts';
import { ffmpeg } from './ffmpeg.ts';
import { facesProvider } from './providers/index.ts';
import type { FaceInfo, FacesProvider } from './providers/types.ts';
import { replaceFile } from './fsutil.ts';

export const FACE_STEP = 0.2;
const VERSION = 1;
/** a time on the sampling grid, as the cache's key */
export const faceKey = (t: number) => (Math.round(t / FACE_STEP) * FACE_STEP).toFixed(1);
export const facesFile = (projectDir: string, srcPath: string) => join(analysisFiles(projectDir, srcPath).dir, 'faces.json');

type Cache = { version: number; frames: Record<string, FaceInfo[]> };
const readCache = (f: string): Cache => {
  try { const c = JSON.parse(readFileSync(f, 'utf8')) as Cache; if (c.version === VERSION && c.frames) return c; } catch { /* none yet */ }
  return { version: VERSION, frames: {} };
};

/** The grid times from `a` to `b` seconds of the source (both ends included). */
export function faceTimes(a: number, b: number): number[] {
  const out: number[] = [];
  for (let k = Math.round(Math.max(0, a) / FACE_STEP); k * FACE_STEP <= b + 1e-6; k++) out.push(+(k * FACE_STEP).toFixed(1));
  return out;
}

/** grid keys in runs of consecutive grid times ("1.0","1.2","1.4" | "3.0"), in order */
function stretches(keys: string[]): string[][] {
  const out: string[][] = [];
  for (const k of [...keys].sort((x, y) => Number(x) - Number(y))) {
    const last = out.at(-1);
    if (last && Math.abs(Number(k) - Number(last.at(-1)) - FACE_STEP) < 1e-6) last.push(k); else out.push([k]);
  }
  return out;
}

/**
 * Faces at source times `times` (snapped to the 0.2 s grid): from the cache, the missing ones detected in one batch.
 * Frames come from the analysis proxy when there is one (the faces are fractions of the picture, so its size does not matter).
 */
export async function facesAt(projectDir: string, srcPath: string, times: number[], o: { provider?: FacesProvider; signal?: AbortSignal } = {}): Promise<Map<string, FaceInfo[]>> {
  const file = facesFile(projectDir, srcPath), cache = readCache(file);
  const keys = [...new Set(times.map(faceKey))], missing = keys.filter((k) => !(k in cache.frames));
  if (missing.length) {
    const proxy = analysisFiles(projectDir, srcPath).proxy, from = existsSync(proxy) ? proxy : srcPath;
    const tmp = mkdtempSync(join(tmpdir(), 'faces-'));
    try {
      // one ffmpeg run per stretch of consecutive grid times, five frames a second (a run per frame took most of the time);
      // a time with no frame (the grid rounds past the source's last frame) has no face; it does not sink the others
      const got: Array<{ k: string; img: string }> = [];
      for (const [r, run] of stretches(missing).entries()) {
        const a = Number(run[0]), pattern = join(tmp, `r${r}-%04d.jpg`);
        try { await ffmpeg(['-ss', a.toFixed(3), '-i', from, '-t', ((run.length - 1) * FACE_STEP + FACE_STEP / 2).toFixed(3), '-vf', `fps=${1 / FACE_STEP}:round=near`, '-q:v', '3', pattern], { signal: o.signal }); }
        catch (e) { if (o.signal?.aborted) throw e; }
        // each frame named by its source time (<t>.jpg), as a single grab named it
        run.forEach((k, i) => {
          const out = join(tmp, `r${r}-${String(i + 1).padStart(4, '0')}.jpg`), img = join(tmp, `${k}.jpg`);
          if (existsSync(out)) { renameSync(out, img); got.push({ k, img }); } else cache.frames[k] = [];
        });
      }
      const found = await (o.provider ?? facesProvider()).detect(got.map((x) => x.img), { signal: o.signal });
      got.forEach((x, i) => { cache.frames[x.k] = found[i] ?? []; });
      mkdirSync(join(file, '..'), { recursive: true });
      // a new file, never rewritten in place (shared by a hard link with other projects), with what another process found meanwhile
      replaceFile(file, JSON.stringify({ ...cache, frames: { ...readCache(file).frames, ...cache.frames } }));
    } finally { rmSync(tmp, { recursive: true, force: true }); }
  }
  return new Map(keys.map((k) => [k, cache.frames[k] ?? []]));
}

/** One line for inspect: how many faces where, over a stretch ("0:00–0:12 一人置中、0:12–0:20 兩人（左、右）"). */
export function describeFaces(samples: Array<{ t: number; faces: FaceInfo[] }>, timecode: (t: number) => string): string {
  const where = (f: FaceInfo) => { const x = f.box[0] + f.box[2] / 2; return x < 0.38 ? '左' : x > 0.62 ? '右' : '中'; };
  const label = (fs: FaceInfo[]) => fs.length === 0 ? '沒有臉' : fs.length === 1 ? `一人${{ 左: '偏左', 中: '置中', 右: '偏右' }[where(fs[0])]}`
    : `${['', '', '兩', '三', '四'][fs.length] ?? fs.length}人（${[...fs].sort((p, q) => p.box[0] - q.box[0]).map(where).join('、')}）`;
  const runs: Array<{ a: number; b: number; l: string }> = [];
  for (const s of samples) {
    const l = label(s.faces), last = runs.at(-1);
    if (last && last.l === l) last.b = s.t; else runs.push({ a: s.t, b: s.t, l });
  }
  return runs.map((r) => `${timecode(r.a)}–${timecode(r.b)} ${r.l}`).join('、');
}
