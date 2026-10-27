// Claude's command line for a Tellcut project (spec 2026-10-15-proposals-magnetic §6):
//   npm run tellcut -- show|selection|status|accept|reject <id>
//   npm run tellcut -- propose <id> <file.json | ->      (file: { "label": "…", "ops": [ … ] }; the page chat writes projects/<id>/proposal.json)
//   npm run tellcut -- frames <id> [--proposal] [--full] --at 1.5,3   (stills 960 on the long side unless --full)
//   npm run tellcut -- logo <id> <file> [--name <name>]   (the brand logo into media/brand/: extrudable or not, its colours, how to use it)
//   npm run tellcut -- seams <id>   (every common.dolly's handoff to its clip: average colour within 1 and PSNR at least 30 dB pass)
//   npm run tellcut -- request <id> [--id <request id>] [--frames [--full]]   (the editor's 「交給 Claude」)
//   npm run tellcut -- catalog [type | handle | --find <words>]   (every block that can go in a project; one type's params; a search)
//   npm run tellcut -- recipe [name] / cut-api            (a recipe's content format / the Cut API at a glance)
//   npm run tellcut -- assets sources|source|search|get|credits …   (outside media: sound effects, music…; see tools/assets.ts)
// With the Tellcut server running (TELLCUT_URL, else the one in .cache/server.json, else http://127.0.0.1:5174) proposals go through it and an open editor
// decides; without it everything works on the files, except `selection`.
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { applyOps, magneticWarnings, OpError, parseProject, resolveTimes, type FxResult, type Op, type Project } from '@tellcut/engine';
import { analysisFiles, closeProposal, extrasFiles, latestRequest, loadProjectFx, makeProposal, projectHash, projectRegistry, readProposal, readRequest, readTranscript, TELLCUT_ROOT, renderStills, dollySeams, seamLine, importLogo, logoContrastWarning, logoPreviews, saveProjectFile, saveProposal, tellcutUrl, type AskRequest, type Proposal } from '@tellcut/media-node';
import { plugins } from '@tellcut/plugins';
import { formatCatalog, formatFind, formatLookup } from './catalog.ts';
import { handleOf } from '@tellcut/protocol';
import { describeRecipe } from './cut/recipes/index.ts';
import { formatCutApi } from './cut/api-doc.ts';
import { assetsCommand } from './assets.ts';
import { Usage } from './usage.ts';

const f2 = (v: number) => v.toFixed(2);
/** frames' long side for Claude (540×960 portrait, 960×540 landscape); --full keeps the film's own size */
const STILL_SIDE = 960;
const KIND: Record<string, string> = { video: '影片', audio: '音訊', music: '音樂', overlay: '特效', scene: '場景', sfx: '音效' };

/** The project as Claude reads it: every track and item with its timeline times, source range, text and what it hangs on. */
export function showProject(p: Project): string {
  const times = resolveTimes(p), out: string[] = [`${p.meta.name}  ${p.meta.width}×${p.meta.height}  ${p.meta.fps} fps  ${f2(p.meta.duration)} 秒`];
  for (const t of p.tracks as any[]) {
    out.push(`▸ ${t.id} ${KIND[t.kind] ?? t.kind}${t.magnetic ? '（磁吸）' : ''}${t.name ? `「${t.name}」` : ''}${t.muted ? ' 靜音' : ''}`);
    for (const it of t.items as any[]) {
      const r = times.get(it.id)!, len = r.end - r.start;
      let what = '';
      if (t.kind === 'video') what = `素材 ${it.source} ${f2(it.in)}–${f2(it.in + len * it.speed)}${it.speed !== 1 ? ` ×${it.speed}` : ''}`;
      else if (t.kind === 'audio') what = `素材 ${it.source} ${f2(it.in)}–${f2(it.in + len * it.rate)}${it.gain ? ` ${it.gain} dB` : ''}`;
      else if (t.kind === 'music') what = `音樂 ${it.media} 從 ${f2(it.in)}${it.toEnd ? '（結尾跟著影片）' : ''}`;
      else {
        const text = typeof it.params?.text === 'string' ? `「${it.params.text.replace(/\s+/g, ' ').slice(0, 30)}」` : '';
        const h = handleOf(it.type);
        what = `${it.type}${h ? `（${h}）` : ''}${text}`;
      }
      const head = it.parent !== undefined ? `  ↳ ${it.id}` : `  ${it.id}`;
      out.push(`${head}  ${f2(r.start)}–${f2(r.end)}  ${what}${it.parent !== undefined ? `（掛在 ${it.parent}）` : ''}`);
    }
  }
  for (const w of magneticWarnings(p)) out.push(`⚠ ${w}`);
  return out.join('\n');
}

