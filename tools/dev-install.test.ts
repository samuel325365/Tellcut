import { existsSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { ABOVE, DEV_DIR, foreign, generated, plan, refusal } from './dev-install.ts';

// dev/ is the maintainers' private repo: a public clone has no dev/claude, so the tests that read it are skipped
const withDev = existsSync(DEV_DIR) ? test : test.skip;

withDev('the copies go to the .claude folder above tellcut/ by default: the skill and the agent, each with its frontmatter', () => {
  const mine = plan();
  expect(mine.map(([f]) => f.split(sep).slice(-3).join('/'))).toEqual(expect.arrayContaining(['.claude/agents/video-maker.md', 'skills/batch-videos/SKILL.md']));
  for (const [f, text] of mine) {
    expect(f.startsWith(ABOVE + sep)).toBe(true);
    expect(text).toMatch(/^---\r?\nname: [\w-]+\r?\ndescription: /);
  }
});

test('every target gets every file, at the same path under it', () => {
  const dev = mkdtempSync(join(tmpdir(), 'devc-'));
  mkdirSync(join(dev, 'agents'));
  writeFileSync(join(dev, 'agents', 'a.md'), '---\nname: a\n---\nx\n');
  expect(plan(dev, ['T1', 'T2']).map(([f]) => f)).toEqual([join('T1', 'agents', 'a.md'), join('T2', 'agents', 'a.md')]);
  if (existsSync(DEV_DIR)) expect(plan(DEV_DIR).length).toBeGreaterThanOrEqual(2);
});

test('a copy keeps the frontmatter at the top and says where it comes from', () => {
  const g = generated('---\nname: x\n---\n本文\n', join('agents', 'x.md'));
  expect(g).toBe('---\nname: x\n---\n<!-- 由 npm run dev:install 從 tellcut/dev/claude/agents/x.md 產生：改那一份，再跑一次 -->\n本文\n');
  expect(generated('沒有開頭\n', 'a.md')).toMatch(/^<!-- 由 npm run dev:install/);
});

test('never into the user’s own ~/.claude (tellcut kept in the home folder), and never over a file it did not write', () => {
  const home = mkdtempSync(join(tmpdir(), 'devhome-'));
  // the folder above a tellcut/ in the home folder is the home folder: its .claude holds every session's own skills and agents
  expect(refusal(join(home, '.claude'), home)).toMatch(/~\/\.claude/);
  expect(refusal(join(home, 'Desktop', 'Video-Editing', '.claude'), home)).toBeNull();
  const mine = join(home, 'mine.md'), copy = join(home, 'copy.md');
  writeFileSync(mine, '---\nname: video-maker\n---\nthe user’s own agent');
  writeFileSync(copy, generated('---\nname: x\n---\nold', 'agents/x.md'));
  expect([foreign(mine), foreign(copy), foreign(join(home, 'none.md'))]).toEqual([true, false, false]);
});
