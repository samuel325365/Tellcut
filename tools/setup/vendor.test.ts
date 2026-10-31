import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ensureModelFile, ensureVendor, installedVersion, systemTar, VendorInUse, type VendorItem } from './vendor.ts';

/** a zip holding tool-1.0/bin/tool.exe, made with the same Windows tar setup uses */
function makeZip() {
  const d = mkdtempSync(join(tmpdir(), 'vz-'));
  mkdirSync(join(d, 'tool-1.0', 'bin'), { recursive: true });
  writeFileSync(join(d, 'tool-1.0', 'bin', 'tool.exe'), 'not really a program');
  execFileSync(systemTar(), ['-a', '-cf', join(d, 'tool.zip'), '-C', d, 'tool-1.0']);
  return readFileSync(join(d, 'tool.zip'));
}

test('a download whose hash matches is unpacked into vendor/<dest> once; the same version is kept after that', async () => {
  const zip = makeZip(), vendor = mkdtempSync(join(tmpdir(), 'vendor-'));
  const item: VendorItem = { version: '1.0', url: 'https://x/tool.zip', sha256: createHash('sha256').update(zip).digest('hex'), dest: 'tool', check: 'bin/tool.exe', strip: 'tool-1.0' };
  let fetched = 0;
  const fakeFetch = (async () => { fetched++; return new Response(zip); }) as unknown as typeof fetch;
  expect(await ensureVendor('tool', item, vendor, { fetch: fakeFetch })).toBe('installed');
  expect(readFileSync(join(vendor, 'tool', 'bin', 'tool.exe'), 'utf8')).toBe('not really a program');
  expect(installedVersion(vendor, item)).toBe('1.0');
  expect(await ensureVendor('tool', item, vendor, { fetch: fakeFetch })).toBe('kept');
  expect(fetched).toBe(1);
  expect(await ensureVendor('tool', { ...item, version: '1.1' }, vendor, { fetch: fakeFetch })).toBe('installed');   // a newer pin replaces it
  expect(fetched).toBe(2);
});

test('an upgrade is unpacked beside the old version and swapped in by renaming; nothing is left over', async () => {
  const zip = makeZip(), vendor = mkdtempSync(join(tmpdir(), 'vendor-'));
  const item: VendorItem = { version: '1.0', url: 'https://x/tool.zip', sha256: createHash('sha256').update(zip).digest('hex'), dest: 'tool', check: 'bin/tool.exe', strip: 'tool-1.0' };
  const fetch = (async () => new Response(zip)) as unknown as typeof globalThis.fetch;
  await ensureVendor('tool', item, vendor, { fetch });
  writeFileSync(join(vendor, 'tool', 'old-only.txt'), 'from 1.0');
  const renames: Array<[string, string]> = [];
  const rename = (a: string, b: string) => { renames.push([a, b]); renameSync(a, b); };
  expect(await ensureVendor('tool', { ...item, version: '1.1' }, vendor, { fetch, rename })).toBe('installed');
  expect(installedVersion(vendor, item)).toBe('1.1');
  expect(existsSync(join(vendor, 'tool', 'old-only.txt'))).toBe(false);
  expect(renames.map(([, b]) => b.slice(vendor.length + 1))).toEqual([expect.stringMatching(/^\.old-tool-\d+$/), 'tool']);
  expect(readdirSync(vendor)).toEqual(['tool']);
});

test('an old version in use (Windows locks a running exe) is kept whole, and the error says so', async () => {
  const zip = makeZip(), vendor = mkdtempSync(join(tmpdir(), 'vendor-'));
  const item: VendorItem = { version: '1.0', url: 'https://x/tool.zip', sha256: createHash('sha256').update(zip).digest('hex'), dest: 'tool', check: 'bin/tool.exe', strip: 'tool-1.0' };
  const fetch = (async () => new Response(zip)) as unknown as typeof globalThis.fetch;
  await ensureVendor('tool', item, vendor, { fetch });
  const locked = (a: string, b: string) => {
    if (a === join(vendor, 'tool')) throw Object.assign(new Error(`EPERM: operation not permitted, rename '${a}' -> '${b}'`), { code: 'EPERM' });
    renameSync(a, b);
  };
  await expect(ensureVendor('tool', { ...item, version: '1.1' }, vendor, { fetch, rename: locked })).rejects.toThrow(VendorInUse);
  await expect(ensureVendor('tool', { ...item, version: '1.1' }, vendor, { fetch, rename: locked })).rejects.toThrow(/正在使用.*npm run setup/s);
  expect(installedVersion(vendor, item)).toBe('1.0');
  expect(readFileSync(join(vendor, 'tool', 'bin', 'tool.exe'), 'utf8')).toBe('not really a program');
  expect(readdirSync(vendor)).toEqual(['tool']);
});

test('a download with the wrong hash, or a failed one, never reaches vendor/', async () => {
  const zip = makeZip(), vendor = mkdtempSync(join(tmpdir(), 'vendor-'));
  const item: VendorItem = { version: '1.0', url: 'https://x/tool.zip', sha256: '0'.repeat(64), dest: 'tool', check: 'bin/tool.exe', strip: 'tool-1.0' };
  await expect(ensureVendor('tool', item, vendor, { fetch: (async () => new Response(zip)) as unknown as typeof fetch })).rejects.toThrow(/SHA-256/);
  await expect(ensureVendor('tool', item, vendor, { fetch: (async () => new Response('gone', { status: 404 })) as unknown as typeof fetch })).rejects.toThrow(/HTTP 404/);
  expect(existsSync(join(vendor, 'tool'))).toBe(false);
  expect(existsSync(join(vendor, '.download-tool'))).toBe(false);
});

test('a model file whose SHA-256 models.json writes in capitals is kept when it is there, and installed when the download matches', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'models-')), bytes = Buffer.from('model weights');
  const sha256 = createHash('sha256').update(bytes).digest('hex').toUpperCase();
  let asked = 0;
  const fetch = (async () => { asked++; return new Response(bytes); }) as unknown as typeof globalThis.fetch;
  expect(await ensureModelFile('m', { url: 'https://example.invalid/m.bin', sha256, dest: 'm.bin' }, dir, { fetch })).toBe('installed');
  expect(await ensureModelFile('m', { url: 'https://example.invalid/m.bin', sha256, dest: 'm.bin' }, dir, { fetch })).toBe('kept');
  expect(asked).toBe(1);
});
