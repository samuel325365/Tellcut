import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { OWNER_TTL_MS, OWNERLESS_MS, holders, keepSlot, releaseSlot, takeSlot } from './queue.ts';
import { parseLoudness } from '@tellcut/media-node';
import { npmCommand, parseArgs as renderArgs, PASSED } from './render.ts';
import { RENDER_FLAGS } from '../render.ts';

const past = (f: string, ms: number) => { const t = new Date(Date.now() - ms); utimesSync(f, t, t); };

test('render slots: two can be held at once, a third waits, a freed slot is taken again', () => {
  const dir = mkdtempSync(join(tmpdir(), 'batch-')), alive = () => true;
  const a = takeSlot(dir, 2, 'a', 101, alive), b = takeSlot(dir, 2, 'b', 102, alive);
  expect([a, b].every(Boolean)).toBe(true);
  expect(takeSlot(dir, 2, 'c', 103, alive)).toBeNull();
  expect(holders(dir, 2)).toEqual(['101 a', '102 b']);
  releaseSlot(a!, 999);   // not ours: kept
  expect(takeSlot(dir, 2, 'c', 103, alive)).toBeNull();
  releaseSlot(a!, 101);
  expect(takeSlot(dir, 2, 'c', 103, alive)).toBe(a);
});

test('a slot whose process is gone is taken over', () => {
  const dir = mkdtempSync(join(tmpdir(), 'batch-'));
  const s = takeSlot(dir, 1, 'old', 201, () => true)!;
  expect(takeSlot(dir, 1, 'new', 202, (pid) => pid !== 201)).toBe(s);
  expect(readFileSync(join(s, 'owner'), 'utf8')).toBe('202 new');
  expect(existsSync(s)).toBe(true);
});

test('a slot whose owner stopped its heartbeat is taken over even if its pid is alive (reused)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'batch-')), alive = () => true;
  const s = takeSlot(dir, 1, 'old', 301, alive)!;
  past(join(s, 'owner'), OWNER_TTL_MS - 60_000);
  keepSlot(s);   // the heartbeat keeps it
  expect(takeSlot(dir, 1, 'new', 302, alive)).toBeNull();
  past(join(s, 'owner'), OWNER_TTL_MS + 60_000);
  expect(takeSlot(dir, 1, 'new', 302, alive)).toBe(s);
  expect(holders(dir, 1)).toEqual(['302 new']);
});

test('a slot without an owner file is held for a few seconds, then taken over', () => {
  const dir = mkdtempSync(join(tmpdir(), 'batch-')), slot = join(dir, 'slot0');
  mkdirSync(slot);   // a process died between mkdir and writing its owner — or is just writing it
  expect(takeSlot(dir, 1, 'x', 401, () => true)).toBeNull();
  past(slot, 60_000);
  expect(takeSlot(dir, 1, 'x', 401, () => true)).toBe(slot);
  expect(holders(dir, 1)).toEqual(['401 x']);
});

// macOS / Linux take a stale slot over through a gate folder (slotN.takeover); driven here on any machine
test('the macOS takeover: a slot whose holder is gone is taken through the gate, which is gone again afterwards', () => {
  const dir = mkdtempSync(join(tmpdir(), 'batch-'));
  const s = takeSlot(dir, 1, 'old', 501, () => true, 'darwin')!;
  // the holder lives: held, and no gate is made for it
  expect(takeSlot(dir, 1, 'new', 502, () => true, 'darwin')).toBeNull();
  expect(existsSync(`${s}.takeover`)).toBe(false);
  // the holder is gone
  expect(takeSlot(dir, 1, 'new', 502, (pid) => pid !== 501, 'darwin')).toBe(s);
  expect(holders(dir, 1)).toEqual(['502 new']);
  expect(existsSync(`${s}.takeover`)).toBe(false);
  // a holder whose heartbeat stopped counts as gone too, even with its pid alive (reused)
  past(join(s, 'owner'), OWNER_TTL_MS + 60_000);
  expect(takeSlot(dir, 1, 'newer', 503, () => true, 'darwin')).toBe(s);
  expect(holders(dir, 1)).toEqual(['503 newer']);
});

test('the macOS takeover waits while another process holds the gate, and clears a gate a crashed process left', () => {
  const dir = mkdtempSync(join(tmpdir(), 'batch-'));
  const s = takeSlot(dir, 1, 'old', 601, () => true, 'darwin')!, gate = `${s}.takeover`, dead = (pid: number) => pid !== 601;
  mkdirSync(gate);   // another process is taking it over right now
  expect(takeSlot(dir, 1, 'new', 602, dead, 'darwin')).toBeNull();
  expect(holders(dir, 1)).toEqual(['601 old']);   // judged by the gate's holder, not removed under it
  past(gate, OWNERLESS_MS + 5_000);   // that process died inside the gate
  expect(takeSlot(dir, 1, 'new', 602, dead, 'darwin')).toBe(s);
  expect(holders(dir, 1)).toEqual(['602 new']);
  expect(existsSync(gate)).toBe(false);
});

