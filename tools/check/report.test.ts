import { isOffline, pageLayer, pageLayerSkip } from './report.ts';

test('the page layer is skipped, with the reason, when it would only waste time: --quick, offline material, an old player build', () => {
  expect(pageLayerSkip({ quick: false, offline: false, stale: null })).toBeNull();
  expect(pageLayerSkip({ quick: true, offline: false, stale: null })).toBe('');
  expect(pageLayerSkip({ quick: false, offline: true, stale: null })).toContain('離線');
  expect(pageLayerSkip({ quick: false, offline: false, stale: '播放器的建置檔比原始碼舊（自動建置失敗：x）' })).toContain('自動建置失敗');
});

test('offline material is told by the finding’s code, not by the wording of its message', () => {
  expect(isOffline({ level: 'error', code: 'offline', msg: 'Footage offline: v' })).toBe(true);
  expect(isOffline({ level: 'error', msg: '素材離線：v（v.mp4）' })).toBe(false);
  expect(isOffline({ level: 'error', msg: '字幕超出畫面' })).toBe(false);
});

test('a page layer that fails becomes an error in the report: the findings already made are still printed', async () => {
  expect(await pageLayer(async () => ({ findings: [{ level: 'warn', msg: 'x' }], sheet: 's.jpg' }))).toEqual({ findings: [{ level: 'warn', msg: 'x' }], sheet: 's.jpg' });
  const r = await pageLayer(async () => { throw new Error('Missing files: media/sfx/ding.wav'); });
  expect(r.findings).toEqual([{ level: 'error', msg: '畫面與聲音的檢查沒有跑完：Missing files: media/sfx/ding.wav' }]);
});
