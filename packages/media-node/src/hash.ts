import { createHash } from 'node:crypto';
import { statSync } from 'node:fs';

export function fileHash(key: string, srcPath: string): string {
  const st = statSync(srcPath);
  return createHash('sha1').update(`${key}|${st.size}|${st.mtimeMs}`).digest('hex').slice(0, 16);
}