const readProject = (dir: string) => parseProject(JSON.parse(readFileSync(join(dir, 'project.json'), 'utf8')));

/** The `show` line of each item, by id. */
function itemLines(p: Project): Map<string, string> {
  const out = new Map<string, string>();
  for (const l of showProject(p).split('\n')) { const m = /^\s+(?:↳ )?(\S+)  /.exec(l); if (m) out.set(m[1], l); }
  return out;
}

/** A 「交給 Claude」 request as Claude reads it (spec 2026-10-16-right-click-claude §4): the instruction, the selection, and
 *  for each piece of footage involved how the film uses its source, its scenes, contact sheets and speech — from the
 *  analysis cache only (never re-analysed here). */
export function describeRequest(dir: string, p: Project, r: AskRequest, projectText: string): string {
  const out = [`指示：${r.text}`, `建立：${r.created}`];
  if (projectHash(projectText) !== r.base) out.push('⚠ 送出後專案有被改過');
  const lines = itemLines(p), times = resolveTimes(p), all = p.tracks.flatMap((t) => (t.items as any[]).map((i) => ({ t, i })));
  const here = r.selection.length ? r.selection : all.filter(({ i }) => { const s = times.get(i.id)!; return s.start <= r.playhead && r.playhead < s.end; }).map(({ i }) => i.id);
  out.push(r.selection.length ? '選取：' : `播放頭 ${f2(r.playhead)} 秒附近：`);
  for (const id of here) out.push(lines.get(id) ?? `  ${id}（已不在專案裡）`);
  const clips = all.filter(({ t, i }) => t.kind === 'video' && here.includes(i.id)).map(({ i }) => i);
  for (const sid of [...new Set(clips.map((c) => c.source as string))]) {
    const s = p.sources[sid];
    if (!s) continue;
    const ratio = s.width / s.height, orient = ratio < 0.95 ? '直式' : ratio > 1.05 ? '橫式' : '方形';
    out.push(`素材 ${sid}：${f2(s.duration)} 秒，${orient}${s.kind === 'image' ? '（照片）' : ''}`);
    if (s.kind === 'image') { out.push(`  照片檔：${resolve(dir, s.path)}`); continue; }
    // a frozen clip holds one frame: it uses its source only up to the freeze
    const used = all.filter(({ t, i }) => t.kind === 'video' && i.source === sid).map(({ i }) => { const r2 = times.get(i.id)!, len = r2.end - r2.start; return [i.in, i.in + Math.min(len, i.freezeAt ?? len) * i.speed] as [number, number]; })
      .sort((a, b) => a[0] - b[0]);
    out.push(`  片中已用：${used.map(([a, b]) => `${f2(a)}–${f2(b)}`).join('、')}`);
    const path = resolve(dir, s.path);
    if (!existsSync(path)) { out.push(`  素材檔不在：${path}（離線，看不到畫面）`); continue; }
    const af = analysisFiles(dir, path), xf = extrasFiles(dir, path);
    if (!existsSync(af.cuts)) { out.push(`  尚未分析（npm run inspect -- ${basename(dir)}）`); continue; }
    const cuts: number[] = JSON.parse(readFileSync(af.cuts, 'utf8')), pts = [0, ...cuts.filter((c) => c > 0 && c < s.duration), s.duration];
    out.push(`  分鏡段落：${pts.slice(0, -1).map((a, k) => `${f2(a)}–${f2(pts[k + 1])}`).join('、')}`);
    const pages = existsSync(xf.sheets) ? (JSON.parse(readFileSync(xf.sheets, 'utf8')).pages ?? 0) : 0;
    for (let n = 1; n <= pages; n++) out.push(`  縮圖總覽：${xf.sheet(n)}`);
    const tr = readTranscript(dir, path);
    if (tr) {
      for (const c of clips.filter((c) => c.source === sid)) {
        const r2 = times.get(c.id)!, a = c.in, b = c.in + (r2.end - r2.start) * c.speed;
        const said = (tr.segments ?? []).filter((x: any) => x.end > a && x.start < b).slice(0, 5).map((x: any) => `「${x.text}」`);
        if (said.length) out.push(`  語音（${c.id}）：${said.join(' ')}`);
      }
    }
  }
  return out.join('\n');
}

