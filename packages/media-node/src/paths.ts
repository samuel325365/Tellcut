// Where Tellcut lives (spec 2026-10-17-studio-handover): tellcut/ is handed over on its own, so every path is inside it.
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** the tellcut/ folder itself */
export const TELLCUT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

/** a project id (= its folder name): letters, digits, _ and -, not starting with _ or - (`_home`, `_gallery`… are not projects) */
export const PROJECT_ID = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
