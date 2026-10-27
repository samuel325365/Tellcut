// Narration for a project (toolkit phase 3):  npm run voice -- <專案> [場景 id ...] [--engine edge|fake] [--force]
// Reads projects/<id>/narration.json and writes media/voice/<場景>.wav + .json (duration, caption phrases, word times).
// Scenes that did not change are left alone. Which speech engine speaks is tellcut/providers.json's `tts.use` unless --engine says otherwise.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadProvidersConfig, parseNarration, TELLCUT_ROOT, renderVoice, transcribeProvider, ttsProvider, type VoiceInfo } from '@tellcut/media-node';

export async function main(argv: string[], log: (s: string) => void = console.log): Promise<Record<string, VoiceInfo>> {
  const flags = new Map<string, string | true>(), pos: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { pos.push(a); continue; }
    flags.set(a.slice(2), a === '--force' ? true : argv[++i]);
  }
  const [id, ...only] = pos;
  const dir = join(TELLCUT_ROOT, 'projects', id ?? '');
  if (!id || !existsSync(join(dir, 'narration.json'))) throw new Error(id ? `projects/${id}/narration.json 不存在` : '用法：npm run voice -- <專案> [場景 id ...] [--engine edge] [--force]');
  const narration = parseNarration(JSON.parse(readFileSync(join(dir, 'narration.json'), 'utf8')));
  const config = loadProvidersConfig(), engine = typeof flags.get('engine') === 'string' ? (flags.get('engine') as string) : config.tts.use;
  const tts = ttsProvider({ ...config, tts: { ...config.tts, use: engine } });
  const status = await tts.check();
  if (!status.ok) throw new Error(`${tts.label} 不能用：${status.detail}${status.install ? `\n→ ${status.install}` : ''}`);
  return renderVoice({ dir, narration, tts, transcribe: transcribeProvider(config), only, force: flags.has('force'), log });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2)).then((out) => {
    const total = Object.values(out).reduce((s, v) => s + v.dur, 0);
    console.log(`\n共 ${Object.keys(out).length} 句、${total.toFixed(1)} 秒；放進時間軸：c.voice('<場景 id>')`);
  }).catch((e: Error) => { console.error(e.message); process.exit(1); });
}
