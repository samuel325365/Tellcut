// The gallery's thumbnails in English and Japanese (spec 2026-10-30-showcase-films part 2):  npm run thumbs
// A block's thumbnail is its first sample (plugin-common/src/samples.ts) at its last moment; when that shows Chinese words (the case's own, or ones the block
// starts with), it is drawn again here with them in the other language: the case's params from golden/thumbs.ts, the block's words from
// apps/editor/src/i18n/values.*.ts. The pictures go to packages/plugin-common/golden/thumbs/<lang>/, with a manifest of what each was
// drawn from (thumbs.test.ts fails when a table or the block's own golden picture changed and they were not drawn again). Run
// npm run build:player first.
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRegistry } from '@tellcut/engine';
import { goldenFile, runGolden, TELLCUT_ROOT, type GoldenCase } from '@tellcut/media-node';
import { plugins } from '@tellcut/plugins';
import { samples } from '@tellcut/plugin-common/samples';
import { THUMB_PARAMS } from '../packages/plugin-common/golden/thumbs.ts';
import { hasCjk, localValues } from '@tellcut/editor/i18n/values';

const GOLDEN_DIR = join(TELLCUT_ROOT, 'packages/plugin-common/golden');
export const THUMBS_DIR = join(GOLDEN_DIR, 'thumbs');
export type ThumbLang = 'en' | 'ja';

/** the thumbnails that show Chinese, as cases with their words in `lang`, each at the one moment the gallery shows */
export function thumbCases(lang: ThumbLang): GoldenCase[] {
  const defs = new Map(plugins.flatMap((p) => p.items ?? []).map((t) => [t.type, t.params]));
  const first = new Map<string, GoldenCase>();
  for (const c of samples as GoldenCase[]) if (!first.has(c.type)) first.set(c.type, c);
  return [...first.values()].flatMap((c) => {
    const params = THUMB_PARAMS[lang][c.name] ?? c.params ?? {};
    const words = Object.fromEntries(Object.entries(localValues(c.type, defs.get(c.type) ?? [], lang)).filter(([k]) => !(k in params)));
    if (!hasCjk(JSON.stringify(c.params ?? {})) && !Object.keys(words).length) return [];
    return [{ ...c, params: { ...words, ...params }, at: [c.at[c.at.length - 1]] }];
  });
}

/** the Chinese golden picture of the same case and moment: a change in how the block draws is a new golden (npm run golden --
 *  --update), which this follows; the words alone cannot tell */
const goldenBytes = (c: GoldenCase) => { const f = join(GOLDEN_DIR, goldenFile(c, c.at[0])); return existsSync(f) ? readFileSync(f) : Buffer.alloc(0); };

/** what a thumbnail is drawn from, short: a change in it means the picture is out of date */
export const thumbKey = (c: GoldenCase) => createHash('sha1').update(JSON.stringify([c.type, c.params, c.theme ?? null, c.bg ?? null, !!c.wide, c.len ?? 3, c.at, c.sources ?? null]))
  .update(goldenBytes(c)).digest('hex').slice(0, 12);

async function main() {
  const registry = createRegistry(plugins), manifest: Record<string, Record<string, string>> = {};
  for (const lang of ['en', 'ja'] as const) {
    const list = thumbCases(lang), dir = join(THUMBS_DIR, lang);
    await runGolden(list, { registry, goldenDir: dir, sourceDir: GOLDEN_DIR, work: join(TELLCUT_ROOT, 'projects/_golden'), update: true, log: (l) => console.error(l) });
    manifest[lang] = Object.fromEntries(list.map((c) => [goldenFile(c, c.at[0]), thumbKey(c)]));
    // a block whose thumbnail no longer shows Chinese leaves no picture behind
    for (const f of readdirSync(dir)) if (!(f in manifest[lang])) rmSync(join(dir, f));
    console.log(`${lang}：${list.length} 張`);
  }
  writeFileSync(join(THUMBS_DIR, 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main().catch((e: Error) => { console.error(e.message); process.exit(1); });
