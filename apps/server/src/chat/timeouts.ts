// A foreground Bash command's timeouts in the page chat. Their own file: runner.ts and recover.ts import each other, and
// recover.ts needs the longest one when it loads (QUIET_MS) — read from runner.ts it was not set yet when runner.ts loaded first.

/** a foreground Bash command's default and longest timeout in the chat (recover.ts waits out the longest one) */
export const BASH_DEFAULT_TIMEOUT_MS = 10 * 60_000;
export const BASH_MAX_TIMEOUT_MS = 30 * 60_000;
