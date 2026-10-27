// The outside sources for the chat's API menu (spec 2026-10-24-api-picker §3): every one Tellcut has an adapter for, in its group,
// with whether it can be used here (switched on, its key there, not broken) and why not — the page greys those out. Which ones the
// agent may use in a turn is the list the page sends with that message (`sources`), not this.
import { openSources, sourceStatuses, type Sources } from '@tellcut/media-node';
import type { SourceInfo } from '@tellcut/protocol';
import { sendJson, type Router } from './http.ts';

/** sources: opened afresh on every request (the files and the health may change while the server runs); tests pass their own */
export function sourceRoutes(r: Router, sources: () => Sources = () => {
  // the server's own environment never carries a conversation's ticks
  const { TELLCUT_SOURCES: _, ...env } = process.env;
  return openSources({ env });
}) {
  r.get('/api/sources', (_req, res) => {
    const s = sources();
    const rows: SourceInfo[] = sourceStatuses(s).filter((x) => x.adapter).map(({ id, adapter: a, available, reason }) => ({
      id, label: a!.label, category: a!.category, kinds: a!.kinds, data: !!a!.data, unofficial: !!a!.unofficial, available,
      ...(reason ? { reason } : {}), ...(reason === 'key' && s.config.sources[id]?.keyEnv ? { keyEnv: s.config.sources[id].keyEnv } : {}),
    }));
    sendJson(res, 200, { sources: rows });
  });
}
