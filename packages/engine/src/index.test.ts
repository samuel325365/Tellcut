import { ENGINE_VERSION } from './index.ts';

test('engine package is importable', () => {
  expect(ENGINE_VERSION).toBe(1);
});
