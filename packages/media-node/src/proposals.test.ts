import { existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseProject } from '@tellcut/engine';
import { fixture } from '../../engine/src/commands/test-fixture.ts';
import { closeProposal, makeProposal, readProposal, saveProposal } from './proposals.ts';
import { projectHash, saveProjectFile } from './projectfile.ts';

function proj() {
  const d = mkdtempSync(join(tmpdir(), 'prop-'));
  writeFileSync(join(d, 'project.json'), JSON.stringify(fixture(), null, 2) + '\n');
  return d;
}

test('writing a project keeps the old version in .history and returns its hash', () => {
  const d = proj(), p: any = fixture(); p.meta.name = 'b';
  const r = saveProjectFile(d, p, 'claude');
  expect(r.project.meta.name).toBe('b');
  expect(r.hash).toBe(projectHash(readFileSync(join(d, 'project.json'), 'utf8')));
  expect(readdirSync(join(d, '.history')).filter((f) => f.endsWith('.json'))).toHaveLength(1);
});

test('a proposal is checked when made, saved as the pending one, and replaces the previous one', () => {
  const d = proj(), p = parseProject(fixture());
  expect(() => makeProposal(d, 'x', [{ op: 'trimEnd', id: 'zz', dt: 1 }], p)).toThrow('第 1 條');
  const a = makeProposal(d, '剪短', [{ op: 'trimEnd', id: 'c1', dt: -1 }], p);
  expect(a).toMatchObject({ label: '剪短', status: 'pending', base: projectHash(readFileSync(join(d, 'project.json'), 'utf8')) });
  expect(a.summary!.join()).toMatch(/c1 end/);
  saveProposal(d, a);
  expect(readProposal(d)!.id).toBe(a.id);
  const b = { ...makeProposal(d, '再改', [{ op: 'trimEnd', id: 'c1', dt: -2 }], p), id: a.id + 'b' };
  saveProposal(d, b);
  expect(readProposal(d)!.id).toBe(b.id);
  expect(JSON.parse(readFileSync(join(d, '.history/proposals/done', `${a.id}.json`), 'utf8'))).toMatchObject({ status: 'rejected', reason: '被新提議取代' });
});

test("the summary names blocks by gallery handle: what was added, and a changed type as old → new", () => {
  const d = proj(), p: any = fixture();
  p.tracks[0].items[0].type = 'common.stamp';
  const a = makeProposal(d, '換', [
    { op: 'updateItem', id: 'blk', patch: { type: 'common.sparkle' } },
    { op: 'addItem', track: 'sc', item: { id: 'b2', type: 'common.backdrop', start: 6, end: 7, params: {} } },
  ], parseProject(p));
  expect(a.summary).toContain('blk 換積木 MRK-03 stamp → MRK-05 sparkle');
  expect(a.summary!.join('\n')).toMatch(/^新增 b2 LOK-01 backdrop（sc）$/m);
});

test('closing archives the proposal once; the history list ignores the proposals folder', () => {
  const d = proj(), a = makeProposal(d, 'x', [{ op: 'trimEnd', id: 'c1', dt: -1 }], parseProject(fixture()));
  saveProposal(d, a);
  expect(closeProposal(d, a.id, 'accepted')!.status).toBe('accepted');
  expect(closeProposal(d, a.id, 'accepted')).toBeNull();
  expect(readProposal(d)).toBeNull();
  expect(existsSync(join(d, '.history/proposals/done', `${a.id}.json`))).toBe(true);
  mkdirSync(join(d, '.history'), { recursive: true });
  expect(readdirSync(join(d, '.history')).filter((f) => f.endsWith('.json'))).toHaveLength(0);
});
