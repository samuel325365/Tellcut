// Outside media for a project (spec 2026-10-22-external-sources §4.4), as `npm run tellcut -- assets …`:
//   assets sources                       the sources an agent may use now, one line each
//   assets source <id>                   a source's capability card: how to search it, its conditions, examples, pitfalls
//   assets search <關鍵字…> [--source x] [--kind video|image|audio|music] [--ratio 9:16] [--min-sec n] [--max-sec n] [--opt k=v]… [--limit n]
//   assets get <專案> <編號> [--from 秒] [--len 秒] [--opt k=v]…   download into the project, registered and credited
//   assets credits <專案>                media/CREDITS.md written again from the records, and printed
//   assets data <來源> <查詢…> [--opt k=v]   a data source's answer (wikimedia: a Wikipedia intro in Traditional Chinese; maps: where a place is)
//   assets map <專案> --at <地名> | --from <地名> --to <地名> [--style street|satellite|light|dark] [--no-pin] …   a stitched map as a photo source
// Any of them with --help (or -h) prints its usage.
// Which sources exist is tellcut/sources.json + sources.local.json; `npm run sources` tells why one is missing.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { contextFor, getAsset, makeMap, openSources, probeDuration, searchAll, searchSheet, sourceStatuses, TELLCUT_ROOT, TILE_BUDGET, usableSource, writeCredits, type AssetKind, type MapStyle, type SearchQuery, type Sources } from '@tellcut/media-node';
import { Usage } from './usage.ts';

/** what the CLI takes — exported so the guides' test checks the guides against the command itself */
export const ASSET_SUBCOMMANDS = ['sources', 'source', 'search', 'get', 'map', 'data', 'credits'];
export const ASSET_KINDS: AssetKind[] = ['video', 'image', 'audio', 'music'];
export const MAP_MODES = ['driving', 'straight'] as const;
const KINDS = ASSET_KINDS;
export const ASSET_FLAGS = ['--source', '--kind', '--ratio', '--min-sec', '--max-sec', '--opt', '--limit', '--from', '--len',
  '--at', '--to', '--via', '--style', '--zoom', '--size', '--mode', '--color', '--name', '--no-pin'];
/** the flags that take no value */
const SWITCHES = new Set(['--no-pin']);
const VALUED = new Set(ASSET_FLAGS.filter((f) => !SWITCHES.has(f)));
export const MAP_STYLES: MapStyle[] = ['street', 'satellite', 'light', 'dark'];
const STYLES = MAP_STYLES;
const MAP_USAGE = '用法：npm run tellcut -- assets map <專案> (--at <地名|緯度,經度> | --from <地名> --to <地名> [--via <地名>]…) [--style street|satellite|light|dark] [--zoom z] [--size 1080x1920] [--mode driving|straight] [--color #e5484d] [--name 名稱] [--no-pin]';
const USAGE = '用法：npm run tellcut -- assets sources | source <id> | search <關鍵字…> [--source x] [--kind video|image|audio|music] [--min-sec n] [--max-sec n] [--opt k=v] | get <專案> <編號> [--from 秒 --len 秒] | credits <專案> | data <來源> <查詢…> | map <專案> --at <地名> …';
const SOURCE_USAGE = '用法：npm run tellcut -- assets source <id>';
const SEARCH_USAGE = '用法：npm run tellcut -- assets search <關鍵字…> [--source x] [--kind video|image|audio|music] [--ratio 9:16] [--min-sec n] [--max-sec n] [--opt k=v]… [--limit n]';
const GET_USAGE = '用法：npm run tellcut -- assets get <專案> <編號> [<編號>…] [--from 秒 --len 秒] [--opt k=v]…';
const DATA_USAGE = '用法：npm run tellcut -- assets data <來源> <查詢…> [--opt k=v]';
const CREDITS_USAGE = '用法：npm run tellcut -- assets credits <專案>';
/** what --help prints, per subcommand */
const USAGES: Record<string, string> = { sources: '用法：npm run tellcut -- assets sources', source: SOURCE_USAGE, search: SEARCH_USAGE, get: GET_USAGE, data: DATA_USAGE, credits: CREDITS_USAGE, map: MAP_USAGE };

