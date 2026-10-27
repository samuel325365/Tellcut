// POST /api/projects/:id/requests — the editor's 「交給 Claude」(spec 2026-10-16-right-click-claude §3).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { allItems, resolveTimes } from '@tellcut/engine';
import { newRequestId, projectHash, saveRequest, type AskRequest } from '@tellcut/media-node';
import { HttpError, readJson, sendJson, type Router } from './http.ts';
import type { ProjectStore } from './projects.ts';

export function requestRoutes(r: Router, store: ProjectStore) {
  r.post('/api/projects/:id/requests', async (req, res, { id }) => {
    const b: any = await readJson(req), dir = store.dir(id), p = store.read(id);
    const text = typeof b?.text === 'string' ? b.text.trim() : '';
    if (!text) throw new HttpError(400, '指示是空的', { code: 'ask.empty' });
    const selection: string[] = Array.isArray(b?.selection) ? b.selection.map(String) : [];
    const ids = new Set(allItems(p).map((x) => x.item.id));
    for (const s of selection) if (!ids.has(s)) throw new HttpError(400, `找不到項目 ${s}`, { code: 'ask.unknownItem', params: { id: s } });
    const times = resolveTimes(p), spans = selection.map((s) => times.get(s)!);
    const range: [number, number] | null = spans.length ? [Math.min(...spans.map((x) => x.start)), Math.max(...spans.map((x) => x.end))] : null;
    const out: AskRequest = { id: newRequestId(), created: new Date().toISOString(), text, selection, playhead: Number(b?.playhead) || 0, range,
      base: projectHash(readFileSync(join(dir, 'project.json'), 'utf8')) };
    saveRequest(dir, out);
    sendJson(res, 200, out);
  });
}
