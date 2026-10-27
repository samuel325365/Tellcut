// Loads the plan's buffers, plays them live (preview) or renders them offline (export WAV).
import type { Mix } from '../schema.ts';
import type { SfxType } from '../plugin.ts';
import type { AudioPlan } from './plan.ts';
import { buildMix } from './mix.ts';
import { encodeWavBase64 } from './wav.ts';

const RATE = 48000;
/** a buffer that failed is fetched again after this long (the file may have been put back); its error is reported once */
const RETRY_MS = 10000;

export class AudioEngine {
  private raw = new Map<string, ArrayBuffer>();
  private live: AudioContext | null = null;
  private liveBufs = new Map<string, AudioBuffer>();
  private nodes: AudioScheduledSourceNode[] = [];
  private out: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private samples = new Float32Array(2048);
  constructor(private plan: AudioPlan, private sfx: (type: string) => SfxType | undefined, private mix: Mix, private duration: number,
    private makeContext: () => AudioContext = () => new AudioContext({ sampleRate: RATE })) {}

  /** A preview buffer that cannot be decoded (a broken or unsupported file): reported once, then left out of the mix. */
  onDecodeError?: (key: string, e: Error) => void;

  /** Swaps in an edited plan; buffers it no longer uses are dropped (every audio trim makes a new segment URL).
   *  `mix` / `duration`: the project's new settings — kept here, so an edit never closes and reopens the AudioContext. */
  setPlan(plan: AudioPlan, mix: Mix = this.mix, duration = this.duration) {
    this.plan = plan;
    this.mix = mix;
    this.duration = duration;
    for (const k of [...this.raw.keys()]) if (!(k in plan.buffers)) { this.raw.delete(k); this.liveBufs.delete(k); }
  }

  /** Fetches the plan's buffers. With onError (preview), a failing buffer is skipped and reported once
   *  instead of failing the whole load: a project with offline media still opens (spec §8). */
  async load(fetchFn: typeof fetch = fetch, onError?: (url: string, e: Error) => void) {
    await Promise.all(Object.entries(this.plan.buffers).map(async ([k, url]) => {
      const at = this.failed.get(url);
      if (this.raw.has(k) || (onError && at !== undefined && Date.now() - at < RETRY_MS)) return;
      try {
        const r = await fetchFn(url);
        if (!r.ok) throw new Error(`${r.status} ${url}`);
        this.raw.set(k, await r.arrayBuffer());
        this.failed.delete(url);   // reported stays until it decodes: a file that fetches but cannot be decoded is not reported again
      } catch (e) {
        if (!onError) throw e;
        this.failed.set(url, Date.now());
        if (!this.reported.has(url)) { this.reported.add(url); onError(url, e as Error); }
      }
    }));
  }
  /** url → when it last failed; the urls whose failure was already reported */
  private failed = new Map<string, number>();
  private reported = new Set<string>();
  /** the keys of the buffers fetched so far */
  loaded(): string[] { return [...this.raw.keys()]; }
  private decoding = new Map<string, Promise<void>>();

  /** Creates the live context (suspended until play) and decodes every loaded buffer ahead of play():
   *  decoding everything on the first play made it start seconds late. */
  async prepare() {
    if (!this.live) this.live = this.makeContext();
    const ctx = this.live;
    await Promise.all([...this.raw].map(([k, ab]) => {
      if (this.liveBufs.has(k)) return undefined;
      let d = this.decoding.get(k);
      if (!d) {
        d = ctx.decodeAudioData(ab.slice(0)).then((b) => { if (this.raw.has(k)) this.liveBufs.set(k, b); this.reported.delete(this.plan.buffers[k] ?? k); })
          // one bad file must not stop every play: drop it (no retry on each play) and say which one
          // remembered as failed too: the next edit's load() must not fetch it again (and report it again)
          .catch((e: Error) => { const url = this.plan.buffers[k] ?? k; this.raw.delete(k); this.failed.set(url, Date.now()); if (!this.reported.has(url)) { this.reported.add(url); this.onDecodeError?.(k, e); } })
          .finally(() => this.decoding.delete(k));
        this.decoding.set(k, d);
      }
      return d;
    }));
  }
  private async decode(ctx: BaseAudioContext) {
    const out = new Map<string, AudioBuffer>();
    for (const [k, ab] of this.raw) out.set(k, await ctx.decodeAudioData(ab.slice(0)));
    return out;
  }

  /** bumped by every stop() (so every play()): a play() that was stopped or overtaken while starting builds nothing */
  private gen = 0;
  async play(from: number): Promise<number> {
    this.stop();
    const gen = this.gen;
    // decode whatever load() fetched since the last play (usually already done by prepare())
    await this.prepare();
    if (!this.live) throw new Error('Audio engine was disposed');   // a project-settings patch replaced this engine meanwhile
    if (gen !== this.gen) return this.live.currentTime + 0.05;
    await this.live.resume();
    if (!this.live) throw new Error('Audio engine was disposed');
    const base = this.live.currentTime + 0.05;
    if (gen !== this.gen) return base;
    // a private output per play(): stop() disconnects it, silencing synth nodes buildMix does not track
    this.out = this.live!.createGain();
    this.out.connect(this.live!.destination);
    // master meter: taps the live output (preview only; renderWav never meters)
    this.analyser = this.live!.createAnalyser();
    this.analyser.fftSize = 2048;
    this.out.connect(this.analyser);
    this.nodes = buildMix(this.live!, this.plan, this.liveBufs, this.sfx, this.mix, from, base, this.out);
    return base;
  }
  stop() {
    this.gen++;
    for (const n of this.nodes) try { n.stop(); } catch { /* already stopped */ }
    this.nodes = [];
    this.out?.disconnect(); this.out = null;
    this.analyser?.disconnect(); this.analyser = null;
    this.live?.suspend();
  }
  /** Peak level of the live output over the last analysis window, in dBFS (-120 when silent or stopped). */
  level(): number {
    if (!this.analyser) return -120;
    this.analyser.getFloatTimeDomainData(this.samples);
    let peak = 0;
    for (const v of this.samples) peak = Math.max(peak, Math.abs(v));
    return peak > 1e-6 ? Math.max(-120, 20 * Math.log10(peak)) : -120;
  }
  /** Stops and closes the live context (a project reload makes a new engine; browsers cap open contexts). */
  dispose() { this.stop(); void this.live?.close(); this.live = null; this.liveBufs.clear(); }
  now() { return this.live ? this.live.currentTime : 0; }

  async renderWav(): Promise<string> {
    const ctx = new OfflineAudioContext(2, Math.ceil(this.duration * RATE), RATE);
    buildMix(ctx, this.plan, await this.decode(ctx), this.sfx, this.mix, 0, 0);
    return encodeWavBase64(await ctx.startRendering());
  }
}