/** positional words and flags, wherever the flags stand, as `--k v` or `--k=v`; --opt and --via may repeat. Any other `--…` is a
 *  mistake, never a keyword (`--from=10` once downloaded the whole file). */
function parse(argv: string[]) {
  const words: string[] = [], flags = new Map<string, string>(), opts: Record<string, string> = {}, via: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const eq = argv[i].startsWith('--') ? argv[i].indexOf('=') : -1;
    const a = eq > 0 ? argv[i].slice(0, eq) : argv[i];
    if (!a.startsWith('--')) { words.push(a); continue; }
    if (SWITCHES.has(a)) { if (eq > 0) throw new Usage(`${a} 後面不接值`); flags.set(a, ''); continue; }
    if (!VALUED.has(a)) throw new Usage(`沒有 ${a} 這個選項\n${USAGE}`);
    const v = eq > 0 ? argv[i].slice(eq + 1) : argv[++i];
    if (v === undefined) throw new Usage(`${a} 後面要有值`);
    if (a === '--opt') {
      const k = v.indexOf('=');
      if (k <= 0) throw new Usage('--opt 要寫成 k=v（例如 --opt feel=Calming）');
      opts[v.slice(0, k)] = v.slice(k + 1);
    } else if (a === '--via') via.push(v);
    else flags.set(a, v);
  }
  const num = (k: string) => {
    if (!flags.has(k)) return undefined;
    const n = Number(flags.get(k));
    if (!Number.isFinite(n)) throw new Usage(`${k} 要是數字`);
    return n;
  };
  return { words, flags, opts, via, num };
}

/** `assets map`: the stitched map, and what it took */
async function mapCommand(s: Sources, dir: string, rest: string[]): Promise<string> {
  const { flags, via, num } = parse(rest), style = flags.get('--style') as MapStyle | undefined, size = flags.get('--size'), mode = flags.get('--mode');
  if (style && !STYLES.includes(style)) throw new Usage(`--style 只能是 ${STYLES.join('、')}`);
  if (size && !/^\d+x\d+$/.test(size)) throw new Usage('--size 要像 1080x1920');
  // what map.py would otherwise answer with a Python traceback
  if (size && size.split('x').map(Number).some((n) => n < 64 || n > 4096)) throw new Usage('--size 的寬和高要在 64 到 4096 之間');
  const color = flags.get('--color');
  if (color !== undefined && !/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(color)) throw new Usage('--color 要像 #e5484d（# 加 3 或 6 位十六進位）');
  if (mode && !(MAP_MODES as readonly string[]).includes(mode)) throw new Usage(`--mode 只能是 ${MAP_MODES.join(' 或 ')}`);
  const r = await makeMap(s, dir, { at: flags.get('--at'), from: flags.get('--from'), to: flags.get('--to'), via, style, zoom: num('--zoom'),
    size: size ? (size.split('x').map(Number) as [number, number]) : undefined, mode: mode as 'driving' | 'straight' | undefined, color: flags.get('--color'), name: flags.get('--name'),
    ...(flags.has('--no-pin') ? { pins: false } : {}) });
  const km = (m: number) => `${(m / 1000).toFixed(m < 10_000 ? 1 : 0)} 公里`;
  return [
    `地圖 → ${r.record.path}（${r.size[0]}×${r.size[1]}，${r.label}，z${r.zoom}，圖磚 ${r.tiles} 張、新下載 ${r.downloaded} 張；本片累計 ${r.used}／${TILE_BUDGET}）`,
    ...(r.distance ? [r.distance.seconds !== undefined ? `路線 ${km(r.distance.meters)}，開車約 ${Math.max(1, Math.round(r.distance.seconds / 60))} 分鐘` : `直線 ${km(r.distance.meters)}`] : []),
    ...r.notes, `用法：${r.usage}`,
    `地圖鏡頭（推拉、路線、圖釘、小地圖）：c.effect('common.mapcam', { at: 秒, len: 秒, source: '${r.record.sourceId}', places: …, cam: … })（catalog common.mapcam；座標和 z 已記在素材裡）`,
    'credits 已更新：media/CREDITS.md',
  ].join('\n');
}

