// The timeline edits in editing.ts that the editor-level tests do not reach.
import { corePlugin, createRegistry } from '@tellcut/engine';
import { Editor } from '../editor.ts';
import { fakes, ids } from '../editor-test-kit.ts';

test('paste of a one-per-film block already in the project leaves out what hangs on it too, and says why', async () => {
  // the fixture's blk (x.block, 2–6) has two sounds hung on it
  const registry = createRegistry([corePlugin, { id: 'x', items: [{ type: 'x.block', label: '片尾', kind: 'scene', unique: true, params: [], build: () => null, draw: () => {} }] } as any]);
  const { api, bridge } = fakes();
  const ed = new Editor('demo', { api, bridge, registry });
  await ed.open();
  ed.select(['blk']); ed.copy();
  ed.seek(8);
  expect(ed.paste()).toBe(false);
  expect(ids(ed, 'fx')).toEqual(['tap', 'tap2']);                       // no copy of its sounds on the original block
  expect(ed.store.get().notice).toBe('「片尾」在專案裡只能有一個');
});
