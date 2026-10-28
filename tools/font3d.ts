// The Chinese TTF 3D type is extruded from (word3d's cjk), downloaded the first time a project needs it:
//   npm run tellcut -- font3d <sans|serif|round>
// A Chinese font is 5-10 MB, so it is not among npm run fonts. Google's css2 API names a whole .ttf to a client that is not a
// browser (a browser gets woff2 in unicode-range slices), so the request carries no browser User-Agent.
import { copyFileSync, existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CJK_3D } from '@tellcut/plugin-common';
import { Usage } from './usage.ts';

export type Feel = keyof typeof CJK_3D;
/** each feel's Google family and weight */
const FAMILY: Record<Feel, [string, number]> = { sans: ['Noto Sans TC', 900], serif: ['Noto Serif TC', 900], round: ['Huninn', 400] };

/** The feel's TTF in every folder of `dirs` (the player's fonts/files, and dist's when built); a folder that already has it is
 *  left alone, and a copy is made from one that does rather than downloading again. A failed download leaves no file behind. */
export async function ensureFont3d(feel: Feel, o: { dirs: string[]; fetch?: typeof fetch; log?: (s: string) => void }): Promise<{ file: string; downloaded: boolean }> {
  if (!Object.hasOwn(FAMILY, feel)) throw new Usage(`沒有「${feel}」這種字感：sans（黑體）、serif（明體）、round（圓體）`);
  const file = CJK_3D[feel], [family, weight] = FAMILY[feel], get = o.fetch ?? fetch;
  const have = o.dirs.find((d) => existsSync(join(d, file)));
  let downloaded = false;
  if (!have) {
    const dir = o.dirs[0], path = join(dir, file);
    mkdirSync(dir, { recursive: true });
    try {
      const css = await get(`https://fonts.googleapis.com/css2?family=${family.replace(/ /g, '+')}:wght@${weight}`);
      if (!css.ok) throw new Error(`字型清單 HTTP ${css.status}`);
      const url = /src:\s*url\(\s*['"]?(https?:[^'")]+)/.exec(await css.text())?.[1];
      if (!url) throw new Error('字型清單裡沒有字型檔網址');
      const r = await get(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      writeFileSync(`${path}.tmp`, Buffer.from(await r.arrayBuffer()));
      renameSync(`${path}.tmp`, path);
    } catch (e) {
      rmSync(`${path}.tmp`, { force: true });
      throw new Error(`下載不到 ${family} ${weight}（${(e as Error).message}）`);
    }
    downloaded = true;
    o.log?.(`已下載 ${file}`);
  }
  const from = join(have ?? o.dirs[0], file);
  for (const d of o.dirs) if (!existsSync(join(d, file))) { mkdirSync(d, { recursive: true }); copyFileSync(from, join(d, file)); }
  return { file, downloaded };
}
