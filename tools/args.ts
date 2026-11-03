// The words of a command line, read the same strict way by every tool: each flag a tool takes is declared with what it takes, and
// anything else that looks like a flag is refused naming it (`npm run voice -- p --forse s01` once read --forse as a flag taking
// s01, and made every scene again). Positional words are kept in order, wherever the flags stand.
//   --k v and --k=v      a 'value' flag: one value, given once (a value that starts with -- is a forgotten value, not the value)
//   --k                  a 'switch': no value, so it never swallows the next word
//   --k v --k w          a 'list' flag: may repeat, every value kept in order
//   --                   the end of the flags: every word after it is positional, even one that starts with -
import { Usage } from './usage.ts';

export type FlagKind = 'switch' | 'value' | 'list';
/** the flags a tool takes, with their leading `--` */
export type FlagSpec = Record<string, FlagKind>;

export interface Args {
  /** the positional words, in order */
  words: string[];
  /** the flag was given (a switch, or a flag with its value) */
  has(flag: string): boolean;
  /** a value flag's value (a list flag's last) */
  get(flag: string): string | undefined;
  /** a list flag's values, in order */
  all(flag: string): string[];
  /** a value flag's value as a number; Usage when it is not one */
  num(flag: string): number | undefined;
}

const HELP = new Set(['--help', '-h']);

/** Reads `argv` (the words after the script) by `spec`. Throws Usage — the problem, then `usage` when given — for a flag the spec
 *  does not have, a value flag without its value or given twice, or a switch written with `=`. `--help` / `-h`, unless the spec
 *  has it, throws Usage with the usage alone (when there is one). A word like `-x` is a mistyped flag too; `-` (stdin) and `-3` are words. */
export function parseArgs(argv: string[], spec: FlagSpec, usage?: string): Args {
  const fail = (msg: string): never => { throw new Usage(usage ? `${msg}\n${usage}` : msg); };
  const words: string[] = [], values = new Map<string, string[]>();
  for (let i = 0; i < argv.length; i++) {
    const w = argv[i];
    if (w === '--') { words.push(...argv.slice(i + 1)); break; }
    if (!/^-(-|[A-Za-z])/.test(w)) { words.push(w); continue; }
    const eq = w.startsWith('--') ? w.indexOf('=') : -1, flag = eq > 0 ? w.slice(0, eq) : w, kind = spec[flag];
    if (!kind) {
      if (HELP.has(flag) && usage) throw new Usage(usage);
      const known = Object.keys(spec);
      fail(`沒有 ${flag} 這個選項${known.length ? `（可以用：${known.join('、')}）` : '（這個指令不接選項）'}`);
    }
    if (kind === 'switch') {
      if (eq > 0) fail(`${flag} 後面不接值`);
      values.set(flag, []);
      continue;
    }
    const v = eq > 0 ? w.slice(eq + 1) : argv[i + 1];
    if (v === undefined || (eq < 0 && v.startsWith('--'))) fail(`${flag} 後面要有值`);
    if (eq < 0) i++;
    if (kind === 'value' && values.has(flag)) fail(`${flag} 只能給一次`);
    values.set(flag, [...(values.get(flag) ?? []), v!]);
  }
  // asking about a flag the spec does not have is the tool's own mistake, never the user's
  const known = (flag: string) => { if (!spec[flag]) throw new Error(`parseArgs: ${flag} is not in the spec`); return flag; };
  const get = (flag: string) => values.get(known(flag))?.at(-1);
  return {
    words,
    has: (flag) => values.has(known(flag)),
    get,
    all: (flag) => [...(values.get(known(flag)) ?? [])],
    num: (flag) => {
      const v = get(flag);
      if (v === undefined) return undefined;
      const n = Number(v);
      if (!v.trim() || !Number.isFinite(n)) fail(`${flag} 要是數字`);
      return n;
    },
  };
}

/** parseArgs for a script that runs at its top level: prints the problem and exits (2) instead of throwing */
export function parseArgsOrExit(argv: string[], spec: FlagSpec, usage?: string): Args {
  try { return parseArgs(argv, spec, usage); } catch (e) { console.error((e as Error).message); process.exit(2); }
}
