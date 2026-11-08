// Each common block's sample moments: what `npm run golden` draws and compares with its saved picture (packages/plugin-common/golden/),
// and, the first of a block's samples at its last moment, the gallery's thumbnail of it (the server's gallery, `npm run thumbs`). A new
// block adds its samples here (golden.test.ts refuses a block without one; `npm run promote` appends one). Regenerate its picture with
// `npm run golden -- --update <name>` after a change you meant.
// The samples themselves are in samples/, in parts kept in order (the golden pictures and the gallery's first-sample thumbnails
// go by it): fixtures.ts holds the shared pieces; a new sample goes at the end of the list below.
import { BASICS } from './samples/basics.ts';
import { KITS } from './samples/kits.ts';
import { GROUPS } from './samples/groups.ts';
import { STYLES } from './samples/styles.ts';
import type { Sample } from './samples/fixtures.ts';

export type { Sample } from './samples/fixtures.ts';
export { CAP_EN, CAP_JA, HEAD_EN, HEAD_JA } from './samples/fixtures.ts';

export const samples: Sample[] = [
  ...BASICS,
  ...KITS,
  ...GROUPS,
  ...STYLES,
];
