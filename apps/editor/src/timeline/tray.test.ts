import { fixture } from '../../../../packages/engine/src/commands/test-fixture.ts';
import { initialState } from '../store.ts';
import { trayProbe, trayState } from './tray.ts';

const state = (patch: Record<string, unknown> = {}) => ({ ...initialState('t'), project: fixture(), ...patch }) as any;
const none = new Set<string>();

test('trayState: nothing under the playhead disables split / Q / W with a reason; no selection disables delete', () => {
  const at15 = trayState(state({ playhead: 15 }), none);
  for (const id of ['split', 'deleteLeft', 'deleteRight'] as const) expect(at15[id]).toEqual({ enabled: false, why: 'ed.why.noClipAtPlayhead' });
  for (const id of ['delete', 'rippleDelete', 'duplicate'] as const) expect(at15[id]).toEqual({ enabled: false, why: 'ed.why.selectFirst' });
  const at2 = trayState(state({ playhead: 2, selection: ['blk'] }), none);
  expect([at2.delete.enabled, at2.rippleDelete.enabled, at2.duplicate.enabled]).toEqual([true, true, true]);
  expect(at2.deleteLeft).toEqual({ enabled: false, why: 'ed.why.selectionNoClip' });      // a block has no media to cut
  expect(trayState(state({ playhead: 2 }), none).deleteLeft.enabled).toBe(true);           // c1 is under it
  expect(trayState(state({ playhead: 2 }), none).split.enabled).toBe(true);
});

test('trayState: on the magnetic track Q / W carry a note that loose cards stay where they are', () => {
  const p: any = fixture(); p.tracks.find((t: any) => t.id === 'v').magnetic = true;
  expect(trayState(state({ project: p, playhead: 2 }), none).deleteLeft).toEqual({ enabled: true, note: 'ed.why.magneticLoose' });
  expect(trayState(state({ playhead: 2 }), none).deleteLeft).toEqual({ enabled: true });
});

test('trayState: an empty project → every tool disabled, no throw', () => {
  const p: any = fixture(); p.tracks = [];
  const s = trayState(state({ project: p, playhead: 1 }), none);
  expect(Object.values(s).every((x) => !x.enabled)).toBe(true);
  expect(Object.values(trayState(state({ project: null }), none)).every((x) => !x.enabled)).toBe(true);
});

test('trayProbe: while playing, the tray is worked out once per stretch between two cut points, the same as at the playhead', () => {
  const p = fixture();
  expect(trayProbe(p, 3.1)).toBe(trayProbe(p, 3.9));              // a1 ends at 3, c1 at 4: one stretch
  expect(trayProbe(p, 4.2)).not.toBe(trayProbe(p, 3.9));
  for (const t of [0.5, 3.1, 4.2, 9, 15]) expect(trayState(state({ playhead: trayProbe(p, t) }), none)).toEqual(trayState(state({ playhead: t }), none));
});
