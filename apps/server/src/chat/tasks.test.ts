// What a button's task tells the agent (spec 2026-10-29-my-library §3.2, §3.4, §3.5).
import { taskBlock } from './tasks.ts';

test('library-save: make the fx generic in the project, then save it with the names the user gave', () => {
  const b = taskBlock({ kind: 'library-save', type: 'fx.a', name: '粉筆 "A"', desc: 'd', category: 'text' }, 'p1')!;
  expect(b).toMatch(/^<task kind="library-save">/);
  expect(b).toContain(`npm run tellcut -- library save p1 <file> --type fx.a --name '粉筆 "A"' --desc 'd' --category text --replace`);
  expect(b).toContain('npm run check -- p1');
  expect(b).toMatch(/<\/task>$/);
});

test('library-save: values single-quoted for bash ($, backticks and quotes stay as typed); a category that is not one is dropped', () => {
  const b = taskBlock({ kind: 'library-save', type: 'fx.a', name: "省錢$100 `x` it's", desc: '$(rm -rf ~)', category: 'text; rm -rf ~' }, 'p1')!;
  expect(b).toContain(`--name '省錢$100 \`x\` it'\\''s' --desc '$(rm -rf ~)' --replace`);
  expect(b).not.toContain('--category');
  expect(taskBlock({ kind: 'library-save', type: 'fx.a', name: 'A', desc: '', category: 'toString' }, 'p1')).not.toContain('--category');
});

test('preset-draft: only the draft file, in the format the dialog reads', () => {
  const b = taskBlock({ kind: 'preset-draft' }, 'p1')!;
  expect(b).toContain('projects/p1/preset-draft.json');
  expect(b).toContain('"points"');
  expect(b).toMatch(/not .*names of places|place names/i);
});

test('library-edit: edit the entry in place and refresh it', () => {
  const b = taskBlock({ kind: 'library-edit', slug: 'chalk', type: 'fx.chalk', request: '字大一點' }, null)!;
  expect(b).toContain('projects/_library/blocks/chalk/fx/');
  expect(b).toContain('npm run tellcut -- library refresh chalk');
  expect(b).toContain('字大一點');
});

test('a task that is not one is null', () => {
  expect(taskBlock({ kind: 'nope' }, 'p1')).toBeNull();
  expect(taskBlock({ kind: 'library-edit', type: 'fx.a', request: 'x' }, null)).toBeNull();
  expect(taskBlock({ kind: 'library-edit', slug: '../x', type: 'fx.a', request: 'x' }, null)).toBeNull();
  expect(taskBlock({ kind: 'library-save', type: 'fx.a', name: 'A', desc: '' }, null)).toBeNull();   // needs a project
  expect(taskBlock(undefined, 'p1')).toBeNull();
});

test('library-save names the block the user starred (I2)', () => {
  expect(taskBlock({ kind: 'library-save', type: 'fx.b', name: 'B', desc: '' }, 'p1')).toContain('--type fx.b');
});
