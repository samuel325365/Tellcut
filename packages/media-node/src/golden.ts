// Golden stills (toolkit phase 2b): a block drawn at a few moments, compared with the picture saved last time it looked right.
// Pictures are kept small (270×480) so the files stay light and fonts/anti-aliasing differences between machines stay below the tolerance.
// macOS draws text and emoji differently enough (CoreText, Apple's emoji) to pass it: its own pictures of those cases are kept in
// a darwin/ folder beside the shared ones, which stay Windows' and are never rewritten from a Mac.
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { parseProject, type Project, type Registry, type ThemeInput } from '@tellcut/engine';
import { ffmpeg } from './ffmpeg.ts';
import { withProjectPage } from './stills.ts';

export const GOLDEN_W = 270, GOLDEN_H = 480;
/** share of pixels allowed to differ (small: a thin bar or a few dots is only a few hundred pixels at this size) (a pixel differs when any channel is off by more than `TOLERANCE`/255) */
export const GOLDEN_SHARE = 0.003, TOLERANCE = 24;

export interface GoldenCase {
  /** file stem: <name>-t<seconds>.png */
  name: string; type: string; params?: Record<string, unknown>;
  /** the item's length in seconds (default 3); `at` are times in the film, which starts with the item */
  len?: number; at: number[]; theme?: ThemeInput;
  /** background colour behind the block (default a mid grey-blue, so white and dark blocks both show) */
  bg?: string;
  /** a 1920×1080 film (kept at 480×270) instead of 1080×1920 */
  wide?: boolean;
  /** pictures the block reads (common.mapcam's map): source id → a picture file in the golden folder (a made-up one, no licence
   *  question), its size and, for a map, where it lies; copied into the work folder as photo sources */
  sources?: Record<string, { file: string; width: number; height: number; map?: { center: [number, number]; zoom: number; credit?: string } }>;
}

/** the folder of this system's own pictures, where they differ from the shared ones (macOS: <goldenDir>/darwin) */
export const goldenPlatformDir = (goldenDir: string, platform: NodeJS.Platform = process.platform) => (platform === 'darwin' ? join(goldenDir, 'darwin') : undefined);

/** where a case's picture is copied in the work folder */
const sourcePath = (id: string, file: string) => `media/golden-${id}${extname(file)}`;

/** the size a case's picture is kept at */
const sizeOf = (c: GoldenCase) => (c.wide ? `${GOLDEN_H}:${GOLDEN_W}` : `${GOLDEN_W}:${GOLDEN_H}`);

const MIX = { master: 0.9, compressor: { threshold: -14, ratio: 3, attack: 0.01, release: 0.2 }, reverb: { seconds: 1, send: 0 } };

/** A 1080×1920 (or, wide, 1920×1080) project of one overlay item. */
export function goldenProject(c: GoldenCase): Project {
  const len = c.len ?? 3;
  return parseProject({ version: 1,
    meta: { name: c.name, width: c.wide ? 1920 : 1080, height: c.wide ? 1080 : 1920, fps: 30, duration: len, plugins: [], background: c.bg ?? '#3a4256', mix: MIX, ...(c.theme ? { theme: c.theme } : {}) },
    sources: Object.fromEntries(Object.entries(c.sources ?? {}).map(([id, s]) => [id, { path: sourcePath(id, s.file), duration: 1, width: s.width, height: s.height, kind: 'image', ...(s.map ? { map: s.map } : {}) }])),
    media: {}, grids: [],
    tracks: [{ id: 'o', kind: 'overlay', items: [{ id: 'g', type: c.type, start: 0, end: len, params: c.params ?? {} }] }] });
}

