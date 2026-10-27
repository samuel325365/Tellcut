# maps: maps (no key needed)

Makes a stitched map from a place name or coordinates, optionally with a route and start/end markers, and registers it as a photo. The credit is printed in the image's bottom-right corner and also written to `media/CREDITS.md`.

## Basemaps

| `--style` | Taiwan | Outside Taiwan |
|---|---|---|
| `street` (default) | Taiwan e-Map (NLSC, to z19, Traditional Chinese place names) | Carto street map (the separate `carto` source, needs a key) |
| `satellite` | NLSC orthophotos (to z19, street blocks visible) | EOX satellite (Sentinel-2, finest z16: city outlines visible, blocks blurry) |
| `light`/`dark` | Carto (needs a key) | Carto (needs a key) |

EOX is CC BY-NC-SA 4.0 (non-commercial); NLSC is under the Open Government Data License.

## Place names and routes

- **Place names in Taiwan in Chinese** (`台北101`, `九份老街`). **Outside Taiwan, in English or the local spelling** (`Kraków`, `Budva`, `Wieliczka`): the geocoder doesn't know Chinese translations like 「克拉科夫」.
- Many places share a name (「中山」 first finds Yokohama in Japan): the output says which one it used and lists the other candidates; if it's wrong, give coordinates `lat,lon` directly.
- Look up coordinates: `npm run tellcut -- assets data maps <place>`.
- Routes are driving routes (OSRM). For flights, ferries and sea crossings use `--mode straight`, which joins start and end with a straight line.

## Examples

```
npm run tellcut -- assets map <project> --at 台北101
npm run tellcut -- assets map <project> --at 台北101 --style satellite
npm run tellcut -- assets map <project> --from 台北101 --to 台北車站
npm run tellcut -- assets map <project> --from Kraków --to Budva --mode straight --style satellite
```

Put it on the timeline with `c.photo('<output id>', { len: 4, zoom: [1, 1.08] })` for a slow push-in.

## Pitfalls

- At most 3,000 tiles downloaded per film (reused tiles don't count; failed downloads are given back). One 1080×1920 map takes about 40–110 tiles (more when the zoom isn't a whole number; Carto's tiles are large, about 12–30).
- Satellite images blur when zoomed to street level; the output warns you.
- The text on the map belongs to the basemap; add the titles and place names the film needs with blocks on top.
- Without `--zoom` it is chosen automatically: a place's extent for one location, the whole route in frame for a route.
