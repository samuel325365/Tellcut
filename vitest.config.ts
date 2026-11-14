// Two groups of tests (review B3): `fast` needs no browser; `browser` drives Chrome (exports, check's page layer, golden
// stills, the editor e2e tests) and runs at most two files at a time — many Chromes at once made the whole run slow and flaky.
//   npm test                 both groups, one after the other (tools/test-all.mjs)
//   npm run test:fast        the quick feedback loop, without Chrome
//   npm run test:browser     only the Chrome tests
// The limit of two is the browser group's own maxWorkers, which vitest 4 honours per project as long as the group has a
// sequence.groupOrder of its own (a later one: the fast files finish first); so a bare `npx vitest run` keeps to it too. (Under
// vitest 2 a run had one pool sized by the root config, and the limit had to be --maxWorkers 2 on a run of its own.)
import { configDefaults, defineConfig } from 'vitest/config';

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

const esbuild = { jsx: 'automatic', jsxImportSource: 'preact' } as const;
const shared = {
  include: ['packages/*/src/**/*.test.ts', 'apps/*/src/**/*.test.ts', 'apps/*/src/**/*.test.tsx', 'tools/**/*.test.ts', 'packages/plugin-common/golden/*.test.ts'],
  exclude: [...configDefaults.exclude],
  environment: 'node',
  globals: true,
  testTimeout: 60000,
  // e2e setup hooks build sources, analyse them and start Chrome; under a full parallel run that can pass 60 s
  hookTimeout: 120000,
  // tools/test-workers.ts: a log of which file each worker ran and how it ended (a worker that dies mid-run)
  setupFiles: ['apps/editor/src/test-setup.ts', 'tools/test-workers.ts'],
  // the tests' scratch folders in the system temp folder are removed after the run (tools/test-cleanup.ts); the tests
  // transcribe with a small speech model (tools/test-env.ts)
  globalSetup: ['tools/test-cleanup.ts', 'tools/test-env.ts', 'tools/test-workers.ts'],
};

export default defineConfig({
  esbuild,
  test: {
    // each project spells out its options rather than `extends: true`, which would add the root's include to the browser group's
    projects: [
      { esbuild, test: { ...shared, name: 'fast', exclude: [...shared.exclude, ...BROWSER_TESTS] } },
      // the browser group runs the built player and editor: tools/test-builds.ts stops it when either build is missing or stale
      { esbuild, test: { ...shared, name: 'browser', include: BROWSER_TESTS, globalSetup: [...shared.globalSetup, 'tools/test-builds.ts'],
        maxWorkers: 2, sequence: { groupOrder: 1 } } },
    ],
  },
});
