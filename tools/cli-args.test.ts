// What the command lines take is checked before anything is made: their flags (tools/args.ts) and their numbers (npm run new, render, tellcut frames).
import { secsList } from '@tellcut/plugin-common/speech';
import { newArgs } from './new.ts';
import { renderArgs } from './render.ts';

test('new: --size is WxH (any case) and --fps a whole number, else it is refused before any footage is copied', () => {
  expect(newArgs(['trip', 'D:/a', '--size', '1080X1920', '--fps', '25'])).toMatchObject({ id: 'trip', inputs: ['D:/a'], size: [1080, 1920], fps: 25 });
  expect(newArgs(['x', '--blank', '--name', '片名'])).toMatchObject({ blank: true, name: '片名', size: undefined, fps: undefined });
  for (const bad of [['--size', '1920x'], ['--size', '1920*1080'], ['--size', '0x1080'], ['--fps', 'abc'], ['--fps', '29.97'], ['--fps', '0']])
    expect(() => newArgs(['x', 'a', ...bad]), bad.join(' ')).toThrow(bad[0]);
  expect(() => newArgs(['x', 'a', '--fps'])).toThrow('--fps 後面要有值');
  expect(() => newArgs(['x', 'a', '--size', '--force'])).toThrow('--size 後面要有值');
  expect(() => newArgs(['x'])).toThrow('用法');
});

test('render and frames: times are seconds or m:ss; anything else is refused naming the flag', () => {
  const get = (o: Record<string, string>) => (k: string) => o[k];
  expect(renderArgs(get({ '--stills': '1.5,1:02', '--from': '0', '--to': '0:10' }))).toEqual({ stills: [1.5, 62], from: 0, to: 10 });
  expect(renderArgs(get({}))).toEqual({ stills: undefined, from: undefined, to: undefined });
  expect(() => renderArgs(get({ '--stills': 'a' }))).toThrow('--stills 的時間「a」看不懂');
  expect(() => renderArgs(get({ '--from': 'abc' }))).toThrow('--from 的時間「abc」看不懂');
  expect(secsList('1:23,4', '--at')).toEqual([83, 4]);
  expect(() => secsList('1.5,', '--at')).toThrow('--at 的時間「」看不懂');
});

test('new: a flag it does not take is refused, not read as taking the next word', () => {
  expect(() => newArgs(['x', 'a', '--sise', '1080x1920'])).toThrow('沒有 --sise 這個選項');
  expect(newArgs(['x', '--force', 'a'])).toMatchObject({ id: 'x', inputs: ['a'], force: true });   // a switch takes no word
  expect(newArgs(['x', 'a', '--size=1080x1920'])).toMatchObject({ size: [1080, 1920] });
});

// every command line reads its flags through tools/args.ts: a mistyped one stops the script before it does anything. These are the
// ones whose reading runs at their top level (new, voice, score, tellcut, library, assets and batch:render are tested through their
// functions); the scripts that would install, download, write shared files or restart the server are left out (setup, examples,
// brand-assets, thumbs, golden, server:restart)
test('each command line refuses a flag it does not take, naming it, with exit code 2', async () => {
  const { spawn } = await import('node:child_process');
  const { join } = await import('node:path');
  const { TELLCUT_ROOT } = await import('@tellcut/media-node');
  const cli = join(TELLCUT_ROOT, 'node_modules/tsx/dist/cli.mjs');
  const runs: string[][] = [['cut.ts'], ['check.ts'], ['inspect.ts'], ['render.ts'], ['prepare.ts'], ['promote.ts'], ['promote-style.ts'],
    ['export-project.ts'], ['tokens.ts'], ['blocks-index.ts'], ['providers.ts'], ['sources.ts'], ['doctor.ts'], ['fonts.ts']];
  const run = (args: string[]) => new Promise<{ code: number | null; err: string }>((res) => {
    const c = spawn(process.execPath, [cli, join('tools', args[0]), ...args.slice(1), 'some-project', '--bogus-flag', 'x'], { cwd: TELLCUT_ROOT, stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    c.stderr.on('data', (d) => (err += d));
    c.on('close', (code) => res({ code, err }));
  });
  const out: Array<{ code: number | null; err: string }> = [];
  for (let i = 0; i < runs.length; i += 7) out.push(...await Promise.all(runs.slice(i, i + 7).map(run)));
  runs.forEach((r, i) => {
    expect(out[i].err, r.join(' ')).toContain('沒有 --bogus-flag 這個選項');
    expect(out[i].code, r.join(' ')).toBe(2);
  });
}, 120_000);

test('voice, score and library refuse a mistyped flag before reading the project', async () => {
  const { main: voice } = await import('./voice.ts');
  const { main: score } = await import('./score.ts');
  const { libraryCommand } = await import('./library.ts');
  // --forse once took s01 as its value: no scene named, every changed scene made again
  await expect(voice(['nope', '--forse', 's01'], () => {})).rejects.toThrow('沒有 --forse 這個選項（可以用：--engine、--force）');
  await expect(voice(['nope', '--engine'], () => {})).rejects.toThrow('--engine 後面要有值');
  await expect(score(['nope', '--styel', 'lofi'])).rejects.toThrow('沒有 --styel 這個選項');
  await expect(libraryCommand(['use', 'nope', '--styel', 'x'], { thumb: false })).rejects.toThrow('沒有 --styel 這個選項');
  // library's --style takes no value: the slug after it is a word
  await expect(libraryCommand(['use', 'nope', '--style', 'x'], { thumb: false })).rejects.toThrow(/nope/);
});
