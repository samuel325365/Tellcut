# freesound: Freesound sound effects (needs a key)

## Good for

The widest range of sound effects: foley (footsteps, doors, cups and plates), ambiences, nature sounds, odd sounds, single instrument notes, rhythm loops. Uploaded by people all over the world, so **quality varies**: check the length and tags before choosing. Modern sounds the BBC doesn't have (electronic, interface-like sounds) are easier to find here.

## How to search

- Use **English** keywords: `footsteps gravel`, `door creak`, `crowd cheering`, `whoosh`, `camera shutter`.
- `--min-sec`/`--max-sec` filter by length: short ones for single effects (`--max-sec 3`).
- `--opt bpm=90-120`: a BPM range for rhythmic sounds.
- `--opt loop=true`: only sounds tagged as loops (it goes by tags; not every loop is tagged).
- `--opt license=cc0`: CC0 only (no credit needed); `by`: CC BY; `by-nc`: CC BY-NC.

## Licences

- Every sound has its own licence; credits are written automatically with the author and licence.
- **CC BY-NC (no commercial use)**: avoid it in films with ad revenue, or use `--opt license=cc0` to find CC0 only.

## Downloading

- You get the preview file (about 192 kbps OGG), enough for a short; the original needs another kind of sign-in, which Tellcut doesn't do.
- After download the peaks are already limited (≤ −1 dBTP); saved as `media/sfx/freesound-<id>.wav`; use `c.sfxFile(path, { at: seconds })`.
- For long recordings take only a part with `--from`/`--len`.

## Examples

```
npm run tellcut -- assets search "footsteps gravel" --source freesound --max-sec 20
npm run tellcut -- assets search "drum loop" --source freesound --opt loop=true --opt license=cc0
npm run tellcut -- assets get <project> freesound:<id> --len 4
```

## Pitfalls

- At most 2,000 requests a day (searches and downloads both count); go easy when making many films in a batch.
- One author often uploads a whole set of similar recordings: pick one.
