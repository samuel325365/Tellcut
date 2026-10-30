// Taking one block out of a project's fx module that holds several (npm run promote). Only a module written the plain way is
// split: `export default [ { type: 'fx.a', … }, { type: 'fx.b', … } ]`, an array literal of object literals, each with its type
// as a string. Anything else is refused, never guessed at: the project's own file is rewritten from it.
import ts from 'typescript';

export interface FxSplit {
  /** the module as it was read (applying checks the file still says this) */
  source: string;
  /** the module with only that block in its export; the top-level helpers nothing uses any more are taken out */
  shared: string;
  /** the module without that block, everything else as it was */
  rest: string;
  /** the types left in `rest`, in order */
  keeps: string[];
}

const parse = (src: string, file: string) =>
  ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, /\.[cm]?tsx?$/i.test(file) ? ts.ScriptKind.TS : ts.ScriptKind.JS);

/** the module's syntax errors (none: it parses) */
export function syntaxErrors(src: string, file: string): string[] {
  const out = ts.transpileModule(src, { fileName: file, reportDiagnostics: true, compilerOptions: { allowJs: true, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  return (out.diagnostics ?? []).map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
}

/** the names the module uses without declaring them, beyond the browser's globals (TypeScript's checker on the one file;
 *  imports are not followed, their bindings count as declared) */
const libs = new Map<string, ts.SourceFile | undefined>();
export function unknownNames(src: string, file: string): string[] {
  const name = `/split/${file.replace(/.*[\\/]/, '')}`, base = ts.createCompilerHost({});
  const host: ts.CompilerHost = { ...base, writeFile: () => {},
    getSourceFile: (f, v) => (f === name ? parse(src, name) : libs.has(f) ? libs.get(f) : (libs.set(f, base.getSourceFile(f, v)), libs.get(f))),
    fileExists: (f) => f === name || base.fileExists(f), readFile: (f) => (f === name ? src : base.readFile(f)) };
  const p = ts.createProgram([name], { allowJs: true, checkJs: true, noEmit: true, noResolve: true, target: ts.ScriptTarget.ES2022,
    lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'], types: [] }, host);
  // 2304 "Cannot find name", 2552 the same with a "did you mean"
  return [...new Set(p.getSemanticDiagnostics(p.getSourceFile(name)).filter((d) => d.code === 2304 || d.code === 2552).map((d) => src.slice(d.start!, d.start! + d.length!)))];
}

const keyOf =(n: ts.PropertyName | undefined) => (n && (ts.isIdentifier(n) || ts.isStringLiteral(n)) ? n.text : undefined);

/** The `export default [ … ]` array and the type of each entry (undefined: not `{ type: '…', … }`); a sentence when there is none. */
export function exportList(sf: ts.SourceFile): { arr: ts.ArrayLiteralExpression; types: (string | undefined)[] } | string {
  const ex = sf.statements.filter((s): s is ts.ExportAssignment => ts.isExportAssignment(s) && !s.isExportEquals);
  if (ex.length !== 1) return '找不到 export default [ … ]';
  let e = ex[0].expression;
  while (ts.isParenthesizedExpression(e)) e = e.expression;
  if (!ts.isArrayLiteralExpression(e)) return 'export default 不是直接寫出來的陣列 [ … ]';
  const types = e.elements.map((el) => {
    if (!ts.isObjectLiteralExpression(el)) return undefined;
    const t = el.properties.filter((p) => keyOf(p.name) === 'type');
    if (t.length !== 1 || !ts.isPropertyAssignment(t[0])) return undefined;
    const v = t[0].initializer;
    return ts.isStringLiteral(v) || ts.isNoSubstitutionTemplateLiteral(v) ? v.text : undefined;
  });
  return { arr: e, types };
}

/** whether evaluating `n` at load time can do anything (a call, an assignment…); a function's body only runs when called */
const inert = (n: ts.Node): boolean => {
  if (ts.isArrowFunction(n) || ts.isFunctionExpression(n) || ts.isMethodDeclaration(n) || ts.isAccessor(n)) return true;
  if (ts.isCallExpression(n) || ts.isNewExpression(n) || ts.isTaggedTemplateExpression(n) || ts.isAwaitExpression(n) || ts.isYieldExpression(n)
    || ts.isClassExpression(n) || ts.isDeleteExpression(n)) return false;
  if (ts.isBinaryExpression(n) && n.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && n.operatorToken.kind <= ts.SyntaxKind.LastAssignment) return false;
  if ((ts.isPrefixUnaryExpression(n) || ts.isPostfixUnaryExpression(n)) && (n.operator === ts.SyntaxKind.PlusPlusToken || n.operator === ts.SyntaxKind.MinusMinusToken)) return false;
  return !ts.forEachChild(n, (c) => (inert(c) ? undefined : true));
};
const exported = (s: ts.Statement) => !!ts.getModifiers(s as ts.HasModifiers)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);

/** A piece of the module's top level: a statement, or one name of a const/let list. `names`: what it declares when taking it out
 *  loses nothing but them (a function, an import's bindings, a name given an inert value); undefined: it stays whatever happens. */
interface Unit { stmt: ts.Statement; node: ts.Node; names?: string[]; decl?: number }
function units(sf: ts.SourceFile): Unit[] {
  return sf.statements.flatMap((s): Unit[] => {
    if (exported(s)) return [{ stmt: s, node: s }];
    if (ts.isFunctionDeclaration(s) && s.name) return [{ stmt: s, node: s, names: [s.name.text] }];
    if (ts.isImportDeclaration(s) && s.importClause && !s.importClause.isTypeOnly) {
      const c = s.importClause, b = c.namedBindings;
      return [{ stmt: s, node: s, names: [...(c.name ? [c.name.text] : []), ...(b && ts.isNamespaceImport(b) ? [b.name.text] : b ? b.elements.map((e) => e.name.text) : [])] }];
    }
    if (ts.isVariableStatement(s)) return s.declarationList.declarations.map((d, i) => ({ stmt: s, node: d, decl: i,
      names: ts.isIdentifier(d.name) && (!d.initializer || inert(d.initializer)) ? [d.name.text] : undefined }));
    return [{ stmt: s, node: s }];
  });
}

/** every identifier written in `n` (property names too: a name kept by mistake only keeps a helper) */
function idents(n: ts.Node, out = new Set<string>()): Set<string> {
  if (ts.isIdentifier(n)) out.add(n.text);
  ts.forEachChild(n, (c) => { idents(c, out); });
  return out;
}

/** The range a statement is taken out with: its own comments (not one set off by a blank line) and the rest of its last line. */
function span(src: string, s: ts.Statement): [number, number] {
  const trivia = src.slice(s.pos, s.getStart());
  const blanks = [...trivia.matchAll(/\r?\n[ \t]*\r?\n/g)], last = blanks[blanks.length - 1];
  // without a blank line, the trivia's first line end is the line before's; the file's first statement keeps its header
  const from = last ? s.pos + last.index! + last[0].length : s.pos ? s.pos + trivia.indexOf('\n') + 1 : s.getStart();
  const after = /^[ \t]*(?:\/\/[^\n]*)?\n?/.exec(src.slice(s.end))![0];
  return [from, s.end + after.length];
}

/** Take out the top-level helpers nothing else in the module names any more, until none is left to take. */
export function pruneHelpers(src: string, file: string): string {
  for (;;) {
    const us = units(parse(src, file)), used = us.map((u) => idents(u.node));
    const gone = us.filter((u, i) => u.names && !u.names.some((n) => used.some((x, j) => j !== i && x.has(n))));
    const cuts: [number, number][] = [];
    for (const s of new Set(gone.map((u) => u.stmt))) {
      const mine = gone.filter((u) => u.stmt === s);
      if (!ts.isVariableStatement(s) || mine.length === s.declarationList.declarations.length) { cuts.push(span(src, s)); continue; }
      // one name of a list: with the comma after it (the last one, with the comma before); the others go on the next pass
      const d = s.declarationList.declarations, k = mine[0].decl!;
      cuts.push(k < d.length - 1 ? [d[k].pos, d[k + 1].pos] : [d[k - 1].end, d[k].end]);
    }
    if (!cuts.length) return src.replace(/(\r?\n)(?:[ \t]*\r?\n){2,}/g, '$1$1');
    for (const [a, b] of cuts.sort((x, y) => y[0] - x[0])) src = src.slice(0, a) + src.slice(b);
  }
}

/** Split `type` out of the fx module `src` (path `file`, for the parser and the messages); `loaded`: the types the module gave
 *  when imported, which the array as written must match. Throws a sentence saying why it cannot. */
export function splitFx(src: string, file: string, type: string, loaded: string[]): FxSplit {
  const refuse = (why: string): never => { throw new Error(`${file} 沒辦法自動拆開（${why}）：請先把 ${type} 拆成自己的檔案再升格`); };
  if (syntaxErrors(src, file).length) refuse('讀不懂它的語法');
  const list = exportList(parse(src, file));
  if (typeof list === 'string') refuse(list);
  const { arr, types } = list as Exclude<typeof list, string>;
  const odd = types.findIndex((t) => t === undefined);
  if (odd >= 0) refuse(`export default 的第 ${odd + 1} 項不是 { type: '…', … } 寫法`);
  if (JSON.stringify(types) !== JSON.stringify(loaded)) refuse(`載入後的積木是 ${loaded.join('、')}，跟 export default 寫的 ${types.join('、')} 不一樣`);
  const i = types.indexOf(type), els = arr.elements;
  if (i < 0 || types.lastIndexOf(type) !== i) refuse(`${type} 不是剛好寫了一次`);
  // rest: the entry with its comments and its comma; the last one takes the comma before it
  const [a, b] = i < els.length - 1 ? [els[i].pos, els[i + 1].pos] : [els[i - 1].end, els[i].end];
  const rest = src.slice(0, a) + src.slice(b);
  // shared: only that entry between the brackets, the list's trailing comma kept as it was written
  const last = els[els.length - 1];
  const shared = pruneHelpers(src.slice(0, els[0].pos) + src.slice(els[i].pos, els[i].end) + (els.hasTrailingComma ? ',' : '') + src.slice(last.end).replace(/^\s*,/, (m) => m.slice(0, -1)), file);
  // both come out as modules that parse and export what they should, or nothing is written
  const keeps = types.filter((t) => t !== type) as string[];
  for (const [what, text, want] of [['剩下的檔案', rest, keeps], ['抽出來的積木', shared, [type]]] as const) {
    const l = syntaxErrors(text, file).length ? undefined : exportList(parse(text, file));
    if (!l || typeof l === 'string' || JSON.stringify(l.types) !== JSON.stringify(want)) refuse(`${what}檢查沒過`);
  }
  // and neither names anything the original declared but it lost (a helper taken out that something still calls)
  const known = new Set(unknownNames(src, file));
  for (const [what, text] of [['剩下的檔案', rest], ['抽出來的積木', shared]] as const) {
    const lost = unknownNames(text, file).filter((n) => !known.has(n));
    if (lost.length) refuse(`${what}會找不到 ${lost.join('、')}`);
  }
  return { source: src, shared, rest, keeps };
}
