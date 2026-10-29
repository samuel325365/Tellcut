// Test projects for the library's tests: a project folder with fx modules, a font they load and a music style.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

/** an fx module defining `types` (ids), importing ./util.js and loading the chalk font; `extra` goes at the end of the file */
export const fxModule = (types: string[], extra = '') => `import { pad } from './util.js';
const block = (type, label) => ({ type, label, doc: label + ' doc', kind: 'overlay', category: 'text', params: [{ key: 'text', label: '文字', type: 'string', default: 'hi' }],
  build: (ctx) => ({ font: ctx.media.fileUrl('media/fonts/Chalk.ttf'), n: pad }), draw: () => {} });
export default [${types.map((t) => `block('${t}', '${t.slice(3)}')`).join(', ')}];
${extra}`;

export const styleModule = (id: string) => `export default { id: '${id}', label: '${id} 風格', doc: 'a style', defaults: { bpm: 96, key: 'C' }, build: (c) => [{ t: 0, inst: 'pad', vel: 0.1, pan: 0, midi: 60, dur: c.bar }] };\n`;

/** a project `id` under `projects` (made when absent): fx/chalk.js (two blocks), fx/util.js, media/fonts/Chalk.ttf, score/street-jazz.js */
export function makeProject(projects: string, id: string, o: { fx?: string; font?: string } = {}) {
  const dir = join(projects, id);
  const put = (rel: string, text: string) => { mkdirSync(dirname(join(dir, rel)), { recursive: true }); writeFileSync(join(dir, rel), text); };
  put('project.json', JSON.stringify({ version: 1, meta: { name: id.toUpperCase(), fx: ['fx/chalk.js'], theme: { palette: { accent: '#ff0000' } } } }));
  put('fx/chalk.js', o.fx ?? fxModule(['fx.chalk-title', 'fx.chalk-line']));
  put('fx/util.js', 'export const pad = 2;\n');
  put('media/fonts/Chalk.ttf', o.font ?? 'FONT-A');
  put('score/street-jazz.js', styleModule('street-jazz'));
  return dir;
}

/** a fresh projects folder (the library goes in its _library) */
export const tempProjects = () => mkdtempSync(join(tmpdir(), 'library-'));
