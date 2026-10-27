// Tellcut server.   npm run server [-- --port 5174]
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { clearServerInfo, DEFAULT_PORT, TELLCUT_ROOT, writeServerInfo } from '@tellcut/media-node';
import { createApp } from './app.ts';
import { cleanupLeftovers } from './cleanup.ts';

const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const playerDist = join(TELLCUT_ROOT, 'apps/player/dist');
if (!existsSync(join(playerDist, 'index.html'))) console.warn('Player not built: run `npm run build:player` (needed by /player/ and exports)');
const editorDist = join(TELLCUT_ROOT, 'apps/editor/dist');
if (!existsSync(join(editorDist, 'index.html'))) console.warn('Editor not built: run `npm run build:editor` (needed by /editor/)');
try {
  const left = cleanupLeftovers(join(TELLCUT_ROOT, 'projects'));
  if (left.length) console.log(`Removed ${left.length} leftover temp file(s) from an earlier run`);
} catch (e) { console.warn(`Leftover cleanup skipped: ${(e as Error)?.message ?? e}`); }
const app = createApp({ projectsDir: join(TELLCUT_ROOT, 'projects'), playerDist, editorDist });
const port = await app.listen(Number(arg('--port') ?? DEFAULT_PORT));
// the CLI (propose, new, inspect) finds this server here, whatever its port (review3 R3-H6)
writeServerInfo(port);
process.on('exit', () => clearServerInfo());
for (const sig of ['SIGINT', 'SIGTERM', 'SIGBREAK'] as const) process.on(sig, () => process.exit(0));
console.log(`Tellcut server: http://127.0.0.1:${port}/  (Ctrl+C to stop)`);
