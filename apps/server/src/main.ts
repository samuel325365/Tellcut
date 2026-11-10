// Tellcut server.   npm run server [-- --port 5174]
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { clearServerInfo, DEFAULT_PORT, editorBuildStale, TELLCUT_ROOT, writeServerInfo } from '@tellcut/media-node';
import { createApp } from './app.ts';
import { cleanupLeftovers } from './cleanup.ts';
import { parseArgsOrExit } from '../../../tools/args.ts';

// a mistyped flag is refused, not read as the port (--prot 5200 started on the default one)
const usage = 'Usage: npm run server [-- --port 5174]';
const args = parseArgsOrExit(process.argv.slice(2), { '--port': 'value' }, usage, { maxWords: 0, lang: 'en' });
const asked = Number(args.get('--port') ?? DEFAULT_PORT);
const playerDist = join(TELLCUT_ROOT, 'apps/player/dist');
if (!existsSync(join(playerDist, 'index.html'))) console.warn('Player not built: run `npm run build:player` (needed by /player/ and exports)');
const editorDist = join(TELLCUT_ROOT, 'apps/editor/dist');
if (!existsSync(join(editorDist, 'index.html'))) console.warn('Editor not built: run `npm run build:editor` (needed by /editor/)');
// a pull without a rebuild: the new server would serve the old page, and nothing else says so
else if (editorBuildStale()) console.warn('Editor build is older than its source: run `npm run build:editor` (/editor/ would serve the old code)');
try {
  const left = cleanupLeftovers(join(TELLCUT_ROOT, 'projects'));
  if (left.length) console.log(`Removed ${left.length} leftover temp file(s) from an earlier run`);
} catch (e) { console.warn(`Leftover cleanup skipped: ${(e as Error)?.message ?? e}`); }
const app = createApp({ projectsDir: join(TELLCUT_ROOT, 'projects'), playerDist, editorDist });
const port = await app.listen(asked).catch((e: NodeJS.ErrnoException) => {
  // another server (or another program) has the port: said in a line, not as an unhandled 'error' event
  if (e.code === 'EADDRINUSE') console.error(`Port ${asked} is already in use: stop what runs there (npm run server:restart restarts a Tellcut server), or start on another port with npm run server -- --port <port>`);
  else console.error(`Cannot listen on port ${asked}: ${e.message}`);
  process.exit(1);
});
// the CLI (propose, new, inspect) finds this server here, whatever its port (review3 R3-H6)
writeServerInfo(port);
process.on('exit', () => clearServerInfo());
for (const sig of ['SIGINT', 'SIGTERM', 'SIGBREAK'] as const) process.on(sig, () => process.exit(0));
console.log(`Tellcut server: http://127.0.0.1:${port}/  (Ctrl+C to stop)`);
