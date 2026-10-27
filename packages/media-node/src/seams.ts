// The handoff between a 3D frame push / pull (common.dolly) and its clip (spec 2026-10-25-brand-preset §6.2-2): at the handoff
// frame the dolly alone and the clip alone are drawn by the player and compared by their average colour and pixel by pixel (PSNR).
// A pair within 1 (of 255) on every channel on average and at least SEAM_PSNR dB does not jump to the eye; the average alone
// misses a small shift or crop jump. `npm run tellcut -- seams <project>` runs it for every dolly of a project.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveTimes, type Project, type Registry, type VideoItem } from '@tellcut/engine';
import { ffmpeg } from './ffmpeg.ts';
import { renderStills } from './stills.ts';

const rgb24 = async (png: string): Promise<Buffer> =>
  (await ffmpeg(['-i', png, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { stdout: true })).stdout;

/** a picture file's average red, green and blue (0–255) */
export async function meanRgb(png: string): Promise<[number, number, number]> {
  const stdout = await rgb24(png);
  const sum = [0, 0, 0];
  for (let i = 0; i + 2 < stdout.length; i += 3) { sum[0] += stdout[i]; sum[1] += stdout[i + 1]; sum[2] += stdout[i + 2]; }
  const n = Math.max(1, Math.floor(stdout.length / 3));
  return [sum[0] / n, sum[1] / n, sum[2] / n];
}

/** PSNR in dB of two pictures of the same size, pixel by pixel over red, green and blue (Infinity when identical, 0 when the sizes differ) */
export async function psnr(a: string, b: string): Promise<number> {
  const [x, y] = await Promise.all([rgb24(a), rgb24(b)]);
  if (!x.length || x.length !== y.length) return 0;
  let se = 0;
  for (let i = 0; i < x.length; i++) { const d = x[i] - y[i]; se += d * d; }
  return se ? 10 * Math.log10((255 * 255 * x.length) / se) : Infinity;
}

/** psnr: dB, pixel by pixel (Infinity when identical) */
export interface Seam { id: string; t: number; diff: [number, number, number]; psnr: number; ok: boolean; why?: string }
/** the most the average colour may differ on any channel */
export const SEAM_MAX = 1;
/** the least PSNR (dB) of the two sides (2026-10-27): good handoffs measured 36–37 dB on the test pattern (dolly-seam.test.ts) and
 *  44 and 86 on tellcut-brand-film; a crop 0.002 off (about 1 px) 27, one frame off 20, while their average colour still passed */
export const SEAM_PSNR = 30;

/** Why a clip cannot take a dolly's handoff cleanly, or undefined: its picture at the handoff is not the plain source frame the
 *  dolly's face shows (a dissolve into the clip, see-through, a freeze, a blur, a shake). A transition only matters going in. */
export function dollyMisfit(clip: Pick<VideoItem, 'transitionIn' | 'opacity' | 'freezeAt' | 'defocus' | 'shake'>, dir: 'in' | 'out'): string | undefined {
  const tr = clip.transitionIn;
  if (dir === 'in' && tr && tr.type !== 'cut' && tr.dur > 0) return `片段開頭有轉場（${tr.type}）`;
  if (clip.opacity != null && clip.opacity < 1) return '片段半透明（opacity）';
  if (clip.freezeAt != null) return '片段有定格（freezeAt）';
  if (clip.defocus && (clip.defocus.px > 0 || (clip.defocus.px0 ?? 0) > 0)) return '片段有失焦（defocus）';
  if (clip.shake?.length) return '片段有晃動（shake）';
  return undefined;
}

/** one line of `tellcut seams`: pass or not, the frame, the average colour difference and the PSNR, and why it failed */
export function seamLine(s: Seam): string {
  const db = Number.isFinite(s.psnr) ? `${s.psnr} dB` : '∞（完全相同）';
  return `${s.ok ? '通過' : '沒通過'}  ${s.id}  ${s.t.toFixed(3)} 秒  平均色差 R ${s.diff[0]} G ${s.diff[1]} B ${s.diff[2]}  PSNR ${db}${s.why ? `（${s.why}）` : ''}`;
}

const near = (a: number, b: number) => Math.abs(a - b) < 1e-3;

/** Every dolly's handoff: in, its last frame against the clip that starts where it ends; out, its first frame against the clip
 *  that ends where it starts. Each side is drawn alone (no other items), the clip stretched to cover that frame. */
export async function dollySeams(o: { projectDir: string; project: Project; registry: Registry; log?: (s: string) => void }): Promise<Seam[]> {
  const p = o.project, fps = p.meta.fps, times = resolveTimes(p);
  const main = (p.tracks.find((t) => t.id === 'v1')?.items ?? []) as VideoItem[];
  const out: Seam[] = [];
  const work = mkdtempSync(join(tmpdir(), 'seams-'));
  try {
    for (const tr of p.tracks) {
      if (tr.kind !== 'overlay' && tr.kind !== 'scene') continue;
      for (const it of tr.items as Array<{ id: string; type: string; params: Record<string, any> }>) {
        if (it.type !== 'common.dolly') continue;
        const tm = times.get(it.id)!, dir = it.params.dir === 'out' ? 'out' : 'in';
        const n = dir === 'in' ? Math.round(tm.end * fps) - 1 : Math.round(tm.start * fps), t = n / fps;
        const clip = main.find((c) => { const ct = times.get(c.id)!; return dir === 'in' ? near(ct.start, tm.end) : near(ct.end, tm.start); });
        if (!clip) { out.push({ id: it.id, t, diff: [255, 255, 255], psnr: 0, ok: false, why: dir === 'in' ? '結束的地方沒有接著的片段' : '開始的地方沒有剛結束的片段' }); continue; }
        const ct = times.get(clip.id)!, crop = dir === 'in' ? clip.crop.from : clip.crop.to;
        // the clip's source time at t, as if it had started earlier (in) or carried on (out)
        const at = clip.in + (t - ct.start) * clip.speed;
        const alone = (tracks: Project['tracks']): Project => ({ ...p, tracks });
        const a = alone([{ ...tr, items: [it] } as Project['tracks'][number]]);
        const b = alone([{ id: 'v1', kind: 'video', items: [{ ...clip, in: Math.max(0, at), start: t, end: t + 2 / fps, crop: { from: crop, to: crop }, transitionIn: undefined }] } as Project['tracks'][number]]);
        const [fa] = await renderStills({ dir: o.projectDir, project: a, times: [t], registry: o.registry, outDir: work, tag: `${it.id}-dolly`, log: o.log });
        const [fb] = await renderStills({ dir: o.projectDir, project: b, times: [t], registry: o.registry, outDir: work, tag: `${it.id}-clip`, log: o.log });
        const [ma, mb, db] = await Promise.all([meanRgb(fa), meanRgb(fb), psnr(fa, fb)]);
        const diff = ma.map((v, i) => Math.round(Math.abs(v - mb[i]) * 100) / 100) as [number, number, number];
        // the clip is drawn without its transition above: one that would show at the handoff is caught here instead
        const misfit = dollyMisfit(clip, dir), sharp = db >= SEAM_PSNR, dbR = Math.round(db * 10) / 10;
        const why = misfit ?? (sharp ? undefined : `逐像素 PSNR ${dbR} dB，低於 ${SEAM_PSNR}：位置或裁切跳了一下`);
        out.push({ id: it.id, t, diff, psnr: dbR, ok: !misfit && sharp && diff.every((d) => d < SEAM_MAX), ...(why ? { why } : {}) });
      }
    }
  } finally { rmSync(work, { recursive: true, force: true }); }
  return out;
}
