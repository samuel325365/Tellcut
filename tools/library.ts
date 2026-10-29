// The user's own library from the command line (spec 2026-10-29-my-library §4.3): what the agent uses to look in it, save
// into it, copy an entry into a project and check an entry it edited. The page's buttons call the same media-node code.
//   npm run tellcut -- library list
//   npm run tellcut -- library save <專案> <fx/x.js | score/x.js> [--type <fx.…>] [--name …] [--desc …] [--category …] [--replace | --keep-both]
//   npm run tellcut -- library use <專案> <slug…> | --style <slug>
//   npm run tellcut -- library refresh <slug>
//   npm run tellcut -- library remove <slug> [--style]
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { blockDir, libraryRoot, listLibrary, loadProjectFx, loadStyles, makeThumb, PROJECT_ID, refreshBlock, removeBlock, removeStyle, saveBlock, saveStyle, TELLCUT_ROOT, useBlock, useStyle, type OnConflict } from '@tellcut/media-node';
import { plugins } from '@tellcut/plugins';
import { fxChecks } from './check/rules.ts';
import { Usage } from './usage.ts';

const USAGE = '用法：npm run tellcut -- library list | save <專案> <fx/x.js|score/x.js> [--type <fx.…>] [--name …] [--desc …] [--category …] [--replace|--keep-both] | use <專案> <slug…> | use <專案> --style <slug> | refresh <slug> | remove <slug> [--style]';

