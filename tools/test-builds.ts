// The browser group's global setup (vitest.config.ts): those tests run the built player and editor, so a build older than its
// source made them pass or fail on old code without a word. It stops the run before any test and says which build to run; it
// never builds by itself (a build in the middle of a test run hides that the build was forgotten, and the user decides when).
import { existsSync } from 'node:fs';
import { join } from 'node:path';
// the file alone, not the package: a global setup loads before every run, and the package's index pulls in all of media-node
import { editorBuildStale, playerBuildStale } from '../packages/media-node/src/staleness.ts';
import { TELLCUT_ROOT } from '../packages/media-node/src/paths.ts';

/** One line per build that is missing or older than its source, naming the command that builds it; empty when both are fresh. */
export function buildProblems(root = TELLCUT_ROOT): string[] {
  return ([['player', playerBuildStale], ['editor', editorBuildStale]] as const).flatMap(([app, stale]) => {
    if (!stale(root)) return [];
    const why = existsSync(join(root, 'apps', app, 'dist', 'index.html')) ? 'is older than its source' : 'is missing';
    return [`apps/${app}/dist ${why}: run npm run build:${app}`];
  });
}

export default function setup(): void {
  const bad = buildProblems();
  if (bad.length) throw new Error(`The browser tests run the built player and editor; build them first:\n  ${bad.join('\n  ')}`);
}
