// The block index of guides/workflow.md (what the page chat and the batch subagents read): the shared blocks by category
// (names only, from ItemType.category) between the block-index marks; details are looked up with `catalog --find` /
// `catalog <type>`. Run this after adding or promoting a block; a test fails while the index is stale.   npm run blocks:index [-- --check]
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { TELLCUT_ROOT } from '@tellcut/media-node';
import { plugins } from '@tellcut/plugins';
import { formatIndex } from './catalog.ts';

export const GUIDE_FILE = join(TELLCUT_ROOT, 'guides/workflow.md');
const START = '<!-- block-index: npm run blocks:index writes this list -->', END = '<!-- /block-index -->';

/** the prompt with its index replaced by the current one; throws when the marks are missing */
export function withIndex(prompt: string, index = formatIndex(plugins)): string {
  const a = prompt.indexOf(START), b = prompt.indexOf(END);
  if (a < 0 || b < a) throw new Error(`guides/workflow.md 裡找不到積木索引的標記（${START} … ${END}）`);
  return `${prompt.slice(0, a + START.length)}\n${index}\n${prompt.slice(b)}`;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const now = readFileSync(GUIDE_FILE, 'utf8'), next = withIndex(now);
  if (process.argv.includes('--check')) {
    if (now !== next) { console.error('guides/workflow.md 的積木索引過期了：執行 npm run blocks:index'); process.exit(1); }
    console.log('積木索引是最新的');
  } else if (now === next) console.log('積木索引已經是最新的');
  else { writeFileSync(GUIDE_FILE, next); console.log('已更新 guides/workflow.md 的積木索引'); }
}
