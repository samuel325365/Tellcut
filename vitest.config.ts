import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: { jsx: 'automatic', jsxImportSource: 'preact' },
  test: {
    include: ['packages/*/src/**/*.test.ts', 'apps/*/src/**/*.test.ts', 'apps/*/src/**/*.test.tsx', 'tools/**/*.test.ts', 'packages/plugin-common/golden/*.test.ts'],
    exclude: [...configDefaults.exclude],
    environment: 'node',
    globals: true,
    testTimeout: 60000,
    // e2e setup hooks build sources, analyse them and start Chrome; under a full parallel run that can pass 60 s
    hookTimeout: 120000,
    // the tests' scratch folders in the system temp folder are removed after the run (tools/test-cleanup.ts)
    setupFiles: ['apps/editor/src/test-setup.ts'],
    globalSetup: ['tools/test-cleanup.ts'],
  },
});
