// media-node's modules import one another without a cycle: a cycle only works while every use waits inside a function, and
// breaks (a name used before its module ran) as soon as one is used at the top level.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname);

function modules(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory() ? modules(p) : /\.ts$/.test(e.name) && !/\.test\.ts$/.test(e.name) ? [p] : [];
  });
}

/** the modules a file imports at run time (type-only imports are erased, so they cannot make a cycle) */
const importsOf = (file: string) => [...readFileSync(file, 'utf8').matchAll(/^(?:import|export)\s+(?!type\b)[^'"]*?from\s+'(\.[^']+)'/gm)]
  .map((m) => resolve(dirname(file), m[1])).filter((p) => existsSync(p));

test('no import cycle among media-node’s modules', () => {
  const graph = new Map(modules(ROOT).map((f) => [f, importsOf(f)]));
  const done = new Set<string>(), path: string[] = [], cycles: string[] = [];
  const visit = (f: string) => {
    done.add(f); path.push(f);
    for (const d of graph.get(f) ?? []) {
      if (path.includes(d)) cycles.push([...path.slice(path.indexOf(d)), d].map((x) => relative(ROOT, x)).join(' → '));
      else if (!done.has(d)) visit(d);
    }
    path.pop();
  };
  for (const f of graph.keys()) if (!done.has(f)) visit(f);
  expect(cycles).toEqual([]);
});