export function proposeOnDisk(dir: string, label: string, ops: Op[]): Proposal {
  const p = makeProposal(dir, label, ops, readProject(dir));
  saveProposal(dir, p);
  return p;
}

/** Accept or reject the pending proposal straight on the files (no editor open). A proposal that no longer fits is closed as stale. */
export function decideOnDisk(dir: string, what: 'accept' | 'reject'): { outcome: 'accepted' | 'rejected' | 'stale'; reason?: string } {
  const prop = readProposal(dir);
  if (!prop) throw new Error('沒有待處理的提議');
  if (what === 'reject') { closeProposal(dir, prop.id, 'rejected'); return { outcome: 'rejected' }; }
  let next: Project;
  try { next = applyOps(readProject(dir), prop.ops).project; }
  catch (e) {
    if (!(e instanceof OpError)) throw e;
    closeProposal(dir, prop.id, 'stale', e.message);
    return { outcome: 'stale', reason: e.message };
  }
  saveProjectFile(dir, next, 'claude');
  closeProposal(dir, prop.id, 'accepted');
  return { outcome: 'accepted' };
}

const SERVER = tellcutUrl();
const api = (id: string, rest = '') => `${SERVER}/api/projects/${encodeURIComponent(id)}${rest}`;
async function server(id: string): Promise<{ connected: boolean; selection: string[]; playhead: number } | null> {
  try { const r = await fetch(api(id, '/editor-state'), { signal: AbortSignal.timeout(1000) }); return r.ok ? await r.json() : null; }
  catch { return null; }
}
async function call(url: string, init: RequestInit = {}) {
  const r = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json' } });
  const body: any = await r.json().catch(() => ({}));
  return { status: r.status, body };
}

function printProposal(p: Proposal, live: boolean) {
  console.log(`提議 ${p.id}：${p.label}`);
  for (const s of p.summary ?? []) console.log(`  · ${s}`);
  for (const w of p.warnings ?? []) console.log(`  ⚠ ${w}`);
  console.log(live ? '編輯器開著的話已經顯示預覽；說「好」我就接受。' : '編輯器沒開：可以用 frames --proposal 看畫面。');
}

function reportFx(fx: FxResult) {
  for (const e of fx.errors) console.error(`fx 載入失敗 ${e.path}：${e.message}`);
  for (const w of fx.warnings) console.error(`fx 提醒 ${w.path}：${w.message}`);
}
/** the registry for one project: shared plugins plus its fx (problems are printed, not thrown) */
async function registryFor(dir: string, project: Project) { const r = await projectRegistry(dir, plugins, project); reportFx(r.fx); return r.registry; }

/** `logo <專案> …`'s words after the project: the file is the one word that is neither a flag nor --name's value, so
 *  `--name Acme logo.svg` and `logo.svg --name Acme` read the same */
export function logoArgs(rest: string[]): { file?: string; name?: string } {
  const ni = rest.indexOf('--name');
  return { file: rest.find((a, i) => !a.startsWith('--') && (ni < 0 || i !== ni + 1)), name: ni >= 0 ? rest[ni + 1] : undefined };
}

