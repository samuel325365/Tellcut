# game-wikis: game wikis (Mario, Zelda)

Fan encyclopedias of two Nintendo series: the **Super Mario Wiki** (`mario`) and **Zelda Wiki** (`zelda`). Characters, items, locations, game covers and promotional art, plus each article's English introduction. The images are © the game companies, hosted by the wikis as fair use; credits are added automatically. For Pokémon use `pokeapi` (Bulbapedia blocks scripted requests, so it isn't connected).

## How to search

- Use the **English** article name: `Yoshi`, `Bowser`, `Master Sword`, `Hyrule Castle`.
- Results list **the main image of the matching article** first (usually the character's official artwork), then images whose file name matches.
- `--opt wiki=mario` or `--opt wiki=zelda` searches one wiki only; without it both are searched and interleaved. If one is temporarily unavailable, you still get the other's results.
- One look at the contact sheet is enough to choose; images narrower or shorter than 1080 are only good at card size.

## Looking up data

`assets data game-wikis <article>`: one section per wiki, with the article title, URL, main image file name and English introduction (up to about 900 words). If there's no such article, it lists the closest article names; look up one of those.

## Using a download

- Ids look like `game-wikis:mario-457287` (wiki-file id).
- Saved as `media/game-wikis/game-wikis-<id>.png` and registered as a photo; use `c.photo('<media id>', …)`.
- PNG/JPEG up to 3,840 px are used as is; SVGs and larger images come as a 1920-wide raster. GIFs never appear in the results.

## Examples

```
npm run tellcut -- assets search Yoshi --source game-wikis --opt wiki=mario
npm run tellcut -- assets data game-wikis "Master Sword" --opt wiki=zelda
npm run tellcut -- assets get <project> game-wikis:mario-457287
```

## Pitfalls

- The introduction is the wiki's English original: rewrite it for the voice-over, don't translate and paste it sentence by sentence.
- Text licences: Super Mario Wiki CC BY-SA 4.0, Zelda Wiki GFDL 1.3.
- There are many in-game screenshots and small icons (like 160×160 icons) that blur when enlarged.
