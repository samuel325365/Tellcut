import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { playerBuildStale } from './staleness.ts';

test('the player build is stale when a block or the engine changed after it, fresh otherwise, missing is said too', () => {
  const root = mkdtempSync(join(tmpdir(), 'stale-'));
  try {
    for (const d of ['apps/player/src', 'apps/player/dist', 'packages/engine/src', 'packages/plugin-common/src', 'packages/media-node/src']) mkdirSync(join(root, d), { recursive: true });
    expect(playerBuildStale(root)).toContain('還沒建置');
    const old = new Date(Date.now() - 60_000), now = new Date();
    for (const f of ['apps/player/src/main.ts', 'packages/engine/src/stage.ts', 'packages/plugin-common/src/progress.ts']) { writeFileSync(join(root, f), 'x'); utimesSync(join(root, f), old, old); }
    writeFileSync(join(root, 'apps/player/dist/index.html'), 'x'); utimesSync(join(root, 'apps/player/dist/index.html'), now, now);
    expect(playerBuildStale(root)).toBeNull();
    writeFileSync(join(root, 'packages/media-node/src/x.ts'), 'x');                     // Node-only code does not go into the player
    writeFileSync(join(root, 'packages/plugin-common/src/progress.test.ts'), 'x');      // nor do tests
    utimesSync(join(root, 'packages/plugin-common/src/progress.test.ts'), new Date(Date.now() + 60_000), new Date(Date.now() + 60_000));
    expect(playerBuildStale(root)).toBeNull();
    utimesSync(join(root, 'packages/plugin-common/src/progress.ts'), new Date(Date.now() + 60_000), new Date(Date.now() + 60_000));
    expect(playerBuildStale(root)).toContain('npm run build:player');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
