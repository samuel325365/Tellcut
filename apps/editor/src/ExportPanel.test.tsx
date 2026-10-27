// @vitest-environment jsdom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { createStore, initialState } from './store.ts';
import { ExportPanel } from './ExportPanel.tsx';

function mount(patch: any) {
  const store = createStore({ ...initialState('de mo'), exportOpen: true, ...patch });
  const calls: string[] = [];
  const editor: any = { store, id: 'de mo', cancelExport: () => calls.push('cancel'), toggleExports: (o: boolean) => calls.push(`toggle ${o}`) };
  const root = document.createElement('div');
  return { root, editor, calls, s: store.get() };
}

test('a running export shows its progress and can be cancelled', async () => {
  const m = mount({ exportJob: { id: 'e1', label: 'x', status: 'running', progress: 0.42, message: 'frame 42/100', log: [] } });
  await act(() => render(<ExportPanel editor={m.editor} s={m.s} />, m.root));
  expect(m.root.querySelector<HTMLElement>('[data-export-progress] i')!.style.width).toBe('42%');
  expect(m.root.textContent).toContain('繪製畫面 42 / 100');
  (m.root.querySelector('[data-export-cancel]') as HTMLElement).click();
  expect(m.calls).toEqual(['cancel']);
});

test('a finished export links the file; a failed one shows the reason and the log tail; history lists the files', async () => {
  const done = mount({ exportJob: { id: 'e1', label: 'x', status: 'done', progress: 1, message: '', log: [], result: { file: 'exports/a 1.mp4', log: 'exports/a 1.log', seconds: 257.8 } },
    exports: [{ file: 'exports/a 1.mp4', url: '/api/projects/de%20mo/files/exports/a%201.mp4', size: 5 * 1048576, mtime: 0, log: 'exports/a 1.log' }] });
  await act(() => render(<ExportPanel editor={done.editor} s={done.s} />, done.root));
  expect(done.root.querySelector<HTMLAnchorElement>('[data-export-result]')!.getAttribute('href')).toBe('/api/projects/de%20mo/files/exports/a%201.mp4');
  expect(done.root.textContent).toContain('257.8');
  expect(done.root.querySelectorAll('[data-export-entry]').length).toBe(1);
  const failed = mount({ exportJob: { id: 'e2', label: 'x', status: 'failed', progress: 0.1, message: '', error: 'Missing files:\n  k2: a.mp4', log: ['prepare 0/3', 'failed: Missing files'] } });
  await act(() => render(<ExportPanel editor={failed.editor} s={failed.s} />, failed.root));
  expect(failed.root.querySelector('[data-export-error]')!.textContent).toContain('Missing files');
  expect(failed.root.querySelector('[data-export-log]')!.textContent).toContain('failed: Missing files');
  expect(failed.root.textContent).toContain('還沒有輸出過');
});
