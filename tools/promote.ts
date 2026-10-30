// Promote a project's own effect into the shared blocks (toolkit phase 2b):
//   npm run promote -- <project> <fx.type> [--as <name>] [--category <category>] [--yes]
// Claude Code only (the page chat has no permission to run it). Without --yes it only prints what it would do.
// The fx file moves into packages/plugin-common/src/<name>.ts as common.<name>, the project's items (and params naming it, like
// a card's `art`) are rewritten to the new id (the old project.json stays in .history/), so is its cut.ts (else the next
// `npm run cut` brings the deleted fx back), and a golden case is added — its picture is made with `npm run golden -- --update <name>`.
// The block gets its category (--category, unless the fx has one) and that category's next handle (spec 2026-10-22-block-handles);
// a name easy to mistake for an existing block's is warned about.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { allItems, parseProject, type Project } from '@tellcut/engine';
import { loadProjectFx, TELLCUT_ROOT, saveProjectFile } from '@tellcut/media-node';
import { plugins } from '@tellcut/plugins';
import { BLOCK_CATEGORY, BLOCK_PREFIX } from '@tellcut/protocol';
import { HANDLES_FILE, nextHandle, readHandles, similarNames, withHandle } from './handle-registry.ts';
import { editedSinceCut } from './cut/cut.ts';

export interface Promotion { project: string; fxFile: string; from: string; to: string; name: string; target: string; items: string[]; keepsFxEntry: false;
  /** items that name it in their params (a card's or wipe's `art`) */
  refs: string[];
  /** the project has a cut.ts: it is rewritten too, or the next `npm run cut` would bring the fx back */
  cutScript: boolean;
  /** a BlockCategory key, and the handle it gives (MRK-08) */
  category: keyof typeof BLOCK_PREFIX; handle: string;
  /** names it is easy to mistake for */
  warnings: string[] }

/** every shared block's and sound's short name (what a new name must not be mistaken for) */
const sharedNames = () => plugins.filter((p) => p.id === 'common').flatMap((p) => [...(p.items ?? []), ...(p.sfx ?? [])]).map((t) => t.type.replace(/^common\./, ''));

const camel = (s: string) => s.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** whether a param value (any depth) is the type id `s` */
const names = (v: unknown, s: string): boolean => (typeof v === 'string' ? v === s : Array.isArray(v) ? v.some((x) => names(x, s))
  : !!v && typeof v === 'object' && Object.values(v).some((x) => names(x, s)));
/** the same value with every `from` string (any depth) changed to `to` */
const renamed = (v: unknown, from: string, to: string): unknown => (v === from ? to : Array.isArray(v) ? v.map((x) => renamed(x, from, to))
  : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, renamed(x, from, to)])) : v);

/** A project's cut.ts after the promotion: the type id in quotes becomes the new one and the `c.fx('<file>')` call goes (alone,
 *  at the head of a chain or inside one). `left`: the file is still named in it, for the user to take out by hand. */
export function rewriteCutScript(src: string, o: { from: string; to: string; fxFile: string }): { src: string; left: boolean } {
  const call = `fx\\(\\s*(?<q>['"\`])(?:\\./)?${esc(o.fxFile)}\\k<q>\\s*\\)`;
  const out = src.replace(new RegExp(`(['"\`])${esc(o.from)}\\1`, 'g'), `$1${o.to}$1`)
    .replace(new RegExp(`\\)\\s*\\.${call}`, 'g'), ')')                                       // c.fx('a').fx('<file>')
    .replace(new RegExp(`(?<obj>\\b[\\w$]+\\.)${call}\\s*\\.(?=fx\\()`, 'g'), '$<obj>')          // c.fx('<file>').fx('b')
    .replace(new RegExp(`(?<lead>^[ \\t]*)?\\b[\\w$]+\\.${call}\\s*;[ \\t]*(?<nl>\\r?\\n)?`, 'gm'), (...a) => {
      const g = a[a.length - 1] as { lead?: string; nl?: string };                            // c.fx('<file>');  (its whole line when alone on it)
      return g.lead !== undefined ? (g.nl ? '' : g.lead) : g.nl ?? '';
    });
  return { src: out, left: out.includes(o.fxFile) };
}

/** Work out what promoting `type` of the project in `dir` would do; throws a sentence saying why not. `names`: the shared blocks'
 *  short names to compare with (default: the registered ones); `handlesFile`: the handle registry (default: the real one). */
