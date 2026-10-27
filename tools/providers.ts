// Which third-party tool answers each capability, and whether it can run (toolkit phase 3):
//   npm run providers                 the chosen providers and their health
//   npm run providers -- --all        also every other provider Tellcut knows
// A tool that is missing is told with the command that installs it; nothing is installed or downloaded by looking.
import { pathToFileURL } from 'node:url';
import { FACES_FACTORIES, loadProvidersConfig, OCR_FACTORIES, TRANSCRIBE_FACTORIES, TTS_FACTORIES, type Provider, type ProvidersConfig } from '@tellcut/media-node';

const CAPS = { tts: TTS_FACTORIES, transcribe: TRANSCRIBE_FACTORIES, ocr: OCR_FACTORIES, faces: FACES_FACTORIES } as Record<'tts' | 'transcribe' | 'ocr' | 'faces', Record<string, (o: Record<string, unknown>) => Provider>>;

type Row = { capability: string; chosen: boolean; p: Provider };

/** One line per provider; the check results are fetched together. */
export async function providerReport(config: ProvidersConfig, all = false): Promise<string> {
  const rows: Row[] = [];
  for (const [cap, factories] of Object.entries(CAPS) as Array<[keyof typeof CAPS, (typeof CAPS)[keyof typeof CAPS]]>) {
    const use = config[cap].use;
    for (const [id, make] of Object.entries(factories)) {
      if (id === 'fake' && id !== use) continue;                    // test stand-ins stay out of the list
      if (!all && id !== use) continue;
      rows.push({ capability: cap, chosen: id === use, p: make(config[cap].options[id] ?? {}) });
    }
  }
  // the provider the config names may not exist (yet): say so instead of stopping
  for (const cap of Object.keys(CAPS) as Array<keyof typeof CAPS>) {
    const use = config[cap].use, known = CAPS[cap];
    if (!known[use]) rows.push({ capability: cap, chosen: true, p: { id: use, label: use, online: false, check: async () => ({ ok: false, detail: `Tellcut 還沒有這個提供者；有：${Object.keys(known).filter((k) => k !== 'fake').join('、') || '（無）'}`, install: '改 tellcut/providers.json 的 use' }) } });
  }
  const lines = await Promise.all(rows.map(async ({ capability, chosen, p }) => {
    const s = await p.check().catch((e: Error) => ({ ok: false, detail: e.message.slice(0, 120), install: undefined, version: undefined }));
    const mark = s.ok ? '可用' : '不能用';
    return `${capability.padEnd(11)} ${chosen ? '＊使用中' : '  可選  '} ${p.id.padEnd(15)} ${mark}  ${p.online ? '（要網路）' : '（本機）'} ${s.version ? `v${s.version} ` : ''}${s.detail}${!s.ok && s.install ? `\n${' '.repeat(38)}→ ${s.install}` : ''}`;
  }));
  return ['能力        狀態     提供者          結果', ...lines, '', '換提供者：改 tellcut/providers.json 的 use；每個提供者的選項在 options 裡。'].join('\n');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try { console.log(await providerReport(loadProvidersConfig(), process.argv.includes('--all'))); } catch (e) { console.error((e as Error).message); process.exit(1); }
}
