# mealdb: recipes (TheMealDB)

Recipes and finished-dish photos of home cooking from many countries: ingredients and quantities, method, category, region, and often a link to a demo video. Uses the site's public test key (no sign-up). The data is in English; the photos are © TheMealDB; credits are added automatically.

## How to search

- Use **English** dish names or ingredients: `ramen`, `curry`, `pancakes`, `salmon`, `tofu`.
- Dish names are searched first; if nothing is found, it looks for "dishes that use this ingredient".
- Dish photos are about 700×700, good as a card or one cell of a split screen.

## Looking up data

`assets data mealdb <dish>`: category, region, tags, ingredients (with quantities), method (up to about 1,200 words), demo video link. If the dish isn't found, it lists dishes that use this ingredient. For a food film's "how it's made" or "what you need", look it up first; don't go from memory.

## Using a download

- The id is a number: `mealdb:53383`.
- Saved as `media/mealdb/mealdb-<id>.jpg` and registered as a photo; use `c.photo('<media id>', …)`.

## Examples

```
npm run tellcut -- assets search ramen --source mealdb
npm run tellcut -- assets data mealdb "Chicken Karaage"
```

## Pitfalls

- Not much data (a few hundred dishes); Taiwanese street food is mostly missing. If nothing is found, use the user's footage or Wikimedia.
- The method is the English original; rewrite it for the voice-over. Quantities mix metric and imperial units.