export async function planPromotion(o: { dir: string; type: string; name?: string; category?: string; commonDir: string; handlesFile?: string; names?: string[] }): Promise<Promotion> {
  const p = parseProject(JSON.parse(readFileSync(join(o.dir, 'project.json'), 'utf8')));
  if (!o.type.startsWith('fx.')) throw new Error(`只能升格專案自己的 fx（類型以 fx. 開頭），收到 ${o.type}`);
  let fxFile: string | undefined, siblings = 0, own: string | undefined;
  for (const f of p.meta.fx ?? []) {
    const r = await loadProjectFx(o.dir, [f]);
    const types = (r.plugin.items ?? []).map((i) => i.type);
    if (types.includes(o.type)) { fxFile = f; siblings = types.length - 1; own = r.plugin.items!.find((i) => i.type === o.type)!.category; }
  }
  if (!fxFile) throw new Error(`專案 ${p.meta.name} 的 fx 裡找不到 ${o.type}`);
  if (siblings) throw new Error(`${fxFile} 裡還有 ${siblings} 個別的積木：請先把 ${o.type} 拆成自己的檔案再升格`);
  const name = o.name ?? o.type.slice(3);
  if (!/^[a-z][A-Za-z0-9-]*$/.test(name)) throw new Error(`名稱 ${name} 不合法（小寫字母開頭，只能有字母、數字、連字號）`);
  if (/\d$/.test(name)) throw new Error(`名稱 ${name} 不要用數字結尾：取一個看得出外觀的字（--as <名稱>）`);
  const category = o.category ?? own;
  if (!category || !(category in BLOCK_PREFIX)) throw new Error(`${category ? `沒有「${category}」這個分類` : '要給分類'}：加 --category ${Object.keys(BLOCK_PREFIX).join('|')}（${Object.values(BLOCK_CATEGORY).join('／')}）`);
  const target = join(o.commonDir, 'src', `${name}.ts`);
  const index = readFileSync(join(o.commonDir, 'src', 'index.ts'), 'utf8');
  if (existsSync(target) || new RegExp(`['"]common\\.${name}['"]`).test(index) || index.includes(`./${name}.ts`)) throw new Error(`common.${name} 已經存在`);
  const items = allItems(p).filter(({ item }) => (item as { type?: string }).type === o.type).map(({ item }) => item.id);
  const refs = allItems(p).filter(({ item }) => names((item as { params?: unknown }).params, o.type)).map(({ item }) => item.id);
  const others = (p.meta.fx ?? []).filter((f) => f !== fxFile && existsSync(join(o.dir, f)) && readFileSync(join(o.dir, f), 'utf8').includes(o.type));
  const cat = category as keyof typeof BLOCK_PREFIX, handle = nextHandle(readHandles(o.handlesFile), BLOCK_PREFIX[cat]);
  const like = similarNames(name, o.names ?? sharedNames());
  const warnings = [...others.map((f) => `${f} 裡也寫了 ${o.type}：升格後要自己改成 common.${name}`), ...(like.close.length ? [`名稱 ${name} 跟現有的 ${like.close.join('、')} 只差一兩個字母，容易看錯：可以用 --as 換一個`] : []),
    ...(like.within.length ? [`名稱 ${name} 跟 ${like.within.join('、')} 互相包含：是同一族的積木就沒關係`] : [])];
  return { project: p.meta.name, fxFile, from: o.type, to: `common.${name}`, name, target, items, refs, cutScript: existsSync(join(o.dir, 'cut.ts')), keepsFxEntry: false, category: cat, handle, warnings };
}

export const describePromotion = (pl: Promotion) => [
  `把 ${pl.from}（${pl.fxFile}）升格為 ${pl.to}：`,
  `  · 搬到 ${pl.target}（保留原碼、加 @ts-nocheck，之後有空再補型別）並註冊進 plugin-common/src/index.ts`,
  `  · 專案裡 ${pl.items.length} 個項目（${pl.items.join('、') || '沒有'}）改用 ${pl.to}，並從 meta.fx 拿掉 ${pl.fxFile}、刪除那個檔案（舊 project.json 留在 .history/）`,
  ...(pl.refs.length ? [`  · 參數裡寫著 ${pl.from} 的 ${pl.refs.length} 個項目（${pl.refs.join('、')}，例如 art）也改成 ${pl.to}`] : []),
  ...(pl.cutScript ? [`  · cut.ts 裡的 '${pl.from}' 改成 '${pl.to}'，拿掉 c.fx('${pl.fxFile}')：重跑 npm run cut 不會把它帶回來`] : []),
  `  · golden 加一筆 ${pl.name}（之後跑 npm run golden -- --update ${pl.name} 產生圖片；在那之前 golden 測試會失敗）`,
  `  · 分類 ${pl.category}（${BLOCK_CATEGORY[pl.category]}），圖鑑代號 ${pl.handle}（寫進 packages/protocol/src/handles.ts）`,
  ...pl.warnings.map((w) => `  ⚠ ${w}`),
].join('\n');

