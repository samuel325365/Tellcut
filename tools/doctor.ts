// npm run doctor (spec 2026-10-17-studio-handover §8): is everything Tellcut needs on this PC? Only looks — installs nothing,
// spends no Claude tokens. The first thing to run when something does not work. It prints in English, like setup (checks.ts).
import { loadProvidersConfig, openSources } from '@tellcut/media-node';
import { allChecks, table, whisperModelName } from './setup/checks.ts';
import { providerReport } from './providers.ts';
import { sourcesReport } from './sources.ts';
import { parseArgsOrExit } from './args.ts';

parseArgsOrExit(process.argv.slice(2), {}, 'Usage: npm run doctor', { lang: 'en', maxWords: 0 });
const config = loadProvidersConfig();
const checks = await allChecks({ whisperModel: whisperModelName(String(config.transcribe.options['faster-whisper']?.model ?? 'large-v3-turbo')) });
console.log(table(checks));
console.log('\n' + await providerReport(config, false, 'en'));
// outside media sources are optional: what they say never fails the doctor
try { console.log('\n' + await sourcesReport(openSources(), { lang: 'en' })); } catch (e) { console.log(`\nOutside media sources: ${(e as Error).message}`); }
if (checks.some((c) => !c.ok)) process.exit(1);
