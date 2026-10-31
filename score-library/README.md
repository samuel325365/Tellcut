# Music style library

Besides the five built-in styles (pluck, lofi, cinematic, tech, playful), `npm run score` loads every `.js` style in this folder.

- A new style is written in its project first: `projects/<project>/score/<style id>.js`.
- When it works well, `npm run promote-style -- <project> <style id> --yes` moves it here, and every project can use it (`c.score('<style id>', { bpm })` in cut.ts, or `npm run score -- <project> --style <style id>`). It also gives the style the next gallery handle in `packages/protocol/src/handles.ts` (`MUS-24`, `MUS-25`…); a style moved here by hand needs that line added by hand, or the tests fail.
- `npm test` runs the same checks on every style here (notes in key, the same seed gives the same result, a clean ending).

## What a style file looks like

```js
/** @type {import('@tellcut/media-node').Style} */
export default {
  id: 'my-style',                     // lower-case letters, digits and hyphens; not the id of another style
  label: '中文名稱',                   // the name the gallery shows (in Chinese, like the other styles)
  doc: '一行：聽起來像什麼、適合什麼影片',  // one line, in Chinese: what it sounds like, what films it suits
  defaults: { bpm: 96, key: 'Dm' },
  swing: 0,                           // 0–0.2: how far the off-beats are pushed late
  build(ctx) {                        // returns the list of notes; randomness only through ctx.rng()
    const out = [];
    for (let b = 0; b < ctx.bars; b++) {
      if (ctx.role(b) === 'end') { /* the closing bar: one chord is enough */ continue; }
      out.push({ t: ctx.at(b, 0), inst: 'kick', vel: 0.9, pan: 0 });
    }
    return out;
  },
  // optional: instruments of its own (synth holds the built-in instruments, to build on)
  voices: { myLead: (sr, r, e, synth) => synth.pulse(sr, 440 * 2 ** ((e.midi - 69) / 12), e.dur ?? 0.3) },
};
```

A promoted style's id must also be listed in the "Music" part of `guides/workflow.md` (a test checks it).

Optional field `scale`: when a style does not use the major or minor scale (Hijaz, for example), list the notes it uses (semitones above the tonic, 0 included), for example `scale: [0, 1, 4, 5, 7, 8, 10]`; the "notes in key" check in `npm test` then uses it. `defaults.key` still sets the tonic.

`ctx` gives: `bpm`, `key`, `bars`, `beat` / `bar` (seconds), `rng()`, `role(bar)` (intro / loop / fill / outro / end), `layers(bar)` (0–3, more layers later on), `at(bar, beat)` (seconds), and music theory in the key: `scaleNote(degree, octave)`, `chordOn(degree, { octave, seventh })`, `inKey(midi)`; `cues` holds moments of the film by name in seconds (a cut.ts passes them with `c.score(style, { cues: { lift: 43.2 } })`; `{}` when none were given, so read them with a fallback: `ctx.cues.lift ?? 32`). Pitches are MIDI numbers (C4 = 60). A style file cannot import packages (the same rule as a project's fx); everything it needs is in `ctx` and in the `synth` that `voices` get.

## Instruments of its own (voices)

- Signature: `(sr, r, e, synth) => Float32Array`. `sr` is the sample rate, `r()` the seeded random (use only it), `e` this note (`midi`, `dur`, `vel`…), `synth` the built-in instruments.
- Return **one note at velocity 1**: **do not multiply by `e.vel`** yourself, the mix applies the velocity and the panning; a note with a `midi` is cached and reused (the same pitch and length is synthesised once).
- Pitch to frequency: `440 * 2 ** ((e.midi - 69) / 12)`.
- The built-in instruments in `synth` (all return a Float32Array):
  - `pluck(sr, r, freq, seconds, brightness 0–1)`, `marimba(sr, freq, seconds, velocity)`, `bell(sr, freq, seconds, velocity)`, `epiano(sr, freq, seconds, velocity)`
  - `bass(sr, freq, seconds, velocity)`, `sub(sr, freq, seconds, velocity)`, `pad(sr, freq, seconds, velocity, brightness)`, `pulse(sr, freq, seconds, velocity)`, `tom(sr, freq, velocity)`
  - `kick(sr, r, velocity)`, `snare(sr, r, velocity, soft?)`, `clap(sr, r, velocity)`, `hat(sr, r, velocity, open?)`, `shaker(sr, r, velocity)`
- A built-in instrument's name can also go straight into a note's `inst` (no voices needed): pluck, marimba, bell, epiano, bass, sub, pad, pulse, tom, kick, snare, softSnare, clap, hat, openHat, shaker.