/** Do it. */
export async function applyPromotion(o: { dir: string; commonDir: string; plan: Promotion; handlesFile?: string }) {
  const { plan: pl } = o, id = esc;
  let src = readFileSync(join(o.dir, pl.fxFile), 'utf8').replace(new RegExp(`(['"\`])${id(pl.from)}\\1`, 'g'), `$1${pl.to}$1`);
  // the catalog groups shared blocks by category: given right after the type when the fx had none
  if (!/\bcategory\s*:/.test(src)) src = src.replace(new RegExp(`(['"\`])${id(pl.to)}\\1`), `$&, category: '${pl.category}'`);
  const handles = o.handlesFile ?? HANDLES_FILE;
  writeFileSync(handles, withHandle(readHandles(handles), pl.handle, pl.to));
  writeFileSync(pl.target, `// @ts-nocheck — promoted from a project's own effect (${pl.from}); add types when you next touch it.\n${src}`);
  const indexFile = join(o.commonDir, 'src', 'index.ts'), v = `${camel(pl.name)}Items`;
  let index = readFileSync(indexFile, 'utf8');
  index = index.replace(/(\nimport [^\n]*\n)(?!import)/, `$1import ${v} from './${pl.name}.ts';\n`);
  index = index.replace('] as ItemType[];', `, ...${v}] as ItemType[];`);
  writeFileSync(indexFile, index);
  const casesFile = join(o.commonDir, 'golden', 'cases.ts'), cases = readFileSync(casesFile, 'utf8');
  writeFileSync(casesFile, cases.replace(/\n\];\s*$/, `\n  { name: '${pl.name}', type: '${pl.to}', at: [1] },\n];\n`));
  const raw = JSON.parse(readFileSync(join(o.dir, 'project.json'), 'utf8')) as Project;
  for (const t of raw.tracks) for (const it of t.items as Array<{ type?: string; params?: unknown }>) {
    if (it.type === pl.from) it.type = pl.to;
    if (it.params !== undefined) it.params = renamed(it.params, pl.from, pl.to);
  }
  raw.meta.fx = (raw.meta.fx ?? []).filter((f) => f !== pl.fxFile);
  if (!raw.meta.fx.length) delete raw.meta.fx;
  // the promotion is not an edit: a project untouched since its last cut stays so (npm run cut without --force), its cut.ts rewritten to match
  const state = join(o.dir, 'cache', 'cut-state.json'), clean = existsSync(state) && !editedSinceCut(o.dir);
  saveProjectFile(o.dir, raw, 'promote');
  if (clean) writeFileSync(state, JSON.stringify({ hash: createHash('sha1').update(readFileSync(join(o.dir, 'project.json'), 'utf8')).digest('hex') }));
  rmSync(join(o.dir, pl.fxFile), { force: true });
  const script = join(o.dir, 'cut.ts');
  if (!existsSync(script)) return { cutLeft: false };
  const cut = rewriteCutScript(readFileSync(script, 'utf8'), pl);
  writeFileSync(script, cut.src);
  return { cutLeft: cut.left };
}

async function main() {
  const argv = process.argv.slice(2), pos = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--as' && argv[i - 1] !== '--category');
  const flag = (k: string) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : undefined);
  const [id, type] = pos, name = flag('--as'), category = flag('--category');
  if (!id || !type) { console.error('用法：npm run promote -- <專案> <fx.類型> [--as 名稱] [--category 分類] [--yes]'); process.exit(2); }
  const dir = join(TELLCUT_ROOT, 'projects', id), commonDir = resolve(TELLCUT_ROOT, 'packages', 'plugin-common');
  try {
    const plan = await planPromotion({ dir, type, name, category, commonDir });
    console.log(describePromotion(plan));
    if (!argv.includes('--yes')) { console.log('\n（只是預覽；確定要做就加 --yes）'); return; }
    const { cutLeft } = await applyPromotion({ dir, commonDir, plan });
    if (cutLeft) console.log(`\n⚠ cut.ts 裡還有 ${plan.fxFile}：照原本的寫法沒能自動拿掉，請手動刪掉那個 c.fx(…)（檔案已刪，重跑 npm run cut 會找不到它）`);
    console.log(`\n完成。下一步：npm run build:player；npm run golden -- --update ${plan.name}，看過圖片對不對；在 apps/editor/src/i18n/ 的 blocks.en.ts、blocks.ja.ts 加 ${plan.to} 的名稱和說明，params.en.ts、params.ja.ts 加每個參數，預設值是中文的字在 values.en.ts、values.ja.ts 加英日版；npm run blocks:index；再跑 npm test。`);
  } catch (e) { console.error(`無法升格：${(e as Error).message}`); process.exit(1); }
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
