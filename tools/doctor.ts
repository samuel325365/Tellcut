// npm run doctor (spec 2026-10-17-studio-handover §8): is everything Tellcut needs on this PC? Only looks — installs nothing,
// spends no Claude tokens. The first thing to run when something does not work.
import { loadProvidersConfig, openSources } from '@tellcut/media-node';
import { allChecks, table, whisperModelName } from './setup/checks.ts';
import { providerReport } from './providers.ts';
import { sourcesReport } from './sources.ts';

const config = loadProvidersConfig();
const checks = await allChecks({ whisperModel: whisperModelName(String(config.transcribe.options['faster-whisper']?.model ?? 'large-v3-turbo')) });
console.log(table(checks));
console.log('\n' + await providerReport(config));
// outside media sources are optional: what they say never fails the doctor
try { console.log('\n' + await sourcesReport(openSources())); } catch (e) { console.log(`\n外部素材來源：${(e as Error).message}`); }
if (checks.some((c) => !c.ok)) process.exit(1);
