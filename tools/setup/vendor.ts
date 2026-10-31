// The programs npm run setup puts in tellcut/vendor (spec 2026-10-17-studio-handover §7): a pinned zip, checked against its
// SHA-256, unpacked with Windows' own tar (bsdtar reads zip). A file whose hash is wrong never reaches vendor/.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

export interface VendorItem { version: string; url: string; sha256: string; dest: string; check: string; strip?: string }
export type VendorList = Record<string, VendorItem>;

export const readVendorList = (file = join(import.meta.dirname, 'vendor.json')) => JSON.parse(readFileSync(file, 'utf8')) as VendorList;

/** the file that says which version is unpacked in a vendor folder */
const STAMP = '.tellcut-version';
export const installedVersion = (vendorDir: string, item: VendorItem) => {
  const stamp = join(vendorDir, item.dest, STAMP);
  return existsSync(join(vendorDir, item.dest, item.check)) && existsSync(stamp) ? readFileSync(stamp, 'utf8').trim() : null;
};

/** Windows' bsdtar (System32), not a Git Bash GNU tar on PATH, which cannot read zip */
export const systemTar = () => (process.platform === 'win32' ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar');

function untar(zip: string, into: string): Promise<void> {
  return new Promise((res, rej) => {
    const p = spawn(systemTar(), ['-xf', zip, '-C', into], { windowsHide: true });
    let err = '';
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', rej);
    p.on('close', (code) => (code ? rej(new Error(`解壓縮失敗（${code}）：${err.trim().slice(-300)}`)) : res()));
  });
}

/** the old version could not be moved aside, so the new one was not put in; the old one is whole and still works */
export class VendorInUse extends Error {}

/** a folder from an earlier swap whose removal failed (a file in it was still open then) */
const OLD = (dest: string) => `.old-${dest.replace(/[\\/]/g, '-')}-`;

/**
 * Moves the unpacked `from` (in vendorDir, so on the same drive) to `dest` by renaming: the old version is renamed aside first,
 * then removed if it can be. Deleting the old one in place could stop halfway: Windows will not delete an exe that is running
 * (ffmpeg while an export runs), which left vendor half-deleted. Its folder can still be renamed, so the running program keeps
 * its files and the folder is removed by a later setup; where the rename is refused too, it fails whole and the old version
 * is kept as it was.
 */
function swapIn(name: string, from: string, dest: string, vendorDir: string, destName: string, rename: (from: string, to: string) => void) {
  let old: string | null = null;
  if (existsSync(dest)) {
    for (let n = 1; !old || existsSync(old); n++) old = join(vendorDir, `${OLD(destName)}${n}`);
    try { rename(dest, old); } catch (e) {
      const code = (e as NodeJS.ErrnoException).code ?? '';
      const why = /^(EPERM|EBUSY|EACCES)$/.test(code) ? `舊的 vendor/${destName} 正在使用中（${code}），大概有程式正在跑它（Tellcut 的伺服器、匯出或轉錄）` : `舊的 vendor/${destName} 搬不開（${(e as Error).message}）`;
      throw new VendorInUse(`${name} 沒有更新：${why}。舊版本原封不動，照常能用；關掉用到它的程式後再跑一次 npm run setup`);
    }
  }
  try { rename(from, dest); } catch (e) {
    if (old) try { rename(old, dest); } catch { /* the old one stays under its .old name; doctor reports the missing program */ }
    throw e;
  }
  if (old) try { rmSync(old, { recursive: true, force: true, maxRetries: 2 }); } catch { /* removed on the next setup */ }
}

/**
 * Puts `item` in vendorDir/item.dest unless that version is there already. `fetch` (and `rename`) are swappable for tests.
 * Returns what happened, for the setup table.
 */
export async function ensureVendor(name: string, item: VendorItem, vendorDir: string, o: { fetch?: typeof fetch; log?: (s: string) => void; rename?: (from: string, to: string) => void } = {}): Promise<'kept' | 'installed'> {
  if (installedVersion(vendorDir, item) === item.version) return 'kept';
  const log = o.log ?? (() => {}), get = o.fetch ?? fetch;
  // old versions an earlier swap could not remove yet (their files were open then)
  if (existsSync(vendorDir)) for (const f of readdirSync(vendorDir)) if (f.startsWith(OLD(item.dest)) && /^\d+$/.test(f.slice(OLD(item.dest).length))) try { rmSync(join(vendorDir, f), { recursive: true, force: true }); } catch { /* still open */ }
  const work = join(vendorDir, `.download-${name}`);
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  try {
    log(`下載 ${name} ${item.version}：${item.url}`);
    const r = await get(item.url);
    if (!r.ok) throw new Error(`下載 ${name} 失敗：HTTP ${r.status}（${item.url}）`);
    const bytes = Buffer.from(await r.arrayBuffer());
    const sum = createHash('sha256').update(bytes).digest('hex');
    if (sum !== item.sha256.toLowerCase()) throw new Error(`${name} 的檔案和 vendor.json 記的不一樣（SHA-256 ${sum}），不使用它`);
    const zip = join(work, 'download.zip');
    writeFileSync(zip, bytes);
    const out = join(work, 'out');
    mkdirSync(out);
    await untar(zip, out);
    const from = item.strip ? join(out, item.strip) : out;
    if (!existsSync(join(from, item.check))) throw new Error(`${name} 解開後找不到 ${item.check}`);
    writeFileSync(join(from, STAMP), item.version);
    swapIn(name, from, join(vendorDir, item.dest), vendorDir, item.dest, o.rename ?? renameSync);
    return 'installed';
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

/** A single model file in tellcut/models (no unpacking), pinned by its SHA-256 like the programs (tools/setup/models.json). */
export interface ModelFile { url: string; sha256: string; dest: string }
export const readModelList = (file = join(import.meta.dirname, 'models.json')) => JSON.parse(readFileSync(file, 'utf8')) as Record<string, ModelFile>;

export async function ensureModelFile(name: string, item: ModelFile, modelsDir: string, o: { fetch?: typeof fetch } = {}): Promise<'kept' | 'installed'> {
  const dest = join(modelsDir, item.dest);
  const want = item.sha256.toLowerCase();   // digest('hex') is lower case; a hash written in capitals is the same one
  if (existsSync(dest) && createHash('sha256').update(readFileSync(dest)).digest('hex') === want) return 'kept';
  const r = await (o.fetch ?? fetch)(item.url);
  if (!r.ok) throw new Error(`下載 ${name} 失敗：HTTP ${r.status}（${item.url}）`);
  const bytes = Buffer.from(await r.arrayBuffer());
  const sum = createHash('sha256').update(bytes).digest('hex');
  if (sum !== want) throw new Error(`${name} 的檔案和 models.json 記的不一樣（SHA-256 ${sum}），不使用它`);
  mkdirSync(join(dest, '..'), { recursive: true });
  writeFileSync(`${dest}.partial`, bytes);
  rmSync(dest, { force: true });
  renameSync(`${dest}.partial`, dest);
  return 'installed';
}
