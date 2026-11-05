// Every shared block's parameters use a type the engine knows (ParamDef in engine/src/plugin.ts): the editor draws its field by
// the type and the catalog describes it by the type, so an unknown one (a promoted fx's `textarea` / `boolean`, hidden by its
// @ts-nocheck) became a JSON field and "undefined" in the catalog.
import { PARAM_TYPES } from '@tellcut/engine';
import { commonItems } from './index.ts';

const TYPES = new Set<string>(PARAM_TYPES);

test('every parameter of a shared block has a ParamDef type', () => {
  const bad = commonItems.flatMap((it) => it.params.filter((d) => !TYPES.has(d.type)).map((d) => `${it.type}.${d.key}: ${d.type}`));
  expect(bad).toEqual([]);
});
