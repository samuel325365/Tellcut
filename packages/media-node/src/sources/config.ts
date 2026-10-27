// Which outside media sources the agents may use (spec 2026-10-22-external-sources §4.1): tellcut/sources.json holds the public
// defaults (in git), tellcut/sources.local.json the user's own switches, keys and contact (never in git), field by field over them.
// Keys may also come from the environment (the variable `keyEnv` names), which wins; the contact from TELLCUT_CONTACT.
import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { z } from 'zod';
import { TELLCUT_ROOT } from '../paths.ts';

export const SOURCES_FILE = join(TELLCUT_ROOT, 'sources.json');
export const SOURCES_LOCAL_FILE = join(TELLCUT_ROOT, 'sources.local.json');
/** JSON answers and rate-limit state, per source */
export const SOURCES_CACHE_DIR = join(TELLCUT_ROOT, '.cache', 'sources');
export const SOURCES_HEALTH_FILE = join(TELLCUT_ROOT, '.cache', 'sources-health.json');

const EntryZ = z.object({ enabled: z.boolean(), keyEnv: z.string().min(1), unofficial: z.boolean(), options: z.record(z.unknown()) }).partial();
const FileZ = z.object({ contact: z.string().optional(), sources: z.record(EntryZ).default({}), keys: z.record(z.string()).optional() });

export interface SourceEntry { enabled: boolean; keyEnv?: string; unofficial?: boolean; options: Record<string, unknown> }
export interface SourcesConfig { contact: string; sources: Record<string, SourceEntry>; keys: Record<string, string> }

function readFile(file: string): z.infer<typeof FileZ> | null {
  if (!existsSync(file)) return null;
  let raw: unknown;
  try { raw = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { throw new Error(`${basename(file)} 不是合法的 JSON：${(e as Error).message}`); }
  const r = FileZ.safeParse(raw);
  if (!r.success) throw new Error(`${basename(file)} 的內容不對：${r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('；')}`);
  return r.data;
}

/** The defaults with the local file over them; a missing file is nothing, a broken one an error that names it. */
export function loadSourcesConfig(o: { file?: string; localFile?: string } = {}): SourcesConfig {
  const pub = readFile(o.file ?? SOURCES_FILE), local = readFile(o.localFile ?? SOURCES_LOCAL_FILE);
  // the public file goes into git (and later an open-source repo): nothing personal may live there
  if (pub?.keys && Object.keys(pub.keys).length) throw new Error('key 只能放 sources.local.json 或環境變數，不能寫在 sources.json');
  if (pub?.contact) throw new Error('聯絡方式只能放 sources.local.json 或 TELLCUT_CONTACT，不能寫在 sources.json');
  const sources: Record<string, SourceEntry> = {};
  for (const f of [pub, local]) for (const [id, e] of Object.entries(f?.sources ?? {})) {
    const prev = sources[id] ?? { enabled: false, options: {} };
    sources[id] = { ...prev, ...e, options: { ...prev.options, ...(e.options ?? {}) } };
  }
  return { contact: local?.contact ?? '', sources, keys: local?.keys ?? {} };
}

/** a source's key: the environment variable its entry names, else the local file's keys */
export function sourceKey(c: SourcesConfig, id: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
  const name = c.sources[id]?.keyEnv;
  return (name && env[name]) || c.keys[id] || undefined;
}

/** who to tell the sources we are (an email or a web address): TELLCUT_CONTACT, else the local file's contact */
export function contactOf(c: SourcesConfig, env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env.TELLCUT_CONTACT || c.contact || undefined;
}
