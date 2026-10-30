import { parsePreset } from './presets.ts';

// showcase films (spec 2026-10-30 part 2): no purple left in the Black & Cream UI
test('a preset without a colour of its own takes the brand cream, not purple', () => {
  const p = parsePreset('---\n{ "name": { "en": "x" }, "summary": { "en": "y" } }\n---\nDo it.', 'x', true);
  expect(p.color).toBe('#d8b88a');
});
