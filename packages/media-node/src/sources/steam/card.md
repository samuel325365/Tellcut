# steam: Steam store (unofficial)

Games in the Steam store: names and descriptions in **Traditional Chinese**, prices in NT$, developer, release date, genres, Metacritic score, plus the store's promotional art, screenshots and **trailers** (real video footage). It uses the store website's own endpoints, which have no official documentation, so it is off by default in the public config; users switch it on locally. Images and videos are © the game companies; credits are added automatically.

## How to search

- Chinese or English names both work (`艾爾登法環`, `elden ring`), or give the appid directly (`1245620`).
- One search opens the first 3 matching games and lists for each: the **portrait cover** (1200×1800, best for 9:16), the **hero banner** (1920×620), the store header (460×215, small), the first 4 screenshots (1920×1080) and the trailers.
- `--kind video` lists only trailers, `--kind image` only images.

## Looking up data

- `assets data steam <name or appid>`: name, developer, publisher, release date, genres, Metacritic, NT$ price, review count, Traditional Chinese short description, and how many screenshots and trailers there are.
- `assets data steam top`: the top 10 by **concurrent players** (daily peak, last week's rank), for ranking films.

## Using a download

- Ids: `steam:1245620-cover`, `-hero`, `-header`, `-shot-0` (first screenshot), `-movie-<id>` (trailer; copy it from the search results).
- Images: saved as `media/steam/steam-<id>.jpg` and registered as a photo; use `c.photo('<media id>', …)`.
- Trailers: saved as `media/steam/steam-<id>.mp4` (1080p) and registered as a video; use `c.clip(…)`. **Run `npm run inspect -- <project>` first**, then choose the stretch. `--from`/`--len` take only a part. Trailers usually have music and narration; when using them for the picture, remember `sound: false`.

## Examples

```
npm run tellcut -- assets search "elden ring" --source steam
npm run tellcut -- assets search 1245620 --source steam --kind video
npm run tellcut -- assets data steam top
npm run tellcut -- assets get <project> steam:1245620-movie-256867718 --from 30 --len 6
```

## Pitfalls

- Unofficial endpoints may stop working when Steam changes its site (shown as broken in `npm run sources`). About 150 requests per 5 minutes at most.
- Searches also turn up DLC, soundtracks and small games with the same name: choose by name and appid.
- A few old games have no portrait cover or hero banner; the download says so; use screenshots instead.
