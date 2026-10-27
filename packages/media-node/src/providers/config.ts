// tellcut/providers.json: which provider answers each capability, and each provider's own options.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { TELLCUT_ROOT } from '../paths.ts';

const CapabilityZ = z.object({
  use: z.string().min(1),
  /** options by provider id (voice, model folder, pinned version …) */
  options: z.record(z.record(z.unknown())).default({}),
});
const OCR_DEFAULT = { use: 'windows', options: { windows: { lang: 'zh-Hant-TW' } } };
const FACES_DEFAULT = { use: 'mediapipe', options: { mediapipe: {} } };
// ocr and faces came later (toolkit phase 5): a providers.json written before them still loads, with their defaults
export const ProvidersConfigZ = z.object({ tts: CapabilityZ, transcribe: CapabilityZ, ocr: CapabilityZ.default(OCR_DEFAULT), faces: CapabilityZ.default(FACES_DEFAULT) });
export type ProvidersConfig = z.infer<typeof ProvidersConfigZ>;

export const DEFAULT_PROVIDERS: ProvidersConfig = {
  tts: { use: 'edge', options: { edge: { version: '7.3.1', voice: 'zh-TW-HsiaoChenNeural' } } },
  transcribe: { use: 'faster-whisper', options: { 'faster-whisper': { model: 'large-v3-turbo' } } },
  ocr: OCR_DEFAULT,
  faces: FACES_DEFAULT,
};

export const PROVIDERS_FILE = join(TELLCUT_ROOT, 'providers.json');

/** The config from `file` (default tellcut/providers.json); a missing file means the defaults, a broken one is an error that says why. */
export function loadProvidersConfig(file = PROVIDERS_FILE): ProvidersConfig {
  if (!existsSync(file)) return DEFAULT_PROVIDERS;
  let raw: unknown;
  try { raw = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { throw new Error(`${file} 不是合法的 JSON：${(e as Error).message}`); }
  const r = ProvidersConfigZ.safeParse(raw);
  if (!r.success) throw new Error(`${file} 的內容不對：${r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('；')}`);
  return r.data;
}
