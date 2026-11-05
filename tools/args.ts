// The words of a command line, read the same strict way by every tool: each flag a tool takes is declared with what it takes, and
// anything else that looks like a flag is refused naming it (`npm run voice -- p --forse s01` once read --forse as a flag taking
// s01, and made every scene again). Positional words are kept in order, wherever the flags stand.
//   --k v and --k=v      a 'value' flag: one value, given once (a value that starts with -- is a forgotten value, not the value)
//   --k                  a 'switch': no value, so it never swallows the next word
//   --k v --k w          a 'list' flag: may repeat, every value kept in order
//   --                   the end of the flags: every word after it is positional, even one that starts with -
//   --help / -h          asking: the usage on stdout, exit 0 (Help; printFailure / parseArgsOrExit do that)
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

/** `--help` / `-h`: not a mistake — the usage alone, printed on stdout with exit code 0. A Usage, so a caller that only knows
 *  Usage still stops. */
export class Help extends Usage {}

export interface ParseOptions {
  /** at most this many positional words: more is refused, naming them (a word too many was dropped without a word) */
  maxWords?: number;
  /** the language of the problems: Chinese like every tool's output, English for examples, setup and doctor (run right after cloning) */
  lang?: 'zh' | 'en';
}

const HELP = new Set(['--help', '-h']);
const MSG = {
  zh: {
    unknown: (flag: string, known: string[]) => `沒有 ${flag} 這個選項${known.length ? `（可以用：${known.join('、')}）` : '（這個指令不接選項）'}`,
    noValueTaken: (flag: string) => `${flag} 後面不接值`,
    needsValue: (flag: string) => `${flag} 後面要有值`,
    once: (flag: string) => `${flag} 只能給一次`,
    number: (flag: string) => `${flag} 要是數字`,
    extra: (extra: string[], max: number) => `多了用不到的字：${extra.map((w) => `「${w}」`).join('、')}（${max ? `最多接 ${max} 個` : '這個指令不接其他字'}）`,
  },
  en: {
    unknown: (flag: string, known: string[]) => `There is no option ${flag}${known.length ? ` (the options are: ${known.join(', ')})` : ' (this command takes no options)'}`,
    noValueTaken: (flag: string) => `${flag} takes no value`,
    needsValue: (flag: string) => `${flag} needs a value`,
    once: (flag: string) => `${flag} can be given only once`,
    number: (flag: string) => `${flag} must be a number`,
    extra: (extra: string[], max: number) => `Unexpected ${extra.map((w) => `"${w}"`).join(', ')} (${max ? `at most ${max} word${max > 1 ? 's' : ''}` : 'this command takes no other words'})`,
  },
};

/** Reads `argv` (the words after the script) by `spec`. Throws Usage — the problem, then `usage` when given — for a flag the spec
 *  does not have, a value flag without its value or given twice, a switch written with `=`, or more words than `o.maxWords`.
 *  `--help` / `-h`, unless the spec has it, throws Help with the usage alone (when there is one). A word like `-x` is a mistyped
 *  flag too; `-` (stdin) and `-3` are words. */
export function parseArgs(argv: string[], spec: FlagSpec, usage?: string, o: ParseOptions = {}): Args {
  const m = MSG[o.lang ?? 'zh'];
  const fail = (msg: string): never => { throw new Usage(usage ? `${msg}\n${usage}` : msg); };
  const words: string[] = [], values = new Map<string, string[]>();
  for (let i = 0; i < argv.length; i++) {
    const w = argv[i];
    if (w === '--') { words.push(...argv.slice(i + 1)); break; }
    if (!/^-(-|[A-Za-z])/.test(w)) { words.push(w); continue; }
    const eq = w.startsWith('--') ? w.indexOf('=') : -1, flag = eq > 0 ? w.slice(0, eq) : w, kind = spec[flag];
    if (!kind) {
      if (HELP.has(flag) && usage) throw new Help(usage);
      fail(m.unknown(flag, Object.keys(spec)));
    }
    if (kind === 'switch') {
      if (eq > 0) fail(m.noValueTaken(flag));
      values.set(flag, []);
      continue;
    }
    const v = eq > 0 ? w.slice(eq + 1) : argv[i + 1];
    if (v === undefined || (eq < 0 && v.startsWith('--'))) fail(m.needsValue(flag));
    if (eq < 0) i++;
    if (kind === 'value' && values.has(flag)) fail(m.once(flag));
    values.set(flag, [...(values.get(flag) ?? []), v!]);
  }
  if (o.maxWords !== undefined && words.length > o.maxWords) fail(m.extra(words.slice(o.maxWords), o.maxWords));
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
      if (!v.trim() || !Number.isFinite(n)) fail(m.number(flag));
      return n;
    },
  };
}

/** What a command line does with the error that stopped it: Help's usage on stdout (0), anything else on stderr — Usage 2,
 *  another error 1. Returns the exit code, for `process.exit(…)` or `process.exitCode = …`. */
export function printFailure(e: unknown, out: { log(s: string): void; error(s: string): void } = console): number {
  if (e instanceof Help) { out.log(e.message); return 0; }
  out.error(e instanceof Error ? e.message : String(e));
  return e instanceof Usage ? 2 : 1;
}

/** parseArgs for a script that runs at its top level: on a problem prints it and exits (2), on --help prints the usage and exits (0) */
export function parseArgsOrExit(argv: string[], spec: FlagSpec, usage?: string, o?: ParseOptions): Args {
  try { return parseArgs(argv, spec, usage, o); } catch (e) { process.exit(printFailure(e)); }
}
