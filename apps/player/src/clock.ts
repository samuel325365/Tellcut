// AudioContext.currentTime advances in whole render quanta (128 samples ≈ 2.7 ms at 48 kHz) and is read at an uneven
// point in each frame, so frame-to-frame steps jumped between 8 and 21 ms and every motion (Ken Burns, overlays) juddered.
// SmoothClock follows the wall clock and is nudged toward the audio clock, so pictures move evenly and stay in sync.
export class SmoothClock {
  private anchor = 0;     // audio time at `wall0`
  private wall0 = 0;
  private started = false;
  constructor(private wall: () => number = () => performance.now() / 1000) {}

  /** Forget the history (a new play()); the next reading is taken as is. */
  reset() { this.started = false; }

  at(audio: number): number {
    const w = this.wall();
    if (!this.started) { this.started = true; this.anchor = audio; this.wall0 = w; return audio; }
    const err = audio - (this.anchor + (w - this.wall0));
    // a real jump (a stall, a seek): follow the audio at once
    if (Math.abs(err) > 0.05) { this.anchor = audio; this.wall0 = w; return audio; }
    // otherwise drift toward it a little each frame (the quanta average out)
    this.anchor += err * 0.1;
    return this.anchor + (w - this.wall0);
  }
}
