// Downloads every font the plugins declare into the player's public/fonts (and dist/fonts when built), for offline
// preview and export:   npm run fonts
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { FontSpec } from '@tellcut/engine';

// Google serves woff2 with unicode-range slices only to a modern browser
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const fileName = (url: string, ext: string) => `${createHash('sha1').update(url).digest('hex').slice(0, 16)}.${ext}`;
const extOf = (url: string) => (/\.(woff2|woff|ttf|otf)(?:[?#]|$)/i.exec(url)?.[1] ?? 'woff2').toLowerCase();
const FORMAT: Record<string, string> = { woff2: 'woff2', woff: 'woff', ttf: 'truetype', otf: 'opentype' };

/** the @font-face blocks of <dir>/fonts.css by family, only those whose font files are all still in <dir>/files */
function lastFaces(dir: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  let css = '';
  try { css = readFileSync(join(dir, 'fonts.css'), 'utf8'); } catch { return out; }
  for (const [block] of css.matchAll(/@font-face\s*\{[^}]*\}/g)) {
    const family = /font-family:\s*['"]?([^'";]+?)['"]?\s*;/.exec(block)?.[1];
    const urls = [...block.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)].map((m) => m[1]);
    if (!family || !urls.length || urls.some((u) => !u.startsWith('files/') || !existsSync(join(dir, u)))) continue;
    out.set(family, [...(out.get(family) ?? []), block]);
  }
  return out;
}

/** Writes <dir>/fonts.css and <dir>/files/*; font files already there are not fetched again. Returns the families that failed.
 *  A family that failed keeps its faces from the last fonts.css (review R4-T2: an offline `npm run setup` used to write an empty
 *  one, and preview and export quietly fell back to system fonts while the font files were all still there). */
export async function downloadFonts(specs: FontSpec[], dir: string, o: { fetch?: typeof fetch; cssBase?: string; log?: (s: string) => void } = {}) {
  const get = o.fetch ?? fetch, log = o.log ?? (() => {});
  mkdirSync(join(dir, 'files'), { recursive: true });
  const last = lastFaces(dir);
  const file = async (url: string, name?: string) => {
    const local = name ?? fileName(url, extOf(url)), path = join(dir, 'files', local);
    if (!existsSync(path)) {
      const r = await get(url, { headers: { 'User-Agent': UA } });
      if (!r.ok) throw new Error(`${r.status} ${url}`);
      writeFileSync(`${path}.tmp`, Buffer.from(await r.arrayBuffer()));
      renameSync(`${path}.tmp`, path);
      log(`  ${local}`);
    }
    return `files/${local}`;
  };
  const parts: string[] = [], failed: string[] = [];
  for (const spec of specs) {
    const family = typeof spec === 'string' ? spec.split(':')[0] : spec.family;
    try {
      if (typeof spec === 'string') {
        const r = await get(`${o.cssBase ?? 'https://fonts.googleapis.com'}/css2?family=${spec.replace(/ /g, '+')}&display=block`, { headers: { 'User-Agent': UA } });
        if (!r.ok) throw new Error(`${r.status} css for ${spec}`);
        let css = await r.text();
        for (const [, url] of [...css.matchAll(/url\((https?:[^)]+)\)/g)]) css = css.split(url).join(await file(url));
        parts.push(css);
      } else {
        const rel = await file(spec.url, spec.file), ext = extOf(spec.url);
        if (spec.face !== false) parts.push(`@font-face { font-family: '${spec.family}'; src: url(${rel}) format('${FORMAT[ext]}'); font-weight: ${spec.weight ?? 'normal'}; font-style: ${spec.style ?? 'normal'}; font-display: block; }`);
      }
      log(`${family} ✓`);
    } catch (e) {
      failed.push(family);
      log(`${family} ✗ ${(e as Error).message}`);
    }
  }
  const fresh = parts.join('\n');
  for (const family of failed) {
    const kept = (last.get(family) ?? []).filter((b) => !fresh.includes(b) && !parts.includes(b));
    parts.push(...kept);
    if (kept.length) log(`${family}: kept ${kept.length} face(s) from the last fonts.css`);
  }
  writeFileSync(join(dir, 'fonts.css.tmp'), parts.join('\n'));
  renameSync(join(dir, 'fonts.css.tmp'), join(dir, 'fonts.css'));
  return { failed };
}

/** The plugins' fonts with each Google family asked for once: core's 'Noto Sans TC:wght@400;500;700' and common's
 *  ':wght@500;700;900' were two requests, and fonts.css declared every 500 and 700 face twice. Same axes → one request with
 *  every value; other axes stay their own request. Exact duplicates (direct files too) go. */
export function mergeFontSpecs(specs: FontSpec[]): FontSpec[] {
  const out: FontSpec[] = [], google = new Map<string, Set<string>>(), seen = new Set<string>();
  for (const spec of specs) {
    const m = typeof spec === 'string' ? /^([^:]+):([a-z,]+)@(.+)$/i.exec(spec) : null;
    if (m) {
      const key = `${m[1]}:${m[2]}`;
      if (!google.has(key)) { google.set(key, new Set()); out.push(key); }
      for (const v of m[3].split(';')) google.get(key)!.add(v);
      continue;
    }
    const k = JSON.stringify(spec);
    if (!seen.has(k)) { seen.add(k); out.push(spec); }
  }
  // Google wants the tuples in ascending order
  const order = (a: string, b: string) => { const x = a.split(',').map(Number), y = b.split(',').map(Number); return x.reduce((d, v, i) => d || v - y[i], 0); };
  return out.map((s) => (typeof s === 'string' && google.has(s) ? `${s}@${[...google.get(s)!].sort(order).join(';')}` : s));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { plugins } = await import('@tellcut/plugins');
  const { TELLCUT_ROOT } = await import('@tellcut/media-node');
  const specs = mergeFontSpecs(plugins.flatMap((p) => p.fonts ?? []));
  const pub = join(TELLCUT_ROOT, 'apps/player/public/fonts'), dist = join(TELLCUT_ROOT, 'apps/player/dist');
  const { failed } = await downloadFonts(specs, pub, { log: console.log });
  if (existsSync(dist)) cpSync(pub, join(dist, 'fonts'), { recursive: true });
  if (failed.length) { console.error(`Failed: ${failed.join(', ')}`); process.exit(1); }
  console.log(`fonts ready (${specs.length} families) in ${pub}`);
}
