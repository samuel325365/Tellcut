// npm run setup (spec 2026-10-17-studio-handover §7): everything Tellcut needs on a new PC, inside tellcut/. Safe to run again:
// what is there already is kept. tools/setup-boot.mjs has run npm ci before this (tsx comes with it).
//   npm run setup                 install, then check everything (one tiny Claude request checks the login)
//   npm run setup -- --no-login   the same without the Claude request
import { spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { FFMPEG, FFPROBE, loadProvidersConfig, locate, PY_PROJECT, runUv, TELLCUT_ROOT, UV, VENDOR_DIR, type ExeSpec } from '@tellcut/media-node';
import { allChecks, checkClaudeLogin, hfCachedWhisper, MODEL_COMPLETE, modelsDir, table, whisperModelDir, whisperModelName } from './setup/checks.ts';
import { ensureModelFile, ensureVendor, readModelList, readVendorList } from './setup/vendor.ts';

const step = (s: string) => console.log(`\n▶ ${s}`);

function npm(args: string[]): Promise<void> {
  return new Promise((res, rej) => {
    const p = spawn(`npm ${args.join(' ')}`, { cwd: TELLCUT_ROOT, stdio: 'inherit', shell: true });
    p.on('error', rej);
    p.on('close', (code) => (code ? rej(new Error(`npm ${args.join(' ')} 失敗（${code}）`)) : res()));
  });
}

/**
 * The speech model as plain files in <models>/whisper/<model>: copied from this user's Hugging Face cache when it is there, else
 * downloaded. Either goes into <model>.partial first and is renamed when whole, so an interrupted run never looks finished.
 */
async function whisperModel(model: string) {
  if (whisperModelDir(model)) return console.log(`  ${model}：已經有了`);
  const dest = join(modelsDir(), 'whisper', model), part = `${dest}.partial`;
  rmSync(part, { recursive: true, force: true });
  mkdirSync(part, { recursive: true });
  const found = hfCachedWhisper(model, process.env.HF_HOME ?? join(homedir(), '.cache', 'huggingface'));
  if (found) {
    console.log(`  ${model}：從這台電腦的快取複製（${found}）`);
    cpSync(found, part, { recursive: true, dereference: true });   // the snapshot's files (links into blobs on some PCs)
  } else {
    console.log(`  ${model}：下載（約 1.6 GB，第一次要一陣子）`);
    await runUv(['run', '--project', PY_PROJECT, '--quiet', 'python', '-c', `from faster_whisper import download_model; download_model(${JSON.stringify(model)}, output_dir=${JSON.stringify(part)})`]);
  }
  if (!existsSync(join(part, 'model.bin'))) throw new Error(`${model} 的模型不完整（沒有 model.bin）：再跑一次 npm run setup`);
  writeFileSync(join(part, MODEL_COMPLETE), new Date().toISOString());
  rmSync(dest, { recursive: true, force: true });   // an older, unfinished copy
  renameSync(part, dest);
}

/** which programs each vendor download provides (an item the user points elsewhere with its variable is not downloaded) */
const PROVIDES: Record<string, ExeSpec[]> = { uv: [UV], ffmpeg: [FFMPEG, FFPROBE] };

async function vendorItems() {
  mkdirSync(VENDOR_DIR, { recursive: true });
  for (const [name, item] of Object.entries(readVendorList())) {
    const specs = PROVIDES[name] ?? [];
    if (specs.length && specs.every((s) => process.env[s.env])) { console.log(`  ${name}：用 ${specs.map((s) => `${s.env}=${process.env[s.env]}`).join('、')}`); continue; }
    try {
      const r = await ensureVendor(name, item, VENDOR_DIR, { log: (s) => console.log(`  ${s}`) });
      console.log(`  ${name} ${item.version}：${r === 'kept' ? '已經有了' : '裝好了'}`);
    } catch (e) {
      // a blocked download is fine when the program is on this PC already (PATH or an install folder); the checks judge its version
      const elsewhere = specs.length ? specs.map((s) => locate(s)) : [];
      if (elsewhere.length && elsewhere.every(Boolean)) { console.warn(`  ! ${name} 下載失敗（${(e as Error).message}），改用這台電腦上的 ${elsewhere.map((f) => f!.path).join('、')}`); continue; }
      throw new Error(`${(e as Error).message}\n  網路要經過 proxy 的話：設定 HTTPS_PROXY 與 NODE_USE_ENV_PROXY=1 再跑一次；或自己裝好 ${name}，用 ${specs.map((s) => s.env).join('、')} 指過去（見 INSTALL.md）`);
    }
  }
}

async function main() {
  const login = !process.argv.includes('--no-login');
  const config = loadProvidersConfig(), model = whisperModelName(String(config.transcribe.options['faster-whisper']?.model ?? 'large-v3-turbo'));

  step('下載 uv 與 ffmpeg 到 tellcut/vendor');
  await vendorItems();

  step('Python 環境（Python 3.12 與套件都裝在 tellcut 裡）');
  console.log((await runUv(['sync', '--project', PY_PROJECT])).trim() || '  好了');

  step('語音辨識模型');
  await whisperModel(model);

  step('其他模型（人臉偵測）');
  for (const [name, item] of Object.entries(readModelList())) {
    const r = await ensureModelFile(name, item, modelsDir());
    console.log(`  ${name}：${r === 'kept' ? '已經有了' : '裝好了'}`);
  }

  step('字型');
  // offline or behind a proxy a font may not come: the builds do not need it, and the checks below say so
  await npm(['run', 'fonts']).catch((e: Error) => console.warn(`  ! 字型沒有全部下載（${e.message}）：先繼續，之後再跑 npm run fonts`));

  step('建置播放器與編輯器');
  await npm(['run', 'build:player']);
  await npm(['run', 'build:editor']);

  step('檢查');
  const checks = await allChecks({ whisperModel: model });
  if (login && checks.every((c) => c.name !== 'Claude Code（claude）' || c.ok)) checks.push(await checkClaudeLogin());
  console.log('\n' + table(checks));
  if (checks.some((c) => !c.ok)) process.exit(1);
}

main().catch((e) => { console.error(`\n✗ ${(e as Error).message}`); process.exit(1); });
