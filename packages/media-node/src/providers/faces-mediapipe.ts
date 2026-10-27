// Faces and mouths in stills with MediaPipe Face Landmarker on the CPU (toolkit phase 5): tools/py/faces.py in tellcut's own
// Python environment, the model in tellcut/models/mediapipe (npm run setup downloads it). One Python run per batch.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { modelsDir } from '../deps.ts';
import { PY_PROJECT, runPy, runUv } from '../py.ts';
import type { FaceInfo, FacesProvider, ProviderStatus } from './types.ts';

/** the model file, under TELLCUT_MODELS_DIR when it is set (where npm run setup puts it) */
export const faceModel = () => join(modelsDir(), 'mediapipe', 'face_landmarker.task');

export const parseFaceLines = (stdout: string, images: string[]): FaceInfo[][] => {
  const byImage = new Map<string, FaceInfo[]>();
  for (const l of stdout.split(/\r?\n/)) if (l.trim().startsWith('{')) { const r = JSON.parse(l) as { image: string; faces: FaceInfo[] }; byImage.set(r.image, r.faces); }
  return images.map((i) => byImage.get(i) ?? []);
};

export function mediapipeFaces(options: { model?: string } = {}, py: { runPy: typeof runPy; runUv: typeof runUv } = { runPy, runUv }): FacesProvider {
  const model = options.model ?? faceModel();
  return {
    id: 'mediapipe', label: 'MediaPipe 臉部關鍵點（本機 CPU）', online: false,
    async check(): Promise<ProviderStatus> {
      if (!existsSync(model)) return { ok: false, detail: `沒有模型 ${model}`, install: 'npm run setup' };
      try {
        const v = (await py.runUv(['run', '--project', PY_PROJECT, '--quiet', '--no-sync', '--offline', 'python', '-c', 'import importlib.metadata as m; print(m.version("mediapipe"))'])).trim();
        return { ok: true, version: v, detail: '臉框與嘴唇位置' };
      } catch (e) { return { ok: false, detail: `跑不起來：${(e as Error).message.slice(0, 120)}`, install: 'npm run setup' }; }
    },
    async detect(images, o = {}) {
      if (!images.length) return [];
      return parseFaceLines(await py.runPy('faces.py', [model], { input: JSON.stringify({ images }), signal: o.signal }), images);
    },
  };
}
