// Which third-party tool answers each capability, and whether it can run (toolkit phase 3):
//   npm run providers                 the chosen providers and their health
//   npm run providers -- --all        also every other provider Tellcut knows
// A tool that is missing is told with the command that installs it; nothing is installed or downloaded by looking.
import { pathToFileURL } from 'node:url';
import { FACES_FACTORIES, loadProvidersConfig, OCR_FACTORIES, TRANSCRIBE_FACTORIES, TTS_FACTORIES, type Provider, type ProvidersConfig } from '@tellcut/media-node';
import { parseArgsOrExit } from './args.ts';
import { providerStatus } from './setup/checks.ts';

const CAPS = { tts: TTS_FACTORIES, transcribe: TRANSCRIBE_FACTORIES, ocr: OCR_FACTORIES, faces: FACES_FACTORIES } as Record<'tts' | 'transcribe' | 'ocr' | 'faces', Record<string, (o: Record<string, unknown>) => Provider>>;

type Row = { capability: string; chosen: boolean; p: Provider };

const WORDS = {
  zh: { head: '能力        狀態     提供者          結果', chosen: '＊使用中', option: '  可選  ', ok: '可用', bad: '不能用', online: '（要網路）', local: '（本機）',
    foot: '換提供者：改 tellcut/providers.json 的 use；每個提供者的選項在 options 裡。',
    unknown: (known: string[]) => `Tellcut 還沒有這個提供者；有：${known.join('、') || '（無）'}`, unknownFix: '改 tellcut/providers.json 的 use' },
  en: { head: 'capability  status   provider        result', chosen: '* in use', option: ' option ', ok: 'works', bad: 'does not work', online: '(online)', local: '(local)',
    foot: 'To change a provider, change its "use" in tellcut/providers.json; each provider\'s options are under "options".',
    unknown: (known: string[]) => `Tellcut has no such provider; it has: ${known.join(', ') || '(none)'}`, unknownFix: 'change "use" in tellcut/providers.json' },
};

/** One line per provider; the check results are fetched together. `lang` 'en' for doctor, which prints English (tools/setup/checks.ts):
 *  a provider's own words are Chinese, so there only those that read in English are kept. */
export async function providerReport(config: ProvidersConfig, all = false, lang: 'zh' | 'en' = 'zh'): Promise<string> {
  const w = WORDS[lang];
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
    if (!known[use]) rows.push({ capability: cap, chosen: true, p: { id: use, label: use, online: false, check: async () => ({ ok: false, detail: w.unknown(Object.keys(known).filter((k) => k !== 'fake')), install: w.unknownFix }) } });
  }
  const lines = await Promise.all(rows.map(async ({ capability, chosen, p }) => {
    const s = await p.check().catch((e: Error) => ({ ok: false, detail: e.message.slice(0, 120), install: undefined, version: undefined }));
    const { detail, fix } = lang === 'en' ? providerStatus(p, s) : { detail: s.detail, fix: s.install };
    return `${capability.padEnd(11)} ${chosen ? w.chosen : w.option} ${p.id.padEnd(15)} ${s.ok ? w.ok : w.bad}  ${p.online ? w.online : w.local} ${s.version ? `v${s.version} ` : ''}${detail ?? ''}${!s.ok && fix ? `\n${' '.repeat(38)}→ ${fix}` : ''}`.trimEnd();
  }));
  return [w.head, ...lines, '', w.foot].join('\n');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try { console.log(await providerReport(loadProvidersConfig(), parseArgsOrExit(process.argv.slice(2), { '--all': 'switch' }, '用法：npm run providers [-- --all]', { maxWords: 0 }).has('--all'))); } catch (e) { console.error((e as Error).message); process.exit(1); }
}
