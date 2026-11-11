// @vitest-environment jsdom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { PlayerBridge } from './bridge.ts';
import { PlayerPreview } from './PlayerPreview.tsx';

test('a preview that goes away disposes its bridge (it stops following the language)', async () => {
  const dispose = vi.spyOn(PlayerBridge.prototype, 'dispose');
  const root = document.createElement('div');
  document.body.appendChild(root);
  await act(() => render(<PlayerPreview project={{}} />, root));
  expect(dispose).not.toHaveBeenCalled();
  await act(() => render(null, root));
  expect(dispose).toHaveBeenCalledTimes(1);
  dispose.mockRestore();
});
