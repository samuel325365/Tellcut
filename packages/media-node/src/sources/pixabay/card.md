# pixabay: free Pixabay footage and photos

Stock footage and photos: everyday life, workplaces, city streets, food, nature B-roll, hand close-ups. The licence is the Pixabay Content License: free to use in videos, no credit required (`media/CREDITS.md` writes one anyway).

## How to search

- Use **English** keywords: `coffee pouring`, `bakery bread oven`, `city street morning`, `hands typing laptop`, `team meeting office`.
- `--kind video` finds only videos, `--kind image` only photos; without it, both, videos first.
- `--ratio 16:9` keeps landscape only, `--ratio 9:16` portrait only.
- `--opt order=latest` (newest) or `order=popular` (default); `--opt category=food` (category, for example business, food, people, places, nature); `--opt editors_choice=true` (editors' choice, steadier quality); `--opt video_type=film` (live action only, no animation).
- The first line of the results is a contact sheet; each hit's details give its size, length and author, say 「直式」 (portrait) for portrait items, and 「AI 生成」 (AI-generated) when its tags mark it as AI-generated.

## Using a download

- Videos: saved as `media/pixabay/pixabay-video-<id>.mp4` and registered as a video; use `c.clip('<media id>', { from, len })`. **Run `npm run inspect -- <project>` first**, then choose the stretch.
- By default you get the version whose short side is at least 1080 px (right for a 1080p film); for a 4K film use `--opt short=2160`. If the footage isn't that large, you get the largest there is; `assets get` prints the size.
- Photos: saved as `media/pixabay/pixabay-image-<id>.jpg`; use `c.photo('<media id>', { len: 3 })`.

## Examples

```
npm run tellcut -- assets search "bakery bread oven" --source pixabay --kind video --ratio 16:9
npm run tellcut -- assets search "flour hands dough" --source pixabay --kind image
npm run tellcut -- assets get <project> pixabay:video-307249
```

## Pitfalls

- **Recognisable people must not appear to endorse a brand or product** (the Pixabay licence forbids it): in brand films and ads prefer shots without faces (hands, backs, distant shots, out-of-focus crowds).
- Check frame by frame: soft focus, exposure jumps, and a sudden cut to black or fade-out at the end are all common. Look at the `inspect` results and brightness before choosing an in-point, and stay clear of the end.
- Items marked 「AI 生成」 often get details wrong (fingers, text, signs); look closely at close-ups.
- Portrait videos in a 16:9 film get cropped heavily; check for 「直式」 in the details.
- Photos come at most 1280 px wide and look slightly soft filling a 1080p frame; good for small frames and photo walls, not for full-frame push-ins.
- No bulk downloading: get only the few you'll really use. Search results are cached for 24 hours.
