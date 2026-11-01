// A text report on a project instead of screenshots (toolkit phase 1, spec 2026-10-16-toolkit-phase1 Tasks 4–5):
//   npm run check -- <id> [--quick] [--sheet]
// The model layer reads only project.json and the cached analysis (--quick stops there); the page layer opens the player to
// measure where text lands and to render the mix; --sheet adds one contact sheet of the film. Exit code 1 on an error.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseProject, resolveTimes, type Transcript } from '@tellcut/engine';
import { analysisFiles, extrasFiles, findPreset, loadProjectFx, playerBuildStale, projectRegistry, readBurned, rebuildPlayer, readTranscript, TELLCUT_ROOT, type Burned } from '@tellcut/media-node';
import { edgeFindings } from './check/edges.ts';
import { canvasFxFiles, chosenSpec, fxChecks, modelChecks, outsideFiles, presetChecks, reportsCanvasText, type Finding } from './check/rules.ts';
import { formatReport, isOffline, pageLayer, pageLayerSkip } from './check/report.ts';
import { renderedChecks, type Drawn } from './check/page.ts';
import { clipBars, letterboxFindings } from './check/letterbox.ts';
import { plugins } from '@tellcut/plugins';
import { projectArgOrExit } from './project-arg.ts';

/** the project's own music styles (projects/<id>/score/*.js) follow the same rules as its effects */
const projectStyleFiles = (d: string) => (existsSync(join(d, 'score')) ? readdirSync(join(d, 'score')).filter((f) => f.endsWith('.js')).map((f) => `score/${f}`) : []);
const id = process.argv[2], dir = projectArgOrExit(id, '用法：npm run check -- <專案名> [--quick] [--sheet]');
const p = parseProject(JSON.parse(readFileSync(join(dir, 'project.json'), 'utf8')));
const transcripts: Record<string, Transcript | null> = {}, burned: Record<string, Burned | null> = {}, shots: Record<string, number[] | null> = {};
for (const [sid, s] of Object.entries(p.sources)) {
  // footage that is not on this PC has no analysis (and cannot be hashed): modelChecks reports it as offline
  if (!existsSync(resolve(dir, s.path))) { transcripts[sid] = null; burned[sid] = null; shots[sid] = null; continue; }
  transcripts[sid] = readTranscript(dir, resolve(dir, s.path));
  burned[sid] = readBurned(dir, resolve(dir, s.path));
  const c = analysisFiles(dir, resolve(dir, s.path)).cuts;
  try { shots[sid] = existsSync(c) ? (JSON.parse(readFileSync(c, 'utf8')) as number[]) : null; } catch { shots[sid] = null; }
}
const { registry, fx } = await projectRegistry(dir, plugins, p);
// families the plugins bring along (npm run fonts downloads them) plus the one default that is a system font
const knownFonts = [...new Set([...plugins.flatMap((pl) => pl.fonts ?? []).map((f) => (typeof f === 'string' ? f.split(':')[0] : f.family)), 'Consolas'])];
// the blocks of the fx modules that draw letters on a canvas: check cannot read those words unless the fx reports them
// (ctx.reportText, measured by the page layer), and says so instead of "no text"
const readFx = (f: string) => { const path = resolve(dir, f); return existsSync(path) ? readFileSync(path, 'utf8') : null; };
const typesOf = async (files: string[]) => new Set(files.length ? ((await loadProjectFx(dir, files)).plugin.items ?? []).map((t) => t.type) : []);
const canvasTypes = await typesOf(canvasFxFiles(p.meta.fx ?? [], readFx)), reportTypes = await typesOf(canvasFxFiles(p.meta.fx ?? [], readFx, reportsCanvasText));
// the model layer again once the page layer has measured what the fx drew (its first-second and reading-time rules use it)
const model = (drawn?: Drawn) => modelChecks(p, { exists: (path) => existsSync(resolve(dir, path)), transcripts, knownFonts, params: (t) => registry.item(t)?.params, canvasText: (t) => canvasTypes.has(t), reportsText: (t) => reportTypes.has(t), drawn });
const modelFindings = model();
let findings: Finding[] = [...fx.errors.map((e): Finding => ({ level: 'error', msg: `fx 載入失敗 ${e.path}：${e.message}` })), ...fx.warnings.map((w): Finding => ({ level: 'warn', msg: `fx ${w.path}：${w.message}` })), ...fxChecks(Object.fromEntries([...(p.meta.fx ?? []), ...projectStyleFiles(dir)].filter((f) => existsSync(join(dir, f))).map((f) => [f, readFileSync(join(dir, f), 'utf8')]))), ...modelFindings, ...outsideFiles(p, dir, TELLCUT_ROOT)];
// the length and ratio of the preset the project was made from (where the server reads presets from)
const made = p.meta.preset && findPreset({ repo: join(TELLCUT_ROOT, 'guides', 'presets'), user: join(TELLCUT_ROOT, 'projects', '_presets') }, p.meta.preset.id);
findings.push(...presetChecks(p, made ? chosenSpec({ id: made.id, name: made.name.zh ?? made.name.en ?? made.id, length: made.length, ratios: made.ratios }, p.meta.preset?.fields) : null));
// clip edges running into the source's neighbouring shot (read off the analysis, so --quick has it too)
findings.push(...edgeFindings(p, resolveTimes(p), shots));
// the pictures below come from the built player: an old build would check code that is not the code anymore
let stale = process.argv.includes('--quick') ? null : playerBuildStale();   // --quick renders nothing, so an old build does not matter
if (stale) {
  // built here (a few seconds): the page chat may not run build:player, and being told to was no use to it; not build:player
  // itself, which empties dist under an export or another check using it
  console.error('播放器的建置檔是舊的，先重新建置（幾秒鐘）');
  stale = await rebuildPlayer();
}
if (stale) findings.unshift({ level: 'error', msg: stale });
let sheet: string | undefined;
const skip = pageLayerSkip({ quick: process.argv.includes('--quick'), offline: findings.some(isOffline), stale });
if (skip) console.error(skip);
if (skip === null) {
  // the footage's own black bars on screen (read off the analysis proxies)
  findings.push(...letterboxFindings(p, resolveTimes(p), await clipBars(dir, p)));
  let drawn: Drawn | undefined;
  const r = await pageLayer(async () => { const x = await renderedChecks({ dir, project: p, registry, burned, transcripts, sheet: process.argv.includes('--sheet'), log: (l) => { if (!/^(cuts|stills|audio|images) /.test(l)) console.error(l); } }); drawn = x.drawn; return x; });   // the cache's own lines (one per clip cut) are not part of the report
  findings.push(...r.findings);
  sheet = r.sheet;
  if (drawn) { const old = new Set(modelFindings); findings = [...findings.filter((f) => !old.has(f)), ...model(drawn)]; }
}
console.log(formatReport(findings));
if (sheet) console.log(`\n成品縮圖：${sheet}`);
process.exit(findings.some((f) => f.level === 'error') ? 1 : 0);