const secs = (d?: number) => (d === undefined ? '' : `${d.toFixed(1)} 秒`);
/** a downloaded sound whose peak is below this is told to be quiet (most sit within a few dB of the -1 dBTP limit) */
const QUIET_PEAK = -12;

export async function assetsCommand(argv: string[], o: { sources?: Sources; projectsDir?: string } = {}): Promise<string> {
  const [sub, ...rest] = argv;
  // asking is not a mistake: the usage on stdout, exit 0 (the map's once read --help as a project)
  if (argv.some((a) => a === '--help' || a === '-h')) return USAGES[sub] ?? USAGE;
  const s = o.sources ?? openSources(), projectsDir = o.projectsDir ?? join(TELLCUT_ROOT, 'projects');
  const projectDir = (id: string | undefined, usage: string) => {
    if (!id) throw new Usage(usage);
    const dir = join(projectsDir, id);
    if (!existsSync(join(dir, 'project.json'))) throw new Error(`沒有專案 ${id}`);
    return dir;
  };
  switch (sub) {
    case 'sources': {
      const all = sourceStatuses(s), ok = all.filter((x) => x.available);
      // the page chat: the user ticked these in the API menu; another one is theirs to tick, not something to work around
      const unpicked = all.some((x) => x.reason === 'unpicked') ? ['', '（這些是使用者這次在 API 選單勾的；需要別的來源，請使用者勾選）'] : [];
      if (!ok.length) return unpicked.length ? '使用者這次沒有勾選任何 API：需要外部素材時，請使用者在對話框的 API 選單勾選' : '目前沒有可用的素材來源（npm run sources 看原因）';
      return [...ok.map((x) => `${x.id.padEnd(12)}  ${x.adapter!.summary}${x.adapter!.data ? `（另有資料查詢：assets data ${x.id} …）` : ''}`), ...unpicked, '', '看完整說明：npm run tellcut -- assets source <id>'].join('\n');
    }
    case 'source': {
      const id = rest[0];
      if (!id) throw new Usage(SOURCE_USAGE);
      const st = sourceStatuses(s).find((x) => x.id === id);
      if (!st?.adapter) throw new Error(`沒有「${id}」這個來源（npm run tellcut -- assets sources 看有哪些）`);
      return st.available ? st.adapter.card() : `⚠ 目前不能用：${st.why}\n\n${st.adapter.card()}`;
    }
    case 'search': {
      const { words, flags, opts, num } = parse(rest), kind = flags.get('--kind');
      if (kind && !KINDS.includes(kind as AssetKind)) throw new Usage(`--kind 只能是 ${KINDS.join('、')}`);
      const q: SearchQuery & { source?: string } = { text: words.join(' ').trim(), opts, limit: num('--limit') ?? 8,
        ...(flags.has('--source') ? { source: flags.get('--source') } : {}), ...(kind ? { kind: kind as AssetKind } : {}), ...(flags.has('--ratio') ? { ratio: flags.get('--ratio') } : {}),
        ...(flags.has('--min-sec') ? { minSec: num('--min-sec') } : {}), ...(flags.has('--max-sec') ? { maxSec: num('--max-sec') } : {}) };
      const r = await searchAll(s, q);
      const out = r.hits.flatMap((h) => [
        [h.ref, secs(h.duration), h.title, h.bpm ? `${h.bpm} BPM` : '', h.detail ?? '', h.tags?.length ? `[${h.tags.slice(0, 3).join(', ')}]` : ''].filter(Boolean).join('  '),
        ...(h.thumb ? [`    縮圖 ${h.thumb}`] : []),
      ]);
      for (const p of r.problems) out.push(`⚠ ${p.source} ${p.kind === 'broken' ? '壞掉' : '暫時不能用'}：${p.message}`);
      // nobody asked is not "nothing found": the agent would only keep rewording the query
      // in the page chat that is usually the ticks, not a broken source: say what the user can do
      if (!r.asked.length) return sourceStatuses(s).some((x) => x.reason === 'unpicked')
        ? `使用者這次沒有勾選可以搜${kind ? `「${kind}」` : ''}的來源：請使用者在對話框的 API 選單勾選`
        : `目前沒有可以搜${kind ? `「${kind}」` : ''}的素材來源（npm run sources 看原因）`;
      if (!r.hits.length && !r.problems.length) return '沒有找到；換個關鍵字（多數來源用英文）';
      // one picture to look at instead of one per hit: the image budget counts each Read
      // a sheet that cannot be made (a thumbnail Python cannot open) costs only its line: the results still come back
      const sheet = await searchSheet(r.hits, s.cacheDir).catch(() => null);
      return [...(sheet ? [`縮圖總覽：${sheet}（每格下面是編號；用 Read 看這一張就好）`, ''] : []), ...out, '', '下載：npm run tellcut -- assets get <專案> <編號> [--from 秒 --len 秒]'].join('\n');
    }
    case 'get': {
      const { words, opts, num } = parse(rest), usage = GET_USAGE;
      const [id, ...refs] = words;
      if (!id || !refs.length) throw new Usage(usage);
      const dir = projectDir(id, usage);
      // several refs (a wall of photos) in one call: each in turn; a cut (--from/--len) is per clip, so one ref at a time then
      if (refs.length > 1 && (num('--from') !== undefined || num('--len') !== undefined)) throw new Error('--from／--len 是單一片段的裁切：一次一個編號');
      const one = async (ref: string) => {
      const r = await getAsset(s, dir, ref, { from: num('--from'), len: num('--len'), opts });
      // a picture is told by its size; a sound by its length and the peak it was brought under
      const what = async () => {
        if (r.record.sourceId) { const src = JSON.parse(readFileSync(join(dir, 'project.json'), 'utf8')).sources[r.record.sourceId]; return `${src.width}×${src.height}${src.kind === 'video' ? `，${secs(src.duration)}${src.audio ? '' : '，沒有聲音'}` : ''}`; }
        return `${secs(await probeDuration(join(dir, r.record.path)))}，峰值 ${r.record.peak !== undefined ? `${r.record.peak.toFixed(1)} dBTP` : '-inf（無聲）'}`;
      };
      const head = r.reused ? `已經有了 ${ref} → ${r.record.path}` : `已下載 ${ref} → ${r.record.path}（${await what()}）`;
      // the sound is never made louder (only its peaks are limited): a quiet one is said so, with the gain that brings it level
      const room = r.record.peak !== undefined && r.record.peak < QUIET_PEAK ? Math.floor(-1 - r.record.peak) : 0;
      const quiet = room ? [`⚠ 很小聲（峰值 ${r.record.peak!.toFixed(1)} dBTP）：gain 可以比平常再加大約 ${room} dB${r.record.mediaId ? '' : `（例如 c.sfxFile 的 gain: ${Math.min(24, -8 + room)}）`}`] : [];
      return [head, `用法：${r.usage}`, ...quiet, ...(r.reused ? [] : ['credits 已更新：media/CREDITS.md'])].join('\n');
      };
      if (refs.length === 1) return one(refs[0]);
      const done: string[] = [], failed: string[] = [];
      for (const ref of refs) { try { done.push(await one(ref)); } catch (e) { failed.push(`${ref}（${(e as Error).message}）`); } }
      const text = [...done, ...(failed.length ? [`這幾個沒拿到：\n${failed.map((x) => `  ${x}`).join('\n')}`] : [])].join('\n\n');
      if (failed.length) throw new Error(text);
      return text;
    }
    case 'data': {
      const { words, opts } = parse(rest), [id, ...query] = words, text = query.join(' ').trim();
      if (!id || !text) throw new Usage(DATA_USAGE);
      const a = usableSource(s, id);
      if (!a.data) throw new Error(`來源 ${id} 沒有資料查詢`);
      const ctx = contextFor(s, id, join(s.cacheDir, 'data', id));
      ctx.options = { ...ctx.options, ...opts };
      return a.data(text, ctx);
    }
    case 'map': return mapCommand(s, projectDir(rest[0], MAP_USAGE), rest.slice(1));
    case 'credits': {
      const dir = projectDir(rest[0], CREDITS_USAGE);
      return readFileSync(writeCredits(dir, s.adapters), 'utf8').trimEnd();
    }
    default: throw new Usage(USAGE);
  }
}
