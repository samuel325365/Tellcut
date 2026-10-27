# hp-api: Harry Potter (HP-API + PotterDB)

Harry Potter characters and spells. Two key-free sources combined: **HP-API** (characters' house, patronus, wand, actor, and a list of spells) and **PotterDB** (character images and spell details collected from the Harry Potter Wiki: incantation, effect, light colour). The images are film stills and wiki images, © Warner Bros.; credits are added automatically.

## How to search

- Use **English** names: `Hermione`, `Dumbledore`, `Dobby`, `Hedwig`. Actor names work too (`Radcliffe`).
- Results list HP-API's film costume shots first (main characters only, about 25), then PotterDB's wiki images (most characters have one). The same person may appear twice: pick one.
- Animated GIFs never appear in the results.

## Looking up data

`assets data hp-api <name or spell>`:
- Characters: house, species, ancestry, birthday, patronus, wand (wood, core, length), actor, whether alive; characters HP-API doesn't have come from PotterDB (born, died, titles, wiki URL).
- Spells: incantation (with pronunciation), official name, effect, category, light colour, creator. Both `Expelliarmus` and `Disarming` work.
- The data is in English; rewrite it for the voice-over. Look up official translated names (for example 「去去，武器走」) yourself; don't guess.

## Using a download

- Ids: `hp-api:hp-<uuid>` (HP-API image) or `hp-api:pdb-<uuid>` (PotterDB image); copy them from the search results.
- Saved as `media/hp-api/hp-api-<id>.jpg` (wiki images are often `.webp`) and registered as a photo; use `c.photo('<media id>', …)`.
- Wiki images vary in size; those under 1080 are only good at card size.

## Examples

```
npm run tellcut -- assets search Hermione --source hp-api
npm run tellcut -- assets data hp-api Expelliarmus
npm run tellcut -- assets data hp-api Snape
```

## Pitfalls

- HP-API runs on a free host: the first request after it has been idle takes a few extra seconds.
- Spells themselves have no images; make the spell visuals with an fx of your own (use the light colour from the data).
