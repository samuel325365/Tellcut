// three.js, and opentype.js and Clipper that only its letters use, reach a page only through three/load.ts (spec
// 2026-10-25-brand-preset §6.1): a project without 3D never downloads them, and Node (tools, server) imports the plugins without
// running them.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('..', import.meta.url));
const MOD = String.raw`['"](?:three(?:/[^'"]*)?|opentype\.js|clipper-lib)['"]`;
// import … from and export … from (not import type / export type), and a bare import 'three'
const STATIC = new RegExp(String.raw`^\s*(?:(?:import|export)\s+(?!type\b)[^;]*?from\s+|import\s+)${MOD}`, 'm');
// a type written as typeof import('three') loads nothing
const DYNAMIC = new RegExp(String.raw`(?<!typeof\s+)import\(\s*${MOD}`);
const files = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? (e.name === 'node_modules' ? [] : files(join(d, e.name))) : e.name.endsWith('.ts') && !e.name.endsWith('.test.ts') ? [join(d, e.name)] : []);

test('the patterns catch every way of loading the modules, and not types', () => {
  const loads = [`import * as T from 'three';`, `import { Mesh } from "three/addons/x.js";`, `export { Mesh } from 'three';`, `export * from 'three';`,
    `import 'three';`, `import opentype from 'opentype.js';`, `import ClipperLib from 'clipper-lib';`, `import {\n  A,\n  B,\n} from 'three';`];
  const types = [`import type * as T from 'three';`, `export type { Mesh } from 'three';`, `import type Op from 'opentype.js';`,
    `import { x } from './three.ts';`, `import { y } from 'threejs-extra';`];
  for (const t of loads) expect([t, STATIC.test(t)]).toEqual([t, true]);
  for (const t of types) expect([t, STATIC.test(t)]).toEqual([t, false]);
  expect([DYNAMIC.test(`await import('clipper-lib')`), DYNAMIC.test(`import("three")`), DYNAMIC.test(`typeof import('three')`)]).toEqual([true, true, false]);
});

test('no file statically imports three (or opentype.js, clipper-lib), and only three/load.ts imports them at all', () => {
  const bad: string[] = [];
  for (const f of files(SRC)) {
    const rel = relative(SRC, f).split(sep).join('/'), text = readFileSync(f, 'utf8');
    if (STATIC.test(text)) bad.push(`${rel}: static import`);
    if (DYNAMIC.test(text) && rel !== 'three/load.ts') bad.push(`${rel}: dynamic import outside three/load.ts`);
  }
  expect(bad).toEqual([]);
});

test('nothing else in the repo imports them either, so Node loads them only when loadThreeKit is called', () => {
  const root = fileURLToPath(new URL('../../../..', import.meta.url));
  const dirs = ['packages/engine/src', 'packages/plugins/src', 'packages/media-node/src', 'packages/protocol/src', 'apps/player/src', 'apps/server/src', 'tools'];
  const bad = dirs.flatMap((d) => files(join(root, d))).filter((f) => { const t = readFileSync(f, 'utf8'); return STATIC.test(t) || DYNAMIC.test(t); }).map((f) => relative(root, f));
  expect(bad).toEqual([]);
});
