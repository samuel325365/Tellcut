// The extras' version on its own, so share.ts (which extras.ts and analysis.ts import) reads it without importing either of them.
/** a new value makes every source's sheets and burned-caption check again (extras.version in its analysis folder); the transcript
 *  is made again when its maker changes instead (transcript.by), it is the slow one */
export const EXTRAS_VERSION = 'x1';
