// .cache/sources-health.json (spec 2026-10-22-external-sources §4.1): the last check of each source. Only `broken` hides a source;
// `temporary` and a source never checked stay available. Written by `npm run sources` and by searches that meet a broken answer.
import { readFileSync, writeFileSync } from 'node:fs';
import { renameRetry } from '../fsutil.ts';
import { withFileLock } from './rate.ts';

export interface HealthEntry { status: 'ok' | 'broken' | 'temporary'; detail: string; at: string }

export function readHealth(file: string): Record<string, HealthEntry> {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return {}; }
}

/** one source's result, merged into the file under its lock (several processes check and search at once) */
export async function recordHealth(file: string, id: string, e: { status: HealthEntry['status']; detail: string }, now: () => Date = () => new Date()): Promise<void> {
  await withFileLock(`${file}.lock`, () => {
    const all = readHealth(file);
    all[id] = { ...e, at: now().toISOString() };
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(all, null, 1));
    renameRetry(tmp, file);
  });
}
