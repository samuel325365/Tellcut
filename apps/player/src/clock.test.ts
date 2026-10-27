import { SmoothClock } from './clock.ts';

/** The audio clock as Chrome reports it: whole 128-sample quanta (2.67 ms at 48 kHz), read at an uneven point in each frame. */
function simulate(frames: number, phase: (i: number) => number) {
  let wall = 0;
  const clock = new SmoothClock(() => wall), q = 128 / 48000, out: number[] = [], truth: number[] = [];
  for (let i = 0; i < frames; i++) {
    wall = i / 60;
    const audio = Math.floor((wall + phase(i)) / q) * q;
    out.push(clock.at(audio)); truth.push(wall);
  }
  return { out, truth };
}

test('per-frame time advances evenly although the audio clock jumps in quanta', () => {
  const { out, truth } = simulate(240, (i) => ((i * 7919) % 13) / 1000);   // 0–12 ms read jitter
  const steps = out.slice(61).map((t, i) => (t - out[60 + i]) * 1000);
  expect(Math.max(...steps) - Math.min(...steps)).toBeLessThan(2);          // was 8–21 ms with the raw clock
  for (let i = 60; i < out.length; i++) expect(Math.abs(out[i] - truth[i])).toBeLessThan(0.02);   // stays on the audio
  for (let i = 1; i < out.length; i++) expect(out[i]).toBeGreaterThan(out[i - 1]);
});

test('a jump in the audio clock (a stall or a restart) is followed at once', () => {
  let wall = 0;
  const clock = new SmoothClock(() => wall);
  clock.at(0);
  wall = 1 / 60; clock.at(1 / 60);
  wall = 2 / 60;
  expect(clock.at(5)).toBe(5);
  clock.reset();
  wall = 3 / 60;
  expect(clock.at(0.2)).toBe(0.2);
});
