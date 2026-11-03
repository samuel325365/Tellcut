// The one way every command line reads its flags (tools/args.ts).
import { parseArgs } from './args.ts';
import { Usage } from './usage.ts';

const SPEC = { '--engine': 'value', '--force': 'switch', '--opt': 'list' } as const;
const err = (argv: string[], usage?: string) => { try { parseArgs(argv, SPEC, usage); } catch (e) { return e as Error; } throw new Error('no error'); };

test('an unknown flag is refused, naming it and the flags there are; nothing is read past it', () => {
  const e = err(['p', '--forse', 's01'], '用法：npm run voice -- …');
  expect(e).toBeInstanceOf(Usage);
  expect(e.message).toBe('沒有 --forse 這個選項（可以用：--engine、--force、--opt）\n用法：npm run voice -- …');
  expect(err(['-f']).message).toContain('沒有 -f 這個選項');   // a one-dash typo is a flag too
  expect(() => parseArgs(['--x'], {})).toThrow('沒有 --x 這個選項（這個指令不接選項）');
  expect(() => parseArgs(['--engine=edge'], {})).toThrow('沒有 --engine 這個選項');
});

test('a value flag without its value: at the end, or followed by another flag', () => {
  expect(err(['p', '--engine']).message).toBe('--engine 後面要有值');
  expect(err(['--engine', '--force']).message).toBe('--engine 後面要有值');
  expect(err(['--opt'], 'U').message).toBe('--opt 後面要有值\nU');
});

test('--flag=value and --flag value read the same; = splits once; a value given twice is refused', () => {
  expect(parseArgs(['--engine=edge'], SPEC).get('--engine')).toBe('edge');
  expect(parseArgs(['--engine', 'edge'], SPEC).get('--engine')).toBe('edge');
  expect(parseArgs(['--opt=k=v'], SPEC).all('--opt')).toEqual(['k=v']);
  expect(parseArgs(['--engine='], SPEC).get('--engine')).toBe('');
  expect(parseArgs(['--engine=--x'], SPEC).get('--engine')).toBe('--x');   // written with =, it is the value
  expect(err(['--engine', 'a', '--engine', 'b']).message).toBe('--engine 只能給一次');
  expect(err(['--force=yes']).message).toBe('--force 後面不接值');
});

test('a switch never swallows the next word; positional words are kept in order wherever the flags stand', () => {
  const a = parseArgs(['p', '--force', 's01', '--engine', 'fake', 's02'], SPEC);
  expect(a.words).toEqual(['p', 's01', 's02']);
  expect(a.has('--force')).toBe(true);
  expect(a.get('--engine')).toBe('fake');
  expect(a.has('--opt')).toBe(false);
  expect(a.get('--opt')).toBeUndefined();
  expect(a.all('--opt')).toEqual([]);
});

test('a list flag repeats, in order; -- ends the flags; - and negative numbers are words', () => {
  const a = parseArgs(['--opt', 'a=1', 'x', '--opt=b=2', '--', '--force', '-h'], SPEC);
  expect(a.all('--opt')).toEqual(['a=1', 'b=2']);
  expect(a.get('--opt')).toBe('b=2');
  expect(a.words).toEqual(['x', '--force', '-h']);
  expect(a.has('--force')).toBe(false);
  expect(parseArgs(['-', '-3', '--engine', '-2'], SPEC)).toMatchObject({ words: ['-', '-3'] });
  expect(parseArgs(['--engine', '-2'], SPEC).num('--engine')).toBe(-2);
});

test('--help / -h answer with the usage alone; num refuses what is not a number', () => {
  expect(err(['--help'], '用法：x').message).toBe('用法：x');
  expect(err(['p', '-h'], '用法：x').message).toBe('用法：x');
  expect(parseArgs(['--engine', '1.5'], SPEC).num('--engine')).toBe(1.5);
  expect(parseArgs([], SPEC).num('--engine')).toBeUndefined();
  expect(() => parseArgs(['--engine', 'abc'], SPEC).num('--engine')).toThrow('--engine 要是數字');
  expect(() => parseArgs(['--engine', ' '], SPEC).num('--engine')).toThrow('--engine 要是數字');
  // asking for a flag the spec lacks is the tool's bug, said in English
  expect(() => parseArgs([], SPEC).has('--forse')).toThrow('not in the spec');
});
