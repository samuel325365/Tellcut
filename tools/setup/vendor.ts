// The programs npm run setup puts in tellcut/vendor (spec 2026-10-17-studio-handover §7): a pinned zip, checked against its
// SHA-256, unpacked with Windows' own tar (bsdtar reads zip). A file whose hash is wrong never reaches vendor/.
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
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

/**
 * Puts `item` in vendorDir/item.dest unless that version is there already. `fetch` is swappable for tests.
 * Returns what happened, for the setup table.
 */
export async function ensureVendor(name: string, item: VendorItem, vendorDir: string, o: { fetch?: typeof fetch; log?: (s: string) => void } = {}): Promise<'kept' | 'installed'> {
  if (installedVersion(vendorDir, item) === item.version) return 'kept';
  const log = o.log ?? (() => {}), get = o.fetch ?? fetch;
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
    const dest = join(vendorDir, item.dest);
    rmSync(dest, { recursive: true, force: true });
    cpSync(from, dest, { recursive: true });
    writeFileSync(join(dest, STAMP), item.version);
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
  if (existsSync(dest) && createHash('sha256').update(readFileSync(dest)).digest('hex') === item.sha256) return 'kept';
  const r = await (o.fetch ?? fetch)(item.url);
  if (!r.ok) throw new Error(`下載 ${name} 失敗：HTTP ${r.status}（${item.url}）`);
  const bytes = Buffer.from(await r.arrayBuffer());
  const sum = createHash('sha256').update(bytes).digest('hex');
  if (sum !== item.sha256) throw new Error(`${name} 的檔案和 models.json 記的不一樣（SHA-256 ${sum}），不使用它`);
  mkdirSync(join(dest, '..'), { recursive: true });
  writeFileSync(`${dest}.partial`, bytes);
  rmSync(dest, { force: true });
  renameSync(`${dest}.partial`, dest);
  return 'installed';
}
