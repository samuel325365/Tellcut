// @vitest-environment jsdom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { PlayerBridge } from './bridge.ts';
import { PlayerPreview } from './PlayerPreview.tsx';

test('the loop starts over a little before the newest project\'s end: a patched look of another length gets no new ready', async () => {
  const bridges: PlayerBridge[] = [];
  const load = vi.spyOn(PlayerBridge.prototype, 'load').mockImplementation(function (this: PlayerBridge) { bridges.push(this); });
  const patch = vi.spyOn(PlayerBridge.prototype, 'patch').mockImplementation(() => {});
  const play = vi.spyOn(PlayerBridge.prototype, 'play').mockImplementation(() => {});
  const root = document.createElement('div');
  document.body.appendChild(root);
  try {
    const film = (duration: number) => ({ meta: { duration } });
    await act(() => render(<PlayerPreview project={film(3)} />, root));
    const b = bridges[0];
    act(() => { b.onReady(3); });
    play.mockClear();
    // a 4 s look patched in: 2.9 s is not near its end any more
    await act(() => render(<PlayerPreview project={film(4)} />, root));
    play.mockClear();
    act(() => { b.onTime(2.9); });
    expect(play).not.toHaveBeenCalled();
    act(() => { b.onTime(3.9); });
    expect(play).toHaveBeenLastCalledWith(0);
    // a project without a length of its own: the one the ready said
    await act(() => render(<PlayerPreview project={{}} />, root));
    play.mockClear();
    act(() => { b.onTime(0.5); b.onTime(2.9); });
    expect(play).toHaveBeenLastCalledWith(0);
  } finally { load.mockRestore(); patch.mockRestore(); play.mockRestore(); render(null, root); }
});

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
