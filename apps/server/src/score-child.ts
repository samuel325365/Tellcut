// Composes one gallery music preview in a process of its own (review 2, A8): on the server's thread a style took up to 2 s and every
// other request waited. Run by gallery.ts as `node --import tsx score-child.ts <json>`; writes the wav, or prints why it could not.
import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { encodeWav16, generateScore, loadStyles } from '@tellcut/media-node';

const a = JSON.parse(process.argv[2]) as { style: string; library: string; seed: number; bpm?: number; key?: string; file: string };
// written beside it and renamed into place: the server serves any file at that name from then on, so one killed halfway (the
// server stopped mid-request) must never leave half a wav there
const tmp = `${a.file}.${process.pid}.tmp`;
try {
  const lib = await loadStyles([a.library]);
  const s = generateScore({ style: a.style, styles: lib.styles, length: 12, seed: a.seed, bpm: a.bpm, key: a.key });
  mkdirSync(dirname(a.file), { recursive: true });
  writeFileSync(tmp, encodeWav16(s.L, s.R, s.info.sampleRate));
  renameSync(tmp, a.file);
} catch (e) {
  rmSync(tmp, { force: true });
  process.stderr.write((e as Error).message);
  process.exit(2);
}
