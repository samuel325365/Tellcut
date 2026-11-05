// The user's library refuses with a LibraryError code (media-node library/), which the page words (err.<code>): every code it
// can throw needs its words in all three dictionaries, or the Chinese, English or Japanese UI shows the server's Chinese.
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { DICTS, type Key } from './index.ts';

const DIR = fileURLToPath(new URL('../../../../packages/media-node/src/library/', import.meta.url));

test('every code of the library is worded in the dictionaries', () => {
  const codes = new Set<string>();
  for (const f of readdirSync(DIR).filter((x) => x.endsWith('.ts') && !x.includes('.test.') && x !== 'fixture.ts')) {
    const visit = (n: ts.Node) => { if (ts.isStringLiteralLike(n) && /^library\.\w+$/.test(n.text)) codes.add(n.text); ts.forEachChild(n, visit); };
    visit(ts.createSourceFile(f, readFileSync(DIR + f, 'utf8'), ts.ScriptTarget.Latest, true));
  }
  expect(codes.size).toBeGreaterThan(8);
  expect([...codes].flatMap((c) => Object.entries(DICTS).filter(([, d]) => !d[`err.${c}` as Key]).map(([lang]) => `${lang} err.${c}`))).toEqual([]);
});
