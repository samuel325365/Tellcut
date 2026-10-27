# countries: country data

Every country's flag and basic facts. The flags are public-domain PNGs (2560 wide, fine at full screen); the data comes from the mledoze/countries dataset (ODbL) and the World Bank (population), with country names in Taiwan's usage (紐西蘭, 南韓, 蒙特內哥羅).

## How to search

- **Chinese, English or Japanese names, or country codes all work**: `日本`, `Japan`, `JP`, `JPN`, `蒙特內哥羅`, `Montenegro`.
- Part of a name works too (`尼` finds many; pick from the results).

## Looking up data

`assets data countries <country>`: Traditional Chinese name, English and official names, capital, region, whether it is landlocked, population (latest World Bank year), area, languages, currencies (Traditional Chinese name, code, symbol), neighbours, centre coordinates. Look it up before a travel film's "country profile" opening or a comparison of numbers.

## Using a download

- The id is the two-letter country code: `countries:jp`.
- Saved as `media/countries/countries-jp.png` and registered as a photo; use `c.photo('<media id>', …)`. Flags are rectangles: in a 9:16 film frame them in a layout, don't force them to fill the screen.

## Examples

```
npm run tellcut -- assets data countries 蒙特內哥羅
npm run tellcut -- assets get <project> countries:me
```

## Pitfalls

- Taiwan isn't in the World Bank data: the population says 「沒有資料」 (no data); look it up elsewhere (for example `assets data wikimedia 臺灣`).
- Capitals and language names are the dataset's English originals; translate them yourself for the voice-over.
- The dataset is kept for 30 days; country names and flags rarely change, so this doesn't matter.
