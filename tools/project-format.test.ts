import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseProject } from '@tellcut/engine';
import { checkItem } from '../packages/engine/src/commands/edit.ts';

for (const id of ['baking4-guide']) {
  test(`${id}/project.json is stored exactly as the editor saves it (no diff on first save)`, () => {
    const text = readFileSync(join(process.cwd(), 'tools', 'fixtures', id, 'project.json'), 'utf8');
    expect(text).toBe(JSON.stringify(parseProject(JSON.parse(text)), null, 2) + '\n');
  });
}

for (const id of ['baking4-guide']) {
  test(`every item in ${id} passes the edit checks (the panel can edit any of them)`, () => {
    const p = parseProject(JSON.parse(readFileSync(join(process.cwd(), 'tools', 'fixtures', id, 'project.json'), 'utf8')));
    const bad: string[] = [];
    for (const t of p.tracks) for (const it of t.items) { try { checkItem(p, t.kind, it as any); } catch (e) { bad.push(`${it.id}: ${(e as Error).message}`); } }
    expect(bad).toEqual([]);
  });
}
