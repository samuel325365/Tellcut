# incompetech: music by Kevin MacLeod

**Unofficial mirror, personal use only**: the tracks are CC BY 4.0 (the author must be credited; `media/CREDITS.md` is written automatically), but the files come from a mirror someone else put together on archive.org, not from incompetech.com itself. The track list is an offline snapshot from 2026-09-28; searching doesn't go online.

**Where the list comes from**: the titles, genres, feels, BPM, instruments, ISRCs and descriptions in `catalog.json` come from Kevin MacLeod's [incompetech.com](https://incompetech.com/), obtained through the archive.org mirror [`abook-music-incompetech-cc-by-4.0`](https://archive.org/details/abook-music-incompetech-cc-by-4.0) (file names, lengths and sha1 are the mirror's file data); `description` is Kevin MacLeod's own description of each track, kept verbatim.

## Good for

Cinematic, YouTube-style music: light, warm, suspenseful, epic, comic, horror, retro, world music. 833 tracks, most 1–5 minutes.

## How to search

- Use **English** keywords; they are matched against title, feel, genre, instruments and description: `calm piano`, `upbeat ukulele`, `epic drums`, `jazz cafe`.
- Filter with `--opt`:
  - `--opt feel=<feel>`: Dark, Grooving, Relaxed, Bright, Calming, Bouncy, Driving, Mysterious, Intense, Eerie, Unnerving, Somber, Mystical, Uplifting, Humorous, Epic, Action, Suspenseful, Aggressive (a few Ren Faire, Medieval)
  - `--opt genre=<genre>`: Soundtrack, Electronica, Contemporary, World, Unclassifiable, Horror, Jazz, Rock, Classical, Silent Film Score, Funk, Latin, Stings, Pop, Modern, African, Holiday, Reggae, Blues, Disco, Polka, Ska, Urban
  - `--opt bpm=90-120` (or one number, ±5), `--opt instrument=piano`
- Filters without keywords work too: `assets search "" --kind music --opt feel=Bright --opt bpm=100-130`.
- Pick a track **no shorter than the film** (`--min-sec <film length>`): tracks aren't shortened automatically; end with a fade-out.

## Using a download

- Saved as `media/music/incompetech-<id>.wav` and registered as media `incompetech-<id>`; use `c.music('incompetech-<id>', { fadeOut: 2 })`.
- The beats have already been checked against the BPM in the list (fixing detections at half or double tempo), so `c.beatLen(4)` can be used directly. Tracks the list has no BPM for (about one in ten) use the detected beats.
- To start from the middle of a track: `--from seconds` when downloading, or `c.music(id, { from: seconds })`.

## Examples

```
npm run tellcut -- assets search "calm piano" --source incompetech --opt feel=Calming --opt bpm=60-100 --min-sec 90
npm run tellcut -- assets get <project> incompetech:<id>
```

## Pitfalls

- Some tracks are used a great deal on YouTube (for example Sneaky Snitch, Local Forecast - Elevator) and viewers recognise them at once; pick another for something less clichéd.
- `Stings` are music cues a few seconds long (transitions, scares), not a score for a whole film.
