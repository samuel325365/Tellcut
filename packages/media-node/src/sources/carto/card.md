# carto: Carto street maps (needs a key)

Street maps outside Taiwan, worldwide, with place names in the local language or English. `assets map` uses it outside Taiwan with `--style street`, or anywhere with `--style light`/`dark`.

## Styles

- `street` (outside Taiwan): voyager, coloured, like an ordinary navigation map.
- `light`: light grey, good for overlaying routes and text.
- `dark`: dark and cinematic; draw routes in a bright colour (`--color #ffd166`).

## Key and terms (read 2026-10-23)

- Needs a key: request one free at carto.com/basemaps with an email address, no account needed. Put it in `tellcut/sources.local.json` as `"keys": { "carto": "…" }`, or set the environment variable `CARTO_API_KEY`.
- 5 million requests a month, non-commercial use only (personal, research, teaching). A channel with ad revenue may count as commercial; that is the user's call.
- Static images are allowed, but the credit `© OpenStreetMap contributors, © CARTO` must be printed legibly (Tellcut prints it in the bottom-right corner).
- No bulk downloading. The cache on the user's computer may be kept for at most 30 days; Tellcut refetches or clears old tiles by itself.
- With no key or a wrong one, Carto doesn't return an error but a picture saying "API KEY REQUIRED". Tellcut recognises it, says the key is wrong (「key 不對」) and doesn't keep it in the cache; `npm run sources` checks this too.

## Examples

```
npm run tellcut -- assets map <project> --at Kraków
npm run tellcut -- assets map <project> --from Kraków --to Wieliczka --style dark --color #ffd166
```
