// The environment every test run gets (vitest globalSetup, like tools/test-cleanup.ts: the workers and every program the tests
// start inherit it). The tests that really transcribe (media-node extras, the server's media-extras, the editor's ingest e2e)
// use the small speech model TEST_WHISPER_MODEL: each of them loading large-v3-turbo at once ran a machine short of memory in a
// full run (faster-whisper's mkl_malloc failed, and the job with it). A TELLCUT_WHISPER_MODEL set already is kept.
// The time zone is pinned to TEST_TZ, a TZ set already or not: footage times read from a UTC tag become this machine's local
// time (media-node probe.ts localIso) while a photo's EXIF time has no zone, so tools/cut/inventory.test.ts's day chapters (and
// any test mixing the two) passed only in zones UTC+7:30 to +11:30; a clone in Europe or the Americas got a red test.
// Node reads an IANA name in TZ on every system. On Windows a C runtime (ffmpeg, Python) would read it as a POSIX zone and fall
// back to UTC, but none of the tested programs turns a time into local time there: they read and write UTC or zoneless tags.
import { TEST_WHISPER_MODEL } from './setup/checks.ts';

/** the time zone the tests run in (the maintainer's own: the expected values were written there) */
export const TEST_TZ = 'Asia/Taipei';

export default function setup() {
  const tz = process.env.TZ, model = process.env.TELLCUT_WHISPER_MODEL;
  process.env.TZ = TEST_TZ;
  if (model === undefined) process.env.TELLCUT_WHISPER_MODEL = TEST_WHISPER_MODEL;
  return () => {
    if (tz === undefined) delete process.env.TZ; else process.env.TZ = tz;
    if (model === undefined) delete process.env.TELLCUT_WHISPER_MODEL;
  };
}
