// The gallery's thumbnails in English and Japanese (spec 2026-10-30-showcase-films part 2):  npm run thumbs
// A block's thumbnail is its card, its first sample, a block template's its <block>-tpl-<id> sample (either drawn over the street, its
// -street sibling, for a block marked over: cardSample, plugin-common/src/samples.ts), a caption template's its tpl-<id> sample, at its last
// moment; when that shows Chinese words (the case's own, or ones the block starts with), it is drawn again here with them in the other language: the case's params from golden/thumbs.ts, the block's words from
// apps/editor/src/i18n/values.*.ts. The pictures go to packages/plugin-common/golden/thumbs/<lang>/, with a manifest of what each was
// drawn from (thumbs.test.ts fails when a table or the block's own golden picture changed and they were not drawn again). Run
// npm run build:player first. Windows only, like the shared golden pictures they are drawn beside.
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRegistry } from '@tellcut/engine';
import { goldenFile, runGolden, TELLCUT_ROOT, type GoldenCase } from '@tellcut/media-node';
import { plugins } from '@tellcut/plugins';
import { CAP_EN, CAP_JA, cardSample, HEAD_EN, HEAD_JA, samples, templateSample, type Sample } from '@tellcut/plugin-common/samples';
import { THUMB_PARAMS } from '../packages/plugin-common/golden/thumbs.ts';
import { parseArgsOrExit } from './args.ts';
import { hasCjk, localValues } from '@tellcut/editor/i18n/values';

const GOLDEN_DIR = join(TELLCUT_ROOT, 'packages/plugin-common/golden');
export const THUMBS_DIR = join(GOLDEN_DIR, 'thumbs');
export type ThumbLang = 'en' | 'ja';

/** the thumbnails that show Chinese, as cases with their words in `lang`, each at the one moment the gallery shows */
export function thumbCases(lang: ThumbLang): GoldenCase[] {
  const defs = new Map(plugins.flatMap((p) => p.items ?? []).map((t) => [t.type, t.params]));
  // each block's card, as the server's gallery shows it (cardSample), in the order of the samples
  const first = new Map<string, Sample>();
  for (const c of samples) if (!first.has(c.type)) first.set(c.type, cardSample(c.type)!);
  // a block template's sample (<block>-tpl-<id>) is its card in the gallery's detail: drawn again like a block's first one (its card
  // too: over the street for a block marked over)
  const blockTemplates = samples.filter((c) => /.-tpl-/.test(c.name) && !c.street).map((c) => cardSample(c.type, c.name.slice(templateSample(c.type, '').length))!);
  // every caption template's card (tpl-<id>) and title template's (ttl-<id>) too: the template's own params with the English or
  // Japanese line (or title) in place of the Chinese one
  const line = (name: string) => (name.startsWith('ttl-') ? (lang === 'en' ? HEAD_EN : HEAD_JA) : lang === 'en' ? CAP_EN : CAP_JA);
  const templates = (samples as GoldenCase[]).filter((c) => c.name.startsWith('tpl-') || c.name.startsWith('ttl-')).map((c) => ({ ...c, params: { ...c.params, ...line(c.name) }, at: [c.at[c.at.length - 1]] }));
  return [...[...first.values(), ...blockTemplates].flatMap((c): GoldenCase[] => {
    // a card over the street has the words of the sample it is drawn from: the table names that one
    const params = THUMB_PARAMS[lang][c.street ?? c.name] ?? c.params ?? {};
    const words = Object.fromEntries(Object.entries(localValues(c.type, defs.get(c.type) ?? [], lang)).filter(([k]) => !(k in params)));
    if (!hasCjk(JSON.stringify(c.params ?? {})) && !Object.keys(words).length) return [];
    return [{ ...(c as GoldenCase), params: { ...words, ...params }, at: [c.at[c.at.length - 1]] }];
  }), ...templates];
}

/** the Chinese golden picture of the same case and moment: a change in how the block draws is a new golden (npm run golden --
 *  --update), which this follows; the words alone cannot tell */
const goldenBytes = (c: GoldenCase) => { const f = join(GOLDEN_DIR, goldenFile(c, c.at[0])); return existsSync(f) ? readFileSync(f) : Buffer.alloc(0); };

/** what a thumbnail is drawn from, short: a change in it means the picture is out of date */
export const thumbKey = (c: GoldenCase) => createHash('sha1').update(JSON.stringify([c.type, c.params, c.theme ?? null, c.bg ?? null, !!c.wide, c.len ?? 3, c.at, c.sources ?? null, ...(c.square ? ['square'] : [])]))
  .update(goldenBytes(c)).digest('hex').slice(0, 12);

async function main() {
  parseArgsOrExit(process.argv.slice(2), {}, '用法：npm run thumbs', { maxWords: 0 });
  // the thumbnails are shared, Windows' pictures like the shared golden ones: a Mac's (CoreText, Apple's emoji) would replace them all
  if (process.platform !== 'win32') throw new Error('npm run thumbs 只在 Windows 上跑：縮圖是共用的 Windows 圖，Mac 畫的字型與 emoji 不同，會把它們全部蓋掉（Mac 自己的圖只在 golden/darwin/）');
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
