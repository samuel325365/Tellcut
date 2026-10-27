# nasa: NASA Image and Video Library

NASA's own photos and videos: planets, nebulae, Earth, rocket launches, astronauts, the space station, archive footage of missions. **Mostly public domain** (NASA's works aren't copyrighted); a few items are the work of partners, as their page says; `media/CREDITS.md` credits them automatically all the same.

## How to search

- Use **English** keywords: `saturn rings`, `apollo 11 launch`, `earth from space`, `astronaut spacewalk`, `mars rover`.
- `--kind video` finds only videos, `--kind image` only images; without it, both.
- The first line of the results is a contact sheet (a video's thumbnail is one of its frames).

## Using a download

- Images: saved as `media/nasa/nasa-<id>.jpg` and registered as a photo; use `c.photo('<media id>', { len: 3 })`. If the original is over 20 MB, a large copy is fetched instead.
- Videos: saved as `media/nasa/nasa-<id>.mp4` and registered as a video; use `c.clip('<media id>', { from, len })`. **Run `npm run inspect -- <project>` first** to analyse the video (shots, whether anyone speaks), then choose the stretch.
- For long videos take only a part with `--from seconds --len seconds` (re-encoded, much smaller files).
- Videos come as the original file; over 400 MB, the large, medium, small, preview and mobile copies are tried in that order. Very long videos (for example a 20-minute interview whose original is several GB) only come as a small copy with low resolution: check the size `assets get` prints, and pick another video if it's too small.

## Examples

```
npm run tellcut -- assets search "saturn rings" --source nasa --kind image
npm run tellcut -- assets search "apollo 11 launch" --source nasa --kind video
npm run tellcut -- assets get <project> nasa:<id> --from 12 --len 8
```

## Pitfalls

- Ids are long (like `KSC-20190716-...`): copy the whole string.
- Most videos are documentaries and interviews, often with narration or speech; when using them as B-roll, remember `sound: false` or lower the original audio.
- Footage from early missions is low resolution (480p or less) and blurs when enlarged.
- A few items aren't NASA's work (the item page names the copyright holder); check the item page before commercial use.
