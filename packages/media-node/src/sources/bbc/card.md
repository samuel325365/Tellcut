# bbc-sfx: BBC Sound Effects

**Unofficial interface, personal use only** (RemArc licence: personal, educational and research use, no commercial use; credits are added automatically). The BBC can change its site at any time; if it breaks, `npm run sources` will notice.

## Good for

About 33,000 professional recordings: nature (rain, wind, waves, birds), city (streets, markets, crowds), transport (trains, trams, airports, cars), interiors (restaurants, kitchens, offices), period recordings and foley (footsteps, doors, cups and plates). Good for stretches that lack real ambience or foley.

**Not here**: modern phone ringtones, notification sounds, UI clicks, game sounds, transition whooshes. Synthesise those or use the shared sound pack (`npm run tellcut -- catalog --find sfx`).

## How to search

- Always use **English** keywords that describe the recording's situation: `rain on window`, `crowd market`, `train interior`, `seagulls harbour`, `footsteps gravel`, `cafe ambience`.
- A result's title is the BBC's description of the recording, followed by the album name (for example `Weather 2 - Storms`), which tells you whether it is an ambience or a single effect.
- `--min-sec`/`--max-sec` filter by length: short ones for single effects (`--max-sec 5`), long ones for ambiences.

## Downloading

- Long ambiences (often several minutes) take only the part you need with `--from`/`--len`: `assets get <project> bbc-sfx:07043376 --from 10 --len 8`.
- By default you get a 128 kbps MP3 (enough for a short); `--opt format=wav` gets the original WAV (about ten times larger).
- After download the peaks are already limited (≤ −1 dBTP); saved as `media/sfx/bbc-sfx-<id>.wav`; put it on the timeline with `c.sfxFile(path, { at: seconds })`.

## Examples

```
npm run tellcut -- assets search "rain on window" --source bbc-sfx --min-sec 20
npm run tellcut -- assets get <project> bbc-sfx:07043376 --from 5 --len 10
```

## Pitfalls

- Many recordings are old, so cars and voices can sound dated; for a modern city sound, read the description and album name before choosing.
- An album often has several similar recordings: pick one, don't download them all.
