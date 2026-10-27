// spec §6.2: at most 2 heavy ffmpeg jobs (source analysis, export clip cuts) at once across the server.
export function createLimiter(n: number) {
  let active = 0, peak = 0;
  const waiting: Array<() => void> = [];
  return {
    get active() { return active; },
    get peak() { return peak; },
    async run<T>(fn: () => Promise<T>): Promise<T> {
      // a freed slot is handed straight to the next waiter, so a newcomer can never slip in above n
      if (active >= n) await new Promise<void>((r) => waiting.push(r));
      else active++;
      peak = Math.max(peak, active);
      try { return await fn(); }
      finally { const next = waiting.shift(); if (next) next(); else active--; }
    },
  };
}
export const heavy = createLimiter(2);
/** Contact sheets, transcripts and beats (spec 2026-10-14 §7): one at a time and never in a heavy slot, so a long
 *  transcription can run in the background without holding up source analysis or an export. */
export const background = createLimiter(1);