test('several processes taking over the same stale slot at once: exactly one gets it', async () => {
  const queue = pathToFileURL(fileURLToPath(new URL('./queue.ts', import.meta.url))).href;
  // the last rounds race the macOS way (through the gate folder), on any machine
  for (const platform of [process.platform, process.platform, process.platform, 'darwin', 'darwin']) {
    const dir = mkdtempSync(join(tmpdir(), 'batch-')), worker = join(dir, 'w.mts');
    mkdirSync(join(dir, 'slot0')); writeFileSync(join(dir, 'slot0', 'owner'), '4242 dead');
    // Node 24 strips the types of queue.ts itself; all workers spin until the same moment, then race
    writeFileSync(worker, `import { takeSlot } from ${JSON.stringify(queue)};\nconst go = +process.argv[2]; while (Date.now() < go) {}\n`
      + `process.stdout.write(takeSlot(${JSON.stringify(dir)}, 1, 'w', process.pid, (p) => p !== 4242, process.argv[3]) ? 'got' : 'no');\n`);
    const go = Date.now() + 1500;
    const outs = await Promise.all(Array.from({ length: 8 }, () => new Promise<string>((res) => {
      const c = spawn(process.execPath, ['--no-warnings', worker, String(go), platform]); let s = '';
      c.stdout.on('data', (d) => (s += d)); c.stderr.on('data', (d) => (s += d)); c.on('close', () => res(s));
    })));
    expect(outs.filter((o) => o !== 'got' && o !== 'no')).toEqual([]);
    expect(outs.filter((o) => o === 'got')).toHaveLength(1);
  }
}, 30_000);

test('batch:render args: id and --slots in any order, the rest goes to render, values are quoted', () => {
  expect(renderArgs(['--slots', '3', 'food'])).toEqual({ id: 'food', slots: 3, extra: [] });
  expect(renderArgs(['food'])).toEqual({ id: 'food', slots: 2, extra: [] });
  expect(renderArgs(['food', '--stills', '1.5,3', '--slots', '1'])).toEqual({ id: 'food', slots: 1, extra: ['--stills', '1.5,3'] });
  // a --slots that is no whole number from 1 up is refused, not read as 2 (--slots 0 once queued two at a time)
  for (const bad of ['x', '0', '-1', '1.5', '']) expect(() => renderArgs(['food', '--slots', bad]), bad).toThrow('--slots 要是 1 以上的整數');
  expect(renderArgs(['--from', '2', 'food', '--to', '5'])).toEqual({ id: 'food', slots: 2, extra: ['--from', '2', '--to', '5'] });
  expect(renderArgs(['food', '--from=2'])).toEqual({ id: 'food', slots: 2, extra: ['--from', '2'] });
  expect(renderArgs([])).toBeNull();
  expect(renderArgs(['food', 'extra'])).toBeNull();
  // a flag render does not take is refused before a slot is waited for, not passed on to fail there (or be read as the id)
  expect(() => renderArgs(['food', '--stils', '1.5'])).toThrow('沒有 --stils 這個選項');
  expect(() => renderArgs(['food', '--project', 'other'])).toThrow('沒有 --project 這個選項');
  expect(() => renderArgs(['food', '--stills'])).toThrow('--stills 後面要有值');
  // the options passed on are render's own, but --project (ours to give)
  expect(PASSED).toEqual(Object.keys(RENDER_FLAGS).filter((f) => f !== '--project'));
  expect(npmCommand(['render', '--', '--project', 'my x', '--stills', '1.5,3'], 'win32')).toBe('npm run -s "render" "--" "--project" "my x" "--stills" "1.5,3"');
  expect(npmCommand(['render', '--', '--project', 'my x', '--stills', '1.5,3'], 'darwin')).toBe(`npm run -s 'render' '--' '--project' 'my x' '--stills' '1.5,3'`);
  // sh's single quotes take $, ` and \ as they are; on Windows a trailing \ is doubled so it does not escape the closing quote
  expect(npmCommand(['render', '--', '--project', '$HOME`id`dir\\'], 'darwin')).toBe(`npm run -s 'render' '--' '--project' '$HOME\`id\`dir\\'`);
  expect(npmCommand(['render', '--', '--project', 'dir\\'], 'win32')).toBe('npm run -s "render" "--" "--project" "dir\\\\"');
  // cmd.exe takes no \" escape and expands %VAR% even inside quotes: such an argument is refused (on every platform), not passed on half-quoted
  for (const platform of ['win32', 'darwin'] as const) {
    for (const bad of ['my "x"', '%PATH%', 'a&b', 'a|b', 'a<b', 'a>b', 'a^b', 'a\nb', 'a\rb'])
      expect(() => npmCommand(['render', '--', '--project', bad], platform), `${platform} ${JSON.stringify(bad)}`).toThrow('不能有');
  }
});

test('loudness comes from the Summary block, not the running value on the first lines', () => {
  const log = '[Parsed_ebur128_0] t: 0.1 M: -120.7 S: -120.7 I: -70.0 LUFS LRA: 0.0 LU\n'
    + '[Parsed_ebur128_0] Summary:\n\n  Integrated loudness:\n    I:         -14.1 LUFS\n    Threshold: -24.4 LUFS\n\n  True peak:\n    Peak:       -1.5 dBFS\n';
  expect(parseLoudness(log)).toEqual({ lufs: -14.1, peak: -1.5 });
  expect(parseLoudness('no summary')).toBeNull();
});
