# wikimedia: Wikimedia Commons images

A free image library: places, buildings, street scenes, nature, historical photos and old maps. Most licences are CC BY or CC BY-SA and require crediting the author; `media/CREDITS.md` is written automatically.

## How to search

- **Chinese keywords work** (`台北101`, `克拉科夫`), but place names in English or the local language often give more results: `Kraków Old Town`, `Rynek Główny`. Try both.
- `--ratio 9:16` keeps portrait images only, `--ratio 16:9` landscape only. Portrait films are short of portrait images: add this first.
- The first line of the results is a **contact sheet**; Read that one image to choose, with each cell's id under it.
- Each hit has its size, licence and author; images narrower or shorter than 1080 blur when enlarged.

## Using a download

- Saved as `media/wikimedia/wikimedia-<id>.jpg` (or `.png`) and registered as the photo `wikimedia-<id>`.
- Put it on the timeline with `c.photo('wikimedia-<id>', { len: 3, zoom: [1, 1.1] })`; a slow push-in looks less like a slideshow.
- JPEG/PNG up to 3,840 px are used as is; SVG, TIFF and larger images come as a raster rendered by Commons (normally 1920 wide; landscape images wider than 3,840 come 3840 wide, so they don't blur in 9:16).
- GIFs never appear in the results (the player can't use them).

## Examples

```
npm run tellcut -- assets search "Kraków Old Town" --source wikimedia --ratio 9:16
npm run tellcut -- assets get <project> wikimedia:<id>
```

## Pitfalls

- The lead image of a wiki article is often a **logo** or a map, not the real place: for example the lead image of the 「台北101」 article is its logo. Check the contact sheet when choosing.
- Panoramas are very wide and become a thin strip in 9:16; historical photos are often low resolution.
- File names and descriptions are often written by the photographer and aren't always accurate; trust the file page for the location.
- To check facts for the voice-over, use `npm run tellcut -- assets data wikimedia <article>` to get the Traditional Chinese summary from the Chinese Wikipedia.
