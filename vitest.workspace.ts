// Two groups of tests (review B3): `fast` needs no browser; `browser` drives Chrome (exports, check's page layer, golden
// stills, the editor e2e tests) and runs at most two files at a time — many Chromes at once made the whole run slow and flaky.
//   npm test                 both groups, one after the other (tools/test-all.mjs)
//   npm run test:fast        the quick feedback loop, without Chrome
//   npm run test:browser     only the Chrome tests
// The limit of two is --maxWorkers 2 on the browser group's own run (package.json): vitest 2 makes one pool for a whole run, sized
// by the root config only, so a project's own poolOptions.forks.maxForks here was ignored (four browser files ran at once in a
// full run). The browser group cannot have a pool of its own either: in the threads pool process.env is a case-sensitive copy
// (Chrome, under %ProgramFiles%, is not found), and vmForks does not load tsx. A bare `npx vitest run` runs both groups with
// no limit.
import { defineWorkspace } from 'vitest/config';
import base from './vitest.config.ts';

export const BROWSER_TESTS = [
  'apps/editor/src/*.e2e.test.ts',
  'apps/server/src/export.test.ts',
  'packages/media-node/src/golden.test.ts',
  'packages/media-node/src/library/*.e2e.test.ts',
  'packages/plugin-common/golden/golden.test.ts',
  'tools/check/page.test.ts',
  'tools/render.test.ts',
  'tools/site.test.ts',
];

// spread, not `extends`: extending concatenates include lists, and the browser group would include everything
const t = base.test!;
export default defineWorkspace([
  { esbuild: base.esbuild, test: { ...t, name: 'fast', exclude: [...(t.exclude ?? []), ...BROWSER_TESTS] } },
  // the browser group runs the built player and editor: tools/test-builds.ts stops it when either build is missing or stale
  { esbuild: base.esbuild, test: { ...t, name: 'browser', include: BROWSER_TESTS, globalSetup: [...[t.globalSetup ?? []].flat(), 'tools/test-builds.ts'] } },
]);
