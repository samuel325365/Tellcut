// The genre guide the agent reads before a storyboard (guides/genres, workflow.md step 3): every genre listed in README.md has its
// card with the sections the storyboard answers, every style a card names is in the styles table, and the ratios table's
// safe-area pixels are the theme's defaultSafe (one set of numbers for the guide, the theme and check, review3 R3-H7).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { defaultSafe } from '@tellcut/engine';
import { TELLCUT_ROOT } from '@tellcut/media-node';

const dir = join(TELLCUT_ROOT, 'guides', 'genres');
const readme = readFileSync(join(dir, 'README.md'), 'utf8');
const ids = [...readme.matchAll(/^- \[`([a-z0-9-]+)`\]\(([^)]+)\)/gm)].map((m) => { expect(m[2]).toBe(`${m[1]}.md`); return m[1]; });
const section = (text: string, name: string) => text.split(/^## /m).find((s) => s.startsWith(`${name}\n`));

test('every genre in README.md has a card with must-haves, pitfalls and editing styles, and every card is listed', () => {
  expect(ids.length).toBeGreaterThan(40);
  expect(new Set(ids).size).toBe(ids.length);
  for (const id of ids) {
    const f = join(dir, `${id}.md`);
    expect([id, existsSync(f)]).toEqual([id, true]);
    const card = readFileSync(f, 'utf8');
    for (const s of ['Must-haves', 'Pitfalls', 'Editing styles']) expect([id, s, /^\s*(\d+\.|-) \S/m.test(section(card, s) ?? '')]).toEqual([id, s, true]);
  }
  const cards = readdirSync(dir).filter((f) => f.endsWith('.md') && f !== 'README.md').map((f) => f.slice(0, -3));
  expect(cards.sort()).toEqual([...ids].sort());
});

test("every editing style a card recommends is in README.md's styles table", () => {
  const styles = new Set([...(section(readme, 'Editing styles') ?? '').matchAll(/^\| `([a-z]+)` \|/gm)].map((m) => m[1]));
  expect(styles.size).toBeGreaterThan(20);
  for (const id of ids) {
    const used = [...(section(readFileSync(join(dir, `${id}.md`), 'utf8'), 'Editing styles') ?? '').matchAll(/^\d+\. `([a-z]+)`/gm)].map((m) => m[1]);
    expect([id, used.length > 0]).toEqual([id, true]);
    for (const s of used) expect([id, s, styles.has(s)]).toEqual([id, s, true]);
  }
});

test("the ratios table's safe-area pixels are the theme's defaultSafe", () => {
  const rows = [...(section(readme, 'Ratios') ?? '').matchAll(/^\| (\d+:\d+) \| (\d+)×(\d+)[^|]*\|[^|]*\|[^|]*\| (\d+) \/ (\d+) \/ (\d+) px/gm)];
  expect(rows.map((r) => r[1])).toEqual(['16:9', '9:16', '1:1', '4:5', '21:9', '4:3']);
  for (const [, ratio, w, h, top, bottom, side] of rows) {
    const s = defaultSafe(Number(w), Number(h));
    expect([ratio, Number(top), Number(bottom), Number(side)])
      .toEqual([ratio, Math.round(s.top * Number(h)), Math.round(s.bottom * Number(h)), Math.round(s.side * Number(w))]);
  }
  // the 9:16 platform note says the same in round numbers
  expect(readme).toMatch(/top ~220 px.*bottom ~420 px.*right ~130 px/);
});
