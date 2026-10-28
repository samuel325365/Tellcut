// Two groups of tests (review B3): `fast` needs no browser; `browser` drives Chrome (exports, check's page layer, golden
// stills, the editor e2e tests) and runs at most two files at a time — many Chromes at once made the whole run slow and flaky.
//   npm test                 both groups
//   npm run test:fast        the quick feedback loop, without Chrome
//   npm run test:browser     only the Chrome tests
import { defineWorkspace } from 'vitest/config';
import base from './vitest.config.ts';

export const BROWSER_TESTS = [
  'apps/editor/src/*.e2e.test.ts',
  'apps/server/src/export.test.ts',
  'packages/media-node/src/golden.test.ts',
  'packages/plugin-common/golden/golden.test.ts',
  'tools/check/page.test.ts',
  'tools/render.test.ts',
];

// spread, not `extends`: extending concatenates include lists, and the browser group would include everything
const t = base.test!;
export default defineWorkspace([
  { esbuild: base.esbuild, test: { ...t, name: 'fast', exclude: [...(t.exclude ?? []), ...BROWSER_TESTS] } },
  { esbuild: base.esbuild, test: { ...t, name: 'browser', include: BROWSER_TESTS, poolOptions: { forks: { maxForks: 2, minForks: 1 } } } },
]);
