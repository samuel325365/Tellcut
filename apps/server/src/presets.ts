// The presets' routes (spec 2026-10-23-presets-and-languages §3): the list for the home page and each preset's poster and preview.
// Reading and parsing them is media-node's (presets.ts), shared with `check`.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { findPreset, loadPresets, presetInfo, sendFile, type PresetDirs } from '@tellcut/media-node';
import { HttpError, sendJson, type Router } from './http.ts';

const FILES = new Set(['poster.jpg', 'preview.webm']);

export function presetRoutes(r: Router, dirs: PresetDirs) {
  r.get('/api/presets', (_req, res) => sendJson(res, 200, { presets: loadPresets(dirs).map(presetInfo) }));
  r.get('/api/presets/:id/:file', (req, res, { id, file }) => {
    const p = FILES.has(file) ? findPreset(dirs, id) : null;
    const dir = p && join(p.mine ? dirs.user : dirs.repo, id);
    if (!dir || !existsSync(join(dir, file))) throw new HttpError(404, 'Not found');
    sendFile(req, res, join(dir, file));
  });
}
