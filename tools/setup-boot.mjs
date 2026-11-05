// npm run setup, step 0, in plain Node: nothing is installed yet (not even tsx), so this checks Node, runs npm ci when the
// packages are missing or older than package-lock.json, then hands over to tools/setup.ts (spec 2026-10-17-studio-handover §7).
// It prints in English, like tools/setup.ts.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const major = Number(process.versions.node.split('.')[0]);
if (major < 24) {
  console.error(`✗ Tellcut needs Node.js 24 or later (this is v${process.versions.node}): install it from https://nodejs.org/ and run this again.`);
  process.exit(1);
}
if (process.platform !== 'win32' && process.platform !== 'darwin') console.warn(`! Tellcut supports Windows and macOS (this is ${process.platform}); the next steps may fail.`);

const run = (cmd, args, hint = '') => {
  // one command line (shell: npm and npx are .cmd files); arguments with spaces are quoted
  const line = [cmd, ...args.map((a) => (/[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a))].join(' ');
  const r = spawnSync(line, { cwd: root, stdio: 'inherit', shell: true });
  if (r.status !== 0) { if (hint) console.error(hint); process.exit(r.status ?? 1); }
};

// npm ci again when package-lock.json differs from the one installed last (by content: a copied folder's file times say nothing)
const lock = join(root, 'package-lock.json'), stamp = join(root, 'node_modules', '.tellcut-lock-sha256');
const lockHash = createHash('sha256').update(readFileSync(lock)).digest('hex');
if (!existsSync(stamp) || readFileSync(stamp, 'utf8').trim() !== lockHash) {
  console.log('▶ Installing the npm packages (npm ci)');
  // a running Tellcut (npm run server) holds files in node_modules open: npm ci cannot replace them
  run('npm', ['ci'], '✗ npm ci failed. If it says above that a file is in use (EPERM / EBUSY), stop the running npm run server (Ctrl+C) and run npm run setup again.');
  writeFileSync(stamp, lockHash);
} else console.log('▶ npm packages: already there');
run('npx', ['tsx', 'tools/setup.ts', ...process.argv.slice(2)]);
