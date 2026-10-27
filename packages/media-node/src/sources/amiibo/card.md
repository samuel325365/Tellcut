# amiibo: Nintendo characters (AmiiboAPI)

The database of Nintendo amiibo: about 900 figures and cards, with characters from Mario, Zelda, Pokémon, Splatoon, Animal Crossing and Super Smash Bros. Each one has a **cut-out image** (a front shot of the figure). The images are © Nintendo; credits are added automatically.

## How to search

- Use **English**: a character name (`Link`, `Kirby`), an amiibo name (`Yoshi - Golf`), a game series (`Splatoon`, `Animal Crossing`). Name, character and game series are matched in that order; the first that matches gives the results.
- A character often has several versions (different series, different looks): pick from the contact sheet.

## Looking up data

`assets data amiibo <name>`: one line per amiibo, with the character, game series, amiibo series, type (figure, card, yarn), earliest release date and number. Use it for films like "how many amiibo a character has" or "a release timeline".

## Using a download

- The id is 16 hex digits (`amiibo:0100000000040002`).
- Saved as `media/amiibo/amiibo-<id>.png` and registered as a photo; use `c.photo('<media id>', …)`. Put the cut-out image on a layout with a background.
- The images are about 500 px tall: use them at card or character-portrait size, don't blow them up to full screen.

## Examples

```
npm run tellcut -- assets search Kirby --source amiibo
npm run tellcut -- assets data amiibo Splatoon
npm run tellcut -- assets get <project> amiibo:0100000000040002
```

## Pitfalls

- Only the characters and looks that exist as amiibo; for in-game screens and scenes use another source (game wikis, Steam).
- In 2026 the API moved from amiiboapi.com to amiiboapi.org; if it moves again, this source shows as broken in `npm run sources`.
