// `tellcut seams` lines: every handoff shows its PSNR, not only the failing ones (whose `why` names it).
import { seamLine } from './seams.ts';

test('a passing seam shows its PSNR too; an identical one shows infinity; a failing one adds why', () => {
  expect(seamLine({ id: 'd1', t: 2.5, diff: [0.27, 0.27, 0.2], psnr: 36.4, ok: true })).toBe('通過  d1  2.500 秒  平均色差 R 0.27 G 0.27 B 0.2  PSNR 36.4 dB');
  expect(seamLine({ id: 'd2', t: 1, diff: [0, 0, 0], psnr: Infinity, ok: true })).toContain('PSNR ∞（完全相同）');
  const bad = seamLine({ id: 'd3', t: 1, diff: [0.3, 0.3, 0.3], psnr: 20.1, ok: false, why: '逐像素 PSNR 20.1 dB，低於 30：位置或裁切跳了一下' });
  expect(bad).toMatch(/^沒通過  d3 .* PSNR 20\.1 dB（逐像素 PSNR 20\.1 dB/);
});
