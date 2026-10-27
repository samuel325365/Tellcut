import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { OWNER_TTL_MS, holders, isAlive, keepSlot, releaseSlot, takeSlot } from './queue.ts';
import { parseLoudness } from '@tellcut/media-node';
import { commonRefs, cutPoints, parseArgs as qcArgs } from './qc.ts';
import { npmCommand, parseArgs as renderArgs } from './render.ts';

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

test('isAlive: EPERM (a live process with more rights) is alive, ESRCH is gone', () => {
  const err = (code: string) => () => { throw Object.assign(new Error(code), { code }); };
  const kill = vi.spyOn(process, 'kill');
  try {
    kill.mockImplementation(err('EPERM')); expect(isAlive(4)).toBe(true);
    kill.mockImplementation(err('ESRCH')); expect(isAlive(4)).toBe(false);
  } finally { kill.mockRestore(); }
  expect(isAlive(process.pid)).toBe(true);
});

test('several processes taking over the same stale slot at once: exactly one gets it', async () => {
  const queue = pathToFileURL(fileURLToPath(new URL('./queue.ts', import.meta.url))).href;
  for (let round = 0; round < 3; round++) {
    const dir = mkdtempSync(join(tmpdir(), 'batch-')), worker = join(dir, 'w.mts');
    mkdirSync(join(dir, 'slot0')); writeFileSync(join(dir, 'slot0', 'owner'), '4242 dead');
    // Node 24 strips the types of queue.ts itself; all workers spin until the same moment, then race
    writeFileSync(worker, `import { takeSlot } from ${JSON.stringify(queue)};\nconst go = +process.argv[2]; while (Date.now() < go) {}\n`
      + `process.stdout.write(takeSlot(${JSON.stringify(dir)}, 1, 'w', process.pid, (p) => p !== 4242) ? 'got' : 'no');\n`);
    const go = Date.now() + 1500;
    const outs = await Promise.all(Array.from({ length: 8 }, () => new Promise<string>((res) => {
      const c = spawn(process.execPath, ['--no-warnings', worker, String(go)]); let s = '';
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
  expect(renderArgs(['food', '--slots', 'x'])!.slots).toBe(2);
  expect(renderArgs(['--from', '2', 'food', '--to', '5'])).toEqual({ id: 'food', slots: 2, extra: ['--from', '2', '--to', '5'] });
  expect(renderArgs([])).toBeNull();
  expect(renderArgs(['food', 'extra'])).toBeNull();
  expect(npmCommand(['render', '--', '--project', 'my x', '--stills', '1.5,3'])).toBe('npm run -s "render" "--" "--project" "my x" "--stills" "1.5,3"');
  // cmd.exe takes no \" escape and expands %VAR% even inside quotes: such an argument is refused, not passed on half-quoted
  for (const bad of ['my "x"', '%PATH%', 'a&b', 'a|b', 'a<b', 'a>b', 'a^b', 'a\nb'])
    expect(() => npmCommand(['render', '--', '--project', bad]), JSON.stringify(bad)).toThrow('不能有');
});

test('batch:qc args: --file needs a value and is relative to where the command was typed', () => {
  const cwd = resolve('/somewhere');
  expect(qcArgs(['food'], cwd)).toEqual({ id: 'food' });
  expect(qcArgs(['--file', 'out/a.mp4', 'food'], cwd)).toEqual({ id: 'food', file: join(cwd, 'out', 'a.mp4') });
  expect(qcArgs(['food', '--file'], cwd)).toBeNull();
  expect(qcArgs(['food', '--file', '--x'], cwd)).toBeNull();
  expect(qcArgs(['--file', 'a.mp4'], cwd)).toBeNull();
});

test('cut points: both edges of every video clip inside the film, close edges merged, overlays ignored', () => {
  const p = { tracks: [
    { kind: 'video', items: [{ id: 'a', start: 0, end: 2, source: 'a' }, { id: 'b', start: 2, end: 4.2, source: 'b' }, { id: 'c', start: 4.4, end: 10, source: 'c' }] },
    { kind: 'video', items: [{ id: 'd', start: 3, end: 5, source: 'd' }] },
    { kind: 'overlay', items: [{ id: 'o', start: 1, end: 6 }] },
  ] };
  expect(cutPoints(p, 10)).toEqual([2, 3, 4.2, 5]);
});

test('cut points: a chain of close edges is merged against the last kept one; parent times are resolved', () => {
  const chain = { tracks: [{ kind: 'video', items: [1, 1.3, 1.6, 1.9].map((t, i) => ({ id: `v${i}`, start: t, end: 10, source: 's' })) }] };
  expect(cutPoints(chain, 10)).toEqual([1, 1.6]);
  const nested = { tracks: [
    { kind: 'overlay', items: [{ id: 'g', start: 3, end: 8 }] },
    { kind: 'video', items: [{ id: 'v', parent: 'g', start: 1, end: 2, source: 's' }] },
  ] };
  expect(cutPoints(nested, 10)).toEqual([4, 5]);
});

test('loudness comes from the Summary block, not the running value on the first lines', () => {
  const log = '[Parsed_ebur128_0] t: 0.1 M: -120.7 S: -120.7 I: -70.0 LUFS LRA: 0.0 LU\n'
    + '[Parsed_ebur128_0] Summary:\n\n  Integrated loudness:\n    I:         -14.1 LUFS\n    Threshold: -24.4 LUFS\n\n  True peak:\n    Peak:       -1.5 dBFS\n';
  expect(parseLoudness(log)).toEqual({ lufs: -14.1, peak: -1.5 });
  expect(parseLoudness('no summary')).toBeNull();
});

test('common blocks: items whose type is common.* are counted, mentions in params are not', () => {
  const dir = mkdtempSync(join(tmpdir(), 'batch-')), f = join(dir, 'p.json');
  writeFileSync(f, JSON.stringify({ tracks: [{ items: [{ type: 'common.caption' }, { type: 'common.caption' }, { type: 'fx.receipt' }, { type: 'core.clip', params: { note: 'common.x' } }] }] }));
  expect(commonRefs(readFileSync(f, 'utf8'))).toBe(2);
});
