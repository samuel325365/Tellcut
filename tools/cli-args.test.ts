// The numbers the command lines take are checked before anything is made (npm run new, render, tellcut frames).
import { secsList } from './cut/speech.ts';
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
