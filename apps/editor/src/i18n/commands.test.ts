// The engine's refused edits reach the page as CommandError: each one carries a code the dictionaries word (err.<code>),
// so a notice is never left in English in the Chinese or Japanese UI.
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { DICTS, type Key } from './index.ts';

const DIR = fileURLToPath(new URL('../../../../packages/engine/src/commands/', import.meta.url));
const files = readdirSync(DIR).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && f !== 'test-fixture.ts');

interface Throw { at: string; code: ts.Expression | undefined; params: string[] | null }
function scan() {
  const throws: Throw[] = [], codes = new Set<string>();
  for (const f of files) {
    const src = ts.createSourceFile(f, readFileSync(DIR + f, 'utf8'), ts.ScriptTarget.Latest, true);
    const visit = (n: ts.Node) => {
      if (ts.isStringLiteral(n) && /^cmd\.\w+$/.test(n.text)) codes.add(n.text);
      if (ts.isNewExpression(n) && n.expression.getText() === 'CommandError') {
        const [, code, params] = n.arguments ?? [];
        const names = params && ts.isObjectLiteralExpression(params) ? params.properties.map((x) => x.name?.getText() ?? '') : null;
        throws.push({ at: `${f}:${src.getLineAndCharacterOfPosition(n.getStart()).line + 1}`, code, params: names });
      }
      ts.forEachChild(n, visit);
    };
    visit(src);
  }
  return { throws, codes };
}

describe('command errors', () => {
  const { throws, codes } = scan();

  it('every CommandError has a code', () => {
    expect(throws.length).toBeGreaterThan(30);
    expect(throws.filter((x) => !x.code).map((x) => x.at)).toEqual([]);
  });

  it('every code is worded in the dictionaries, with only the params the command gives', () => {
    for (const c of codes) for (const d of Object.values(DICTS)) expect(d[`err.${c}` as Key], `err.${c}`).toBeTruthy();
    for (const x of throws) {
      if (!x.code || !ts.isStringLiteral(x.code)) continue;
      for (const [lang, d] of Object.entries(DICTS)) {
        const words = [...(d[`err.${x.code.text}` as Key] ?? '').matchAll(/\{([A-Za-z_]\w*)\}/g)].map((m) => m[1]);
        for (const w of words) expect(x.params ?? [], `${x.at} ${lang} {${w}}`).toContain(w);
      }
    }
  });
});
