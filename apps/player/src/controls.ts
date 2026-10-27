// Preview transport (port of the original main.js preview loop).
import type { AudioEngine, MediaPool } from '@tellcut/engine';
import { fitStage } from './fit.ts';

export function mountControls(o: { stage: HTMLElement; draw: (t: number) => void; late: (t: number) => void; pool: MediaPool; audio: AudioEngine; duration: number }) {
  // a still frame: the late pass once the videos are where they should be. Every drawn frame takes a new number: a late pass
  // whose frame was drawn over meanwhile (fast scrubbing, playback started) is dropped, or the old time's picture comes back
  let drawn = 0;
  const still = (t: number) => { const mine = ++drawn; o.draw(t); void o.pool.sync().then(() => { if (mine === drawn) o.late(t); }); };
  const btn = document.getElementById('play') as HTMLButtonElement;
  const scrub = document.getElementById('scrub') as HTMLInputElement;
  const clock = document.getElementById('clock')!;
  const vp = document.getElementById('viewport')!;
  const fit = () => fitStage(o.stage, vp);
  addEventListener('resize', fit); fit();
  // one loop at a time: a scrub while playing restarts playback, and the frame the old loop had asked for is cancelled
  let playing = false, t = 0, base = 0, from = 0, frame = 0, run = 0;
  const label = () => { clock.textContent = `${t.toFixed(2)} / ${o.duration.toFixed(2)}`; scrub.value = String(Math.round((t / o.duration) * 1000)); };
  async function play() {
    if (t >= o.duration - 0.05) t = 0;
    const mine = ++run;
    cancelAnimationFrame(frame);
    from = t; const b = await o.audio.play(t);
    if (mine !== run) return;   // a later scrub or pause took over while the audio started
    base = b;
    playing = true; o.pool.playing = true; btn.textContent = '❚❚ Pause';
    loop();
  }
  function pause() { run++; cancelAnimationFrame(frame); playing = false; o.pool.playing = false; o.audio.stop(); btn.textContent = '▶ Play'; still(t); }
  function loop() {
    if (!playing) return;
    t = from + (o.audio.now() - base);
    if (t >= o.duration) { t = o.duration; pause(); label(); return; }
    drawn++; o.draw(t); void o.pool.sync(); o.late(t); label();
    frame = requestAnimationFrame(loop);
  }
  btn.onclick = () => (playing ? pause() : play());
  scrub.oninput = () => { t = (Number(scrub.value) / 1000) * o.duration; if (playing) play(); else { still(t); label(); } };
  addEventListener('keydown', (e) => { if (e.code === 'Space') { e.preventDefault(); btn.click(); } });
  label();
}
