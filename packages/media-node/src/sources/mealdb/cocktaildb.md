# cocktaildb: cocktails (TheCocktailDB)

Cocktail recipes and photos of the finished drinks: ingredients and quantities, method, glass, alcoholic or not. Uses the site's public test key (no sign-up). The data is in English; the photos are © TheCocktailDB; credits are added automatically.

## How to search

- Use **English** drink names or ingredients: `margarita`, `mojito`, `negroni`, `gin`, `rum`.
- Drink names are searched first; if nothing is found, it looks for "cocktails that use this ingredient".
- Drink photos are about 700×700, good as a card or one cell of a split screen.

## Looking up data

`assets data cocktaildb <drink>`: category, alcoholic or not, glass, ingredients (with quantities), method. If the drink isn't found, it lists cocktails that use this ingredient.

## Using a download

- The id is a number: `cocktaildb:11007`.
- Saved as `media/cocktaildb/cocktaildb-<id>.jpg` and registered as a photo; use `c.photo('<media id>', …)`.

## Examples

```
npm run tellcut -- assets search margarita --source cocktaildb
npm run tellcut -- assets data cocktaildb Negroni
```

## Pitfalls

- Alcohol content: avoid it in films meant for under-age viewers.
- The method is the English original; rewrite it for the voice-over.
