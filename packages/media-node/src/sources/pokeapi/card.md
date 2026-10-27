# pokeapi: Pokémon

Data and images for all 1,000+ Pokémon. The images are **cut-out PNGs** that can go straight onto backgrounds, cards and ranking layouts. Names and images are © Nintendo/Creatures/GAME FREAK; credits are added automatically. For monetised films, judge for yourself.

## How to search

- **Chinese, English or Japanese names, or the Pokédex number all work**: `皮卡丘`, `Pikachu`, `ピカチュウ`, `25`. Part of a name works too (`妙蛙` finds Bulbasaur, Ivysaur and Venusaur).
- One hit per Pokémon; the official artwork by default (about 475×475).
- `--opt style=home`: the HOME 3D image instead (512×512).
- `--opt shiny=true`: the shiny version.

## Looking up data

`assets data pokeapi <name or number>`: Traditional Chinese name (with English and Japanese), category, types, height and weight, base stats and total, abilities (including hidden ones), evolution family, generation, capture rate, whether legendary or mythical, and a Pokédex entry in Traditional Chinese. Look it up before voice-over for rankings, comparisons or trivia; don't quote numbers from memory.

## Using a download

- Ids: `pokeapi:25` official artwork, `pokeapi:25-home` HOME 3D image; add `-shiny` for the shiny version (`pokeapi:25-home-shiny`).
- Saved as `media/pokeapi/pokeapi-<id>.png` and registered as a photo; use `c.photo('<media id>', …)`. Put the cut-out image on a layout with a background (for example a colour layer or `common.backdrop` first), not straight in as a full-screen picture.
- The images are only 475–512 px and blur at full screen: use them at card or character-portrait size.

## Examples

```
npm run tellcut -- assets data pokeapi 噴火龍
npm run tellcut -- assets search 伊布 --source pokeapi
npm run tellcut -- assets get <project> pokeapi:6-home
```

## Pitfalls

- Only each species' default form; Mega Evolutions, regional forms and other forms aren't here.
- The name index is kept for 30 days (PokeAPI asks for local caching; refetching often gets you blocked), so Pokémon from a new generation appear within 30 days at the latest.
