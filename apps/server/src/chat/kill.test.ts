import { spawn } from 'node:child_process';
import { killTree } from './runner.ts';

test("killTree leaves a child that has already exited alone: its pid may belong to another process by now (a vitest worker died to a taskkill /T)", async () => {
  const child = spawn(process.execPath, ['-e', '0'], { windowsHide: true });
  await new Promise((r) => child.on('exit', r));
  const calls: string[][] = [];
  killTree(child, ((cmd: string, args: string[]) => { calls.push([cmd, ...args]); return { on: () => undefined }; }) as any);
  expect(calls).toEqual([]);
});

test('killTree ends a child that is still running', async () => {
  const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 20000)'], { windowsHide: true });
  const gone = new Promise((r) => child.on('exit', r));
  killTree(child);
  await gone;
  expect(child.exitCode !== null || child.signalCode !== null).toBe(true);
}, 15000);
