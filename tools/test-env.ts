// The environment every test run gets (vitest globalSetup, like tools/test-cleanup.ts: the workers and every program the tests
// start inherit it). The tests that really transcribe (media-node extras, the server's media-extras, the editor's ingest e2e)
// use the small speech model TEST_WHISPER_MODEL: each of them loading large-v3-turbo at once ran a machine short of memory in a
// full run (faster-whisper's mkl_malloc failed, and the job with it). A TELLCUT_WHISPER_MODEL set already is kept.
import { TEST_WHISPER_MODEL } from './setup/checks.ts';

export default function setup() {
  if (process.env.TELLCUT_WHISPER_MODEL !== undefined) return;
  process.env.TELLCUT_WHISPER_MODEL = TEST_WHISPER_MODEL;
  return () => { delete process.env.TELLCUT_WHISPER_MODEL; };
}
