// "Save as my preset" in the editor (spec 2026-10-29-my-library §3.5): an old draft never comes back.
import { createStore, initialState } from '../store.ts';
import { PresetSaveFlow } from './preset-save.ts';

function flow(draftAfterTurn: unknown) {
  const calls: string[] = [];
  let draft: unknown = { name: 'old', summary: '', points: [], blocks: [] };   // left from an earlier time
  const api: any = {
    presetDraft: async () => { calls.push('get'); if (!draft) throw Object.assign(new Error('No preset draft'), { status: 404 }); return draft; },
    deletePresetDraft: async () => { calls.push('delete'); draft = null; return { ok: true }; },
    projects: async () => [],
    savePreset: async () => ({ id: 'my-x' }), presetPoster: async () => ({}),
  };
  const chat: any = { state: { running: false }, send: async () => { calls.push('send'); draft = draftAfterTurn; } };
  const store = createStore(initialState('p1'));
  return { f: new PresetSaveFlow({ id: 'p1', api, store, chat, setLayout: () => {}, playhead: () => 0 }), store, calls };
}

test('the old draft is removed before the agent is asked, so one it does not write is not the old one', async () => {
  const { f, store, calls } = flow(null);
  await f.start();
  expect(calls.slice(0, 2)).toEqual(['delete', 'send']);
  expect(store.get().presetSave.draft).toBeNull();
  expect(store.get().presetSave.toast).toBeTruthy();
});

test('the new draft opens; closing the dialog removes it', async () => {
  const { f, store, calls } = flow({ name: 'new', summary: '', points: [], blocks: [] });
  await f.start();
  expect(store.get().presetSave.draft).toMatchObject({ name: 'new' });
  await f.close();
  expect(store.get().presetSave.draft).toBeNull();
  expect(calls.at(-1)).toBe('delete');
});