async function main(argv: string[]) {
  const [cmd, id, ...rest] = argv;
  if (cmd === 'assets') { console.log(await assetsCommand(argv.slice(1))); return; }
  if (cmd === 'catalog') {
    // catalog [類型 | --find <關鍵字>…] [--project <專案>]: with a project, its own fx join the list
    const rest2 = [id, ...rest].filter((x): x is string => !!x), pi = rest2.indexOf('--project');
    const pid = pi >= 0 ? rest2[pi + 1] : undefined, words = rest2.filter((x, i) => x !== '--project' && (pi < 0 || i !== pi + 1));
    const find = words[0] === '--find', type = find ? undefined : words[0];
    if (find && words.length < 2) throw new Usage('用法：npm run tellcut -- catalog --find <關鍵字>（幾個字用空白分開，都要符合）');
    let all = plugins;
    if (pid) {
      const dir = join(TELLCUT_ROOT, 'projects', pid), fx = await loadProjectFx(dir, readProject(dir).meta.fx);
      reportFx(fx);
      all = [...plugins, { ...fx.plugin, id: 'fx' }];
    }
    console.log(find ? formatFind(all, words.slice(1).join(' ')) : type ? await formatLookup(all, type) : `${formatCatalog(all)}\n\n${describeRecipe()}`);
    return;
  }
  if (cmd === 'recipe') { console.log(describeRecipe(id)); return; }
  if (cmd === 'cut-api') { console.log(formatCutApi()); return; }
  if (!cmd || !id) throw new Usage('用法：npm run tellcut -- show|selection|propose|status|accept|reject|frames|seams|logo|request <專案> …，或 catalog [類型]、recipe [配方]、cut-api');
  const dir = join(TELLCUT_ROOT, 'projects', id);
  const opt = (k: string) => { const i = rest.indexOf(k); return i >= 0 ? rest[i + 1] : undefined; };
  switch (cmd) {
    case 'show': console.log(showProject(readProject(dir))); return;
    case 'status': {
      const p = readProposal(dir);
      if (!p) console.log('沒有待處理的提議'); else printProposal(p, !!(await server(id))?.connected);
      return;
    }
    case 'selection': {
      const s = await server(id);
      if (!s) throw new Error('伺服器沒開（npm run server）');
      if (!s.connected) throw new Error('編輯器沒開');
      const p = readProject(dir), lines = showProject(p).split('\n');
      console.log(`播放頭 ${f2(s.playhead)} 秒；選取 ${s.selection.length} 個：${s.selection.join('、') || '（無）'}`);
      for (const sel of s.selection) { const l = lines.find((x) => new RegExp(`^\\s+(↳ )?${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}  `).test(x)); if (l) console.log(l); }
      return;
    }
    case 'propose': {
      const src = rest[0];
      if (!src) throw new Usage('用法：npm run tellcut -- propose <專案> <file.json | ->');
      const body = JSON.parse(src === '-' ? readFileSync(0, 'utf8') : readFileSync(src, 'utf8'));
      if (typeof body?.label !== 'string' || !Array.isArray(body?.ops)) throw new Usage('提議檔格式：{ "label": "…", "ops": [ … ] }');
      const s = await server(id);
      if (s) {
        const r = await call(api(id, '/proposal'), { method: 'PUT', body: JSON.stringify(body) });
        if (r.status !== 200) throw new Error(r.body.error ?? `HTTP ${r.status}`);
        printProposal(r.body, s.connected);
      } else printProposal(proposeOnDisk(dir, body.label, body.ops), false);
      // the draft the chat wrote is sent: left there (kao1 kept one) it read like a proposal still waiting (R3-H8). The one
      // waiting is .history/proposals/current.json.
      if (src !== '-' && resolve(src) === join(dir, 'proposal.json')) rmSync(resolve(src), { force: true });
      return;
    }
    case 'accept': case 'reject': {
      const s = await server(id);
      if (s?.connected) {
        const r = await call(api(id, `/proposal/${cmd}`), { method: 'POST', body: '{}' });
        if (r.status === 504) throw new Error('編輯器沒有回應，專案沒有變動');
        if (r.status !== 200) throw new Error(r.body.error ?? `HTTP ${r.status}`);
        const o = r.body.outcome;
        console.log(o === 'stale' ? `提議已過期：${r.body.reason}` : o === 'superseded' ? `沒有${cmd === 'accept' ? '接受' : '撤回'}：${r.body.reason}` : `編輯器：${o === 'accepted' ? '已接受' : '已撤回'}`);
      } else {
        const r = decideOnDisk(dir, cmd);
        console.log(r.outcome === 'stale' ? `提議已過期：${r.reason}` : r.outcome === 'accepted' ? '已接受並寫進專案（舊版在 .history/）' : '已撤回');
      }
      return;
    }
    case 'frames': {
      const at = opt('--at');
      if (!at) throw new Usage('用法：npm run tellcut -- frames <專案> [--proposal] [--full] --at 1.5,3');
      const proposal = rest.includes('--proposal');
      let project = readProject(dir);
      if (proposal) {
        const prop = readProposal(dir);
        if (!prop) throw new Error('沒有待處理的提議');
        project = applyOps(project, prop.ops).project;
      }
      const files = await renderStills({ dir, project, times: at.split(',').map(Number), registry: await registryFor(dir, project), outDir: join(dir, 'output', 'frames'), tag: proposal ? 'proposal' : 'current', maxSide: rest.includes('--full') ? undefined : STILL_SIDE });
      for (const f of files) console.log(f);
      return;
    }
    case 'logo': {
      const { file, name } = logoArgs(rest);
      if (!file) throw new Usage('用法：npm run tellcut -- logo <專案> <商標檔（SVG、PNG、JPG、WebP）> [--name 名稱]');
      // a mistyped project id must not leave an empty projects/<typo>/media/brand/ behind (importLogo checks too)
      if (!existsSync(join(dir, 'project.json'))) throw new Error(`找不到專案 ${id}（projects/${id}/project.json 不存在）`);
      const { path, info } = await importLogo(dir, resolve(file));
      console.log(`已存到 ${path}（${info.kind.toUpperCase()}，${info.width}×${info.height}${info.transparent ? '，透明背景' : info.kind === 'svg' ? '' : '，不透明'}）`);
      if (info.kind === 'svg') console.log(info.extrudable ? '可以直接擠出成立體。' : `不能擠出（${info.why}），common.logo 會改做成立體板。`);
      else console.log('common.logo 會做成立體板（照商標外形切）。');
      console.log(`主色：${info.colors.join('、') || '（看不出來）'}`);
      if (info.colors[0]) console.log(`c.theme({ palette: { accent: '${info.colors[0]}' } })`);
      console.log(`c.effect('common.logo', { len: 5, logo: '${path}', name: '…', tagline: '…', url: '…' })`);
      // what common.logo makes of it, to look at: in 3D, and as a flat plate (the logo's own shape and colours)
      const project = readProject(dir);
      const pre = await logoPreviews({ projectDir: dir, logoPath: path, name, registry: await registryFor(dir, project) });
      console.log(`預覽（立體）：${pre.mark}`);
      console.log(`預覽（平面）：${pre.flat}`);
      const warn = logoContrastWarning(info, pre.bg);
      if (warn) console.log(warn);
      return;
    }
    case 'seams': {
      // every common.dolly's handoff to its clip, drawn alone on each side and compared by average colour and PSNR
      const project = readProject(dir);
      const r = await dollySeams({ projectDir: dir, project, registry: await registryFor(dir, project) });
      if (!r.length) { console.log('這個專案沒有 common.dolly'); return; }
      for (const s of r) console.log(seamLine(s));
      if (r.some((s) => !s.ok)) process.exitCode = 1;
      return;
    }
    case 'request': {
      const rid = opt('--id'), r = rid ? readRequest(dir, rid) : latestRequest(dir);
      if (!r) throw new Error(rid ? `沒有請求 ${rid}` : '還沒有請求（在編輯器的時間軸上按右鍵 →「Ask Agent…」）');
      const text = readFileSync(join(dir, 'project.json'), 'utf8'), p = parseProject(JSON.parse(text));
      console.log(describeRequest(dir, p, r, text));
      if (rest.includes('--frames')) {
        const ts = r.range ? [r.range[0] + 0.05, (r.range[0] + r.range[1]) / 2, r.range[1] - 0.05] : [r.playhead];
        const files = await renderStills({ dir, project: p, times: ts, registry: await registryFor(dir, p), outDir: join(dir, 'output', 'frames'), tag: 'request', maxSide: rest.includes('--full') ? undefined : STILL_SIDE });
        for (const f of files) console.log(`畫面：${f}`);
      }
      return;
    }
    default: throw new Usage(`沒有「${cmd}」這個指令`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  // exitCode, not exit(): exiting while a handle was still closing crashed Node on Windows (a libuv assertion, exit 127 to the
  // page chat, after the real error had been printed)
  main(process.argv.slice(2)).catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = e instanceof Usage ? 2 : 1; });
}
