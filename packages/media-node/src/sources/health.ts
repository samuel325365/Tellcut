// .cache/sources-health.json (spec 2026-10-22-external-sources §4.1): the last check of each source. Only `broken` hides a source;
// `temporary` and a source never checked stay available. Written by `npm run sources` and by searches that meet a broken answer.
import { readFileSync, writeFileSync } from 'node:fs';
import { renameRetry } from '../fsutil.ts';
import { withFileLock } from './rate.ts';

/** `en`: the detail in English, when the check had it (doctor prints English); a search that met a broken answer records none */
export interface HealthEntry { status: 'ok' | 'broken' | 'temporary'; detail: string; en?: string; at: string }

const STATUSES = new Set<unknown>(['ok', 'broken', 'temporary']);

/** The file's entries. One that is not this shape (`null`, an array, a hand-edited entry) counts as never checked: sourceStatuses
 *  reads every entry's status, and a file of `null` made it throw, taking every source down with it. */
export function readHealth(file: string): Record<string, HealthEntry> {
  let all: unknown;
  try { all = JSON.parse(readFileSync(file, 'utf8')); } catch { return {}; }
  if (!all || typeof all !== 'object' || Array.isArray(all)) return {};
  return Object.fromEntries(Object.entries(all).filter(([, e]) => !!e && typeof e === 'object' && STATUSES.has((e as HealthEntry).status))) as Record<string, HealthEntry>;
}

/** one source's result, merged into the file under its lock (several processes check and search at once) */
export async function recordHealth(file: string, id: string, e: Omit<HealthEntry, 'at'>, now: () => Date = () => new Date()): Promise<void> {
  await withFileLock(`${file}.lock`, () => {
    const all = readHealth(file);
    all[id] = { ...e, at: now().toISOString() };
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(all, null, 1));
    renameRetry(tmp, file);
  });
}
