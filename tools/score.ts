// Background music for a project (toolkit phase 3):
//   npm run score -- <專案> --style <風格> [--length 秒] [--bpm N] [--key Am] [--seed N] [--name 名稱]
//   npm run score -- --styles [<專案>]          the styles: built-in, the library (tellcut/score-library), and the project's own (projects/<id>/score)
// Writes media/score-<名稱>.wav (+ .json with the bars) and registers it as the music `score-<名稱>`; put it on the timeline with c.music('score-<名稱>').
// A style written for one project lives in projects/<id>/score/<名稱>.js; when it turns out good, `npm run promote-style` moves it into the library.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadAllStyles, SCORE_LIBRARY, TELLCUT_ROOT, STYLES, writeScore, type LoadedStyles } from '@tellcut/media-node';
import { handleOf } from '@tellcut/protocol';
import { fxChecks } from './check/rules.ts';

const projectDir = (id: string) => join(TELLCUT_ROOT, 'projects', id);

export function listStyles(loaded: LoadedStyles = { styles: {}, errors: [], warnings: [] }): string {
  const line = (s: { id: string; label: string; doc: string; defaults: { bpm: number; key: string } }, where: string) => `  ${(handleOf(`style:${s.id}`) ?? '').padEnd(6)}  ${s.id.padEnd(14)} ${s.label}（${where}，預設 ${s.defaults.bpm} BPM、${s.defaults.key}）— ${s.doc}`;
  const own = Object.values(loaded.styles);
  return [
    ...Object.values(STYLES).map((s) => line(s, '內建')),
    ...own.map((s) => line(s, resolve(s.file).startsWith(resolve(SCORE_LIBRARY)) ? '風格庫' : '本專案')),
    ...loaded.errors.map((e) => `  ✗ ${e.file}：${e.message}`),
    ...loaded.warnings.map((w) => `  ⚠ ${w.file}：${w.message}`),
  ].join('\n');
}

export async function main(argv: string[]): Promise<string> {
  const flags = new Map<string, string>(), pos: string[] = [];
  for (let i = 0; i < argv.length; i++) { if (argv[i] === '--styles') flags.set('styles', ''); else if (argv[i].startsWith('--')) flags.set(argv[i].slice(2), argv[++i] ?? ''); else pos.push(argv[i]); }
  const [id] = pos;
  const loaded = await loadAllStyles(id ? projectDir(id) : undefined);
  if (flags.has('styles')) return `配樂風格：\n${listStyles(loaded)}`;
  const style = flags.get('style');
  if (!id || !style) throw new Error(`用法：npm run score -- <專案> --style <風格> [--length 秒] [--bpm N] [--key Am] [--seed N] [--name 名稱]\n\n配樂風格：\n${listStyles(loaded)}`);
  const broken = loaded.errors.find((e) => e.file.endsWith(`${style}.js`));
  if (!STYLES[style] && !loaded.styles[style]) throw new Error(broken ? `風格「${style}」載入失敗：${broken.message}` : `沒有「${style}」這個風格\n\n配樂風格：\n${listStyles(loaded)}`);
  // a style that is not built in is code someone wrote for one project: the same rules as a project's own effects
  const own = loaded.styles[style];
  if (own) {
    const bad = fxChecks({ [own.file]: readFileSync(own.file, 'utf8') }).filter((f) => f.level === 'error');
    if (bad.length) throw new Error(`風格「${style}」不能用：\n${bad.map((f) => `  ${f.msg}`).join('\n')}`);
  }
  const num = (k: string) => (flags.has(k) ? Number(flags.get(k)) : undefined);
  const r = writeScore(projectDir(id), { style, styles: loaded.styles, length: num('length') ?? 30, bpm: num('bpm'), key: flags.get('key'), seed: num('seed'), name: flags.get('name') });
  const i = r.info;
  return `${r.mediaId}：${i.style}，${i.bpm} BPM，${i.key}，${i.bars} 小節，${i.duration.toFixed(1)} 秒 → ${r.wav}\n放進時間軸：c.music('${r.mediaId}')（第一拍在 0 秒，每小節 ${(i.barStarts[1] ?? 0).toFixed(2)} 秒）`;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2)).then((s) => console.log(s)).catch((e: Error) => { console.error(e.message); process.exit(1); });
}