/** RGB bytes of a picture file scaled to the golden size (ffmpeg decodes png and jpeg alike). */
export async function rawOf(file: string, size = `${GOLDEN_W}:${GOLDEN_H}`): Promise<Buffer> {
  return (await ffmpeg(['-i', file, '-vf', `scale=${size}:flags=area`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { stdout: true })).stdout;
}

/** The share of pixels that differ by more than the tolerance (1 when the sizes differ). */
export function diffShare(a: Buffer, b: Buffer, tol = TOLERANCE): number {
  if (a.length !== b.length || !a.length) return 1;
  let bad = 0;
  for (let i = 0; i < a.length; i += 3) if (Math.abs(a[i] - b[i]) > tol || Math.abs(a[i + 1] - b[i + 1]) > tol || Math.abs(a[i + 2] - b[i + 2]) > tol) bad++;
  return bad / (a.length / 3);
}

export interface GoldenResult { file: string; status: 'ok' | 'new' | 'changed' | 'updated'; share: number }
export const goldenFile = (c: GoldenCase, t: number) => `${c.name}-t${t.toFixed(2)}.png`;

/**
 * Draw every case and compare it with `goldenDir`. A missing golden is reported as `new` (written with `update`);
 * a picture that differs is `changed` (rewritten with `update`). `work` is a folder under the repo (the player is served from it).
 */
export async function runGolden(cases: GoldenCase[], o: { registry: Registry; goldenDir: string; platformDir?: string; work: string; update?: boolean; log?: (s: string) => void;
  /** where the cases' pictures are (default goldenDir; the gallery's translated thumbnails are kept apart from them) */ sourceDir?: string }): Promise<GoldenResult[]> {
  mkdirSync(o.work, { recursive: true });
  mkdirSync(o.goldenDir, { recursive: true });
  const tmp = mkdtempSync(join(tmpdir(), 'golden-')), out: GoldenResult[] = [];
  try {
    for (const c of cases) {
      for (const [id, s] of Object.entries(c.sources ?? {})) { mkdirSync(join(o.work, 'media'), { recursive: true }); copyFileSync(join(o.sourceDir ?? o.goldenDir, s.file), join(o.work, sourcePath(id, s.file))); }
      await withProjectPage({ dir: o.work, project: goldenProject(c), registry: o.registry, log: o.log }, async (s) => {
        for (const t of c.at) {
          await s.frame(Math.round(t * s.fps));
          const fresh = join(tmp, 'fresh.png');
          writeFileSync(fresh, await s.png());
          const name = goldenFile(c, t), shared = join(o.goldenDir, name), own = o.platformDir && join(o.platformDir, name);
          const save = async (to: string) => { mkdirSync(join(to, '..'), { recursive: true }); await ffmpeg(['-y', '-i', fresh, '-vf', `scale=${sizeOf(c)}:flags=area`, to]); };
          if (own) {
            // A system with pictures of its own matches either its own or the shared one (Windows' may have moved on since).
            // An update writes its own folder only, and only where it differs from the shared picture: the shared pictures
            // stay Windows', and a new case gets its shared one from an update there.
            const raw = await rawOf(fresh, sizeOf(c));
            const vsShared = existsSync(shared) ? diffShare(raw, await rawOf(shared, sizeOf(c))) : null;
            const vsOwn = existsSync(own) ? diffShare(raw, await rawOf(own, sizeOf(c))) : null;
            const known = [vsShared, vsOwn].filter((x): x is number => x !== null), best = known.length ? Math.min(...known) : null;
            if (!o.update) { out.push(best === null ? { file: name, status: 'new', share: 1 } : { file: name, status: best <= GOLDEN_SHARE ? 'ok' : 'changed', share: best }); continue; }
            if (vsShared !== null && vsShared <= GOLDEN_SHARE) {
              if (vsOwn !== null) rmSync(own, { force: true });
              out.push({ file: name, status: vsOwn !== null ? 'updated' : 'ok', share: vsShared });
            } else if (vsOwn === 0) out.push({ file: name, status: 'ok', share: 0 });
            else { await save(own); out.push({ file: name, status: 'updated', share: vsOwn ?? vsShared ?? 0 }); }
            continue;
          }
          const gold = shared;
          if (!existsSync(gold)) {
            if (o.update) { await save(gold); out.push({ file: name, status: 'updated', share: 0 }); } else out.push({ file: name, status: 'new', share: 1 });
            continue;
          }
          const share = diffShare(await rawOf(fresh, sizeOf(c)), await rawOf(gold, sizeOf(c)));
          if (o.update) { await save(gold); out.push({ file: name, status: share > 0 ? 'updated' : 'ok', share }); }   // an update keeps the newest picture even when it was within the tolerance
          else out.push({ file: name, status: share <= GOLDEN_SHARE ? 'ok' : 'changed', share });
        }
      });
    }
    return out;
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

export const goldenSummary = (r: GoldenResult[]) => r.filter((x) => x.status !== 'ok').map((x) => `${x.file}：${{ new: '還沒有 golden', changed: `畫面變了（${(x.share * 100).toFixed(1)}% 的像素不同）`, updated: '已更新', ok: '' }[x.status]}`);