/** projects: the projects folder (tests point it elsewhere); thumb: false skips drawing thumbnails (no Chrome) */
export async function libraryCommand(args: string[], o: { projects?: string; thumb?: boolean } = {}): Promise<string> {
  const projects = o.projects ?? join(TELLCUT_ROOT, 'projects'), root = libraryRoot(projects);
  const flags = new Map<string, string>(), pos: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (['--replace', '--keep-both', '--style', '--no-thumb'].includes(a)) flags.set(a.slice(2), '');
    else if (a.startsWith('--')) flags.set(a.slice(2), args[++i] ?? '');
    else pos.push(a);
  }
  const thumb = o.thumb !== false && !flags.has('no-thumb');
  const [cmd, ...rest] = pos;
  // a project id as everywhere else (no ../, no _library or other _ folder): the copy and its links are written under it
  const projectDir = (id: string | undefined) => {
    if (!id) throw new Usage(USAGE);
    if (!PROJECT_ID.test(id)) throw new Error(`「${id}」不是專案名稱（英文字母、數字、_ 和 -，不能用 _ 或 - 開頭）`);
    if (!existsSync(join(projects, id, 'project.json'))) throw new Error(`沒有專案「${id}」`);
    return join(projects, id);
  };
  switch (cmd) {
    case 'list': {
      const lib = listLibrary(root), blocks = lib.blocks.flatMap((e) => e.types.map((t) => ({ e, t })));
      const w = Math.max(0, ...blocks.map((x) => x.e.slug.length)), wt = Math.max(0, ...blocks.map((x) => x.t.type.length));
      return ['我的積木（用法：library use <專案> <slug>）：', ...(blocks.length ? blocks.map(({ e, t }) => `  ${e.slug.padEnd(w)}  ${t.type.padEnd(wt)}  ${t.name}${t.desc ? ` — ${t.desc}` : ''}`) : ['  （還沒有）']),
        '', '我的配樂風格（用法：library use <專案> --style <slug>）：', ...(lib.styles.length ? lib.styles.map((s) => `  ${s.slug}  ${s.id}  ${s.name}${s.desc ? ` — ${s.desc}` : ''}`) : ['  （還沒有）'])].join('\n');
    }
    case 'save': {
      const [id, file] = rest, dir = projectDir(id);
      if (!file) throw new Usage(USAGE);
      const onConflict: OnConflict | undefined = flags.has('replace') ? 'replace' : flags.has('keep-both') ? 'keep-both' : undefined;
      const said = { ...(flags.get('name') ? { name: flags.get('name') } : {}), ...(flags.has('desc') ? { desc: flags.get('desc') } : {}), ...(flags.get('category') ? { category: flags.get('category') } : {}) };
      if (file.replace(/\\/g, '/').startsWith('score/')) {
        const own = await loadStyles([join(dir, 'score')]), s = Object.values(own.styles).find((x) => resolve(x.file) === resolve(dir, file));
        if (!s) throw new Error(`${file} 不是能載入的配樂風格${own.errors[0] ? `：${own.errors[0].message}` : ''}`);
        const r = await saveStyle({ root, projectDir: dir, projectId: id, id: s.id, ...said, onConflict });
        if ('conflict' in r) throw new Error(`我的配樂風格裡已經有「${r.conflict.name}」：加 --replace 取代它，或 --keep-both 兩個都留（新的改 id）`);
        return `已存進我的配樂風格：${r.entry.slug}（c.score('${r.entry.id}')，用之前先 library use <專案> --style ${r.entry.slug}）`;
      }
      const fx = file.replace(/\\/g, '/');
      const types = (await loadProjectFx(dir, [fx])).plugin.items?.map((t) => t.type) ?? [];
      // --type: the block the names are for (a module may hold several); else its first
      const named = flags.get('type') || types[0];
      if (flags.get('type') && !types.includes(named)) throw new Error(`${fx} 裡沒有 ${named}（有：${types.join('、')}）`);
      const r = await saveBlock({ root, projectDir: dir, projectId: id, file: fx, names: named && Object.keys(said).length ? { [named]: said } : undefined, onConflict });
      if ('conflict' in r) throw new Error(`我的積木裡已經有「${r.conflict.name}」（${r.conflict.types.join('、')}）：加 --replace 取代它，或 --keep-both 兩個都留（新的改 id）`);
      if (thumb) await makeThumb(root, r.entry.slug, plugins);
      return [`已存進我的積木：${r.entry.slug}（${r.entry.types.map((t) => t.type).join('、')}）`,
        ...(r.skipped.length ? [`沒有一起存（程式裡用算出來的路徑，或檔案不在）：${r.skipped.join('、')}`] : [])].join('\n');
    }
    case 'use': {
      const [id, ...slugs] = rest, dir = projectDir(id);
      if (flags.has('style')) {
        const slug = slugs[0] ?? flags.get('style');
        if (!slug) throw new Usage(USAGE);
        const r = useStyle({ root, projectDir: dir, slug });
        return `已複製到 ${r.file}：c.score('${r.id}')`;
      }
      if (!slugs.length) throw new Usage(USAGE);
      const meta = JSON.parse(readFileSync(join(dir, 'project.json'), 'utf8')).meta ?? {};
      const out: string[] = [];
      let fx: string[] = meta.fx ?? [];
      for (const slug of slugs) {
        const r = await useBlock({ root, projectDir: dir, projectId: id, slug, fx });
        fx = [...fx, r.file];
        out.push(`c.fx('${r.file}')  // ${r.types.join('、')}（之後 c.effect('${r.types[0]}', …)）`);
      }
      return ['在 cut.ts 裡加：', ...out].join('\n');
    }
    case 'refresh': {
      const [slug] = rest;
      if (!slug) throw new Usage(USAGE);
      const before = listLibrary(root).blocks.find((e) => e.slug === slug)?.version, dir = blockDir(root, slug);
      // checked before the new version is written: one that fails is never offered to projects as an Update
      const e = await refreshBlock(root, slug, (files) => {
        const bad = fxChecks(Object.fromEntries(files.filter((f) => f.startsWith('fx/')).map((f) => [f, readFileSync(join(dir, f), 'utf8')]))).filter((f) => f.level === 'error');
        if (bad.length) throw new Error(`${slug} 有問題：\n${bad.map((f) => `  ${f.msg}`).join('\n')}`);
      });
      if (thumb) await makeThumb(root, slug, plugins);
      return e.version === before ? `${slug}：內容沒變` : `${slug}：新版本 ${e.version}（用過它的專案會看到「Update」）`;
    }
    case 'remove': {
      const [slug] = rest;
      if (!slug) throw new Usage(USAGE);
      if (flags.has('style')) removeStyle(root, slug); else removeBlock(root, slug);
      return `已刪除 ${slug}（已經用了它的專案各有一份，不受影響）`;
    }
    default: throw new Usage(USAGE);
  }
}
