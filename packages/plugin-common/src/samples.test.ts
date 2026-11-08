// The golden samples (samples.ts) only use values their blocks' params allow: the editor refuses a number outside a ParamDef's
// min / max or an enum value not in its options, so a sample outside them draws a picture (and a gallery card) no one can make.
import { createRegistry } from '@tellcut/engine';
import { plugins } from '@tellcut/plugins';
import { samples } from './samples.ts';

test('every sample param is within its ParamDef: numbers inside min / max, enum values among the options', () => {
  const registry = createRegistry(plugins), bad: string[] = [];
  for (const s of samples) {
    const t = registry.item(s.type);
    if (!t) { bad.push(`${s.name}: no block ${s.type}`); continue; }
    for (const [key, v] of Object.entries(s.params ?? {})) {
      const def = t.params.find((d) => d.key === key);
      if (!def) continue;
      if (def.type === 'number' && typeof v === 'number') {
        if (def.min !== undefined && v < def.min) bad.push(`${s.name}: ${key} ${v} < min ${def.min}`);
        if (def.max !== undefined && v > def.max) bad.push(`${s.name}: ${key} ${v} > max ${def.max}`);
      } else if (def.type === 'enum' && !def.options.includes(String(v))) bad.push(`${s.name}: ${key} "${String(v)}" not in ${def.options.join('|')}`);
    }
  }
  expect(bad).toEqual([]);
});
