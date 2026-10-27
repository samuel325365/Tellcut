# anime: anime and manga (AniList)

AniList, the anime and manga database: covers, banners and character images, plus each title's names, studio, season, episode count, score, main characters and voice actors. The images are promotional art, © the original companies; credits are added automatically.

## How to search

- Use **English, romaji or the original Japanese title**: `Frieren`, `Sousou no Frieren`, `葬送のフリーレン`, `Spy x Family`. Chinese translated titles mostly aren't found.
- Anime by default; `--opt type=manga` finds manga.
- Two hits per title: the **cover** (portrait, good for 9:16 films) and the **banner** (wide and flat, good as a background strip); some titles have no banner.
- `--opt what=character`: find character images (`Frieren`, `Anya Forger`).

## Looking up data

`assets data anime <title>`: titles (English, Japanese, romaji), format (TV, movie), airing status, start date, season, episode count, episode length, studio, genre tags, score (out of 100), number of users who saved it, main characters and their Japanese voice actors, English synopsis. Look it up before a ranking or an introduction film; don't quote numbers from memory.

## Using a download

- Ids: `anime:154587-cover` (cover), `anime:154587-banner` (banner), `anime:char-176754` (character).
- Saved as `media/anime/anime-<id>.jpg` and registered as a photo; use `c.photo('<media id>', …)`.
- Covers are about 460×650, banners about 1900×400, character images about 230×345: all small. Use covers and character images at card size, don't blow them up to full screen.

## Examples

```
npm run tellcut -- assets search Frieren --source anime
npm run tellcut -- assets search Frieren --source anime --opt what=character
npm run tellcut -- assets data anime "Spy x Family"
```

## Pitfalls

- AniList allows only 30 requests a minute; go easy in batch work.
- In 2026-10 AniList paused its whole API once: the tool then says 「暫時不能用」 (temporarily unavailable). Use another source instead of retrying again and again.
- The synopsis is in English and may contain spoilers; rewrite it for the voice-over.
