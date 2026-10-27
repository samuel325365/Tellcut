// Web Mercator for stitched maps (spec 2026-10-22-external-sources §5 maps): where a place falls at a zoom, the zoom that fits a set
// of places into a picture, and which tiles a picture needs and where each one goes. "World pixels" count 256 px tiles: at zoom z
// the world is 256·2^z px wide. Zooms may be fractional; tiles are fetched at the next whole level and drawn smaller.

/** longitude, latitude (the CLI reads "lat,lon" and turns it around) */
export type LonLat = [number, number];
export interface View { center: LonLat; zoom: number; width: number; height: number }
export interface TileNeed { z: number; x: number; y: number; /** where its top-left goes in the picture, px */ left: number; top: number; /** its drawn size, px */ size: number }

const MAX_LAT = 85.0511;

export function project([lon, lat]: LonLat, z: number): [number, number] {
  const world = 256 * 2 ** z, s = Math.sin((Math.max(-MAX_LAT, Math.min(MAX_LAT, lat)) * Math.PI) / 180);
  return [((lon + 180) / 360) * world, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * world];
}

function unproject([x, y]: [number, number], z: number): LonLat {
  const world = 256 * 2 ** z, n = Math.PI - (2 * Math.PI * y) / world;
  return [(x / world) * 360 - 180, (180 / Math.PI) * Math.atan(Math.sinh(n))];
}

/** Longitudes made continuous along the list: a step of more than 180° goes the short way round (lon ± 360), so a line across the
 *  date line is fitted and drawn over the Pacific, not around the world. project() takes longitudes past ±180 as they are. */
export function unwrap(points: LonLat[]): LonLat[] {
  const out: LonLat[] = [];
  for (const [lon, lat] of points) {
    let x = lon;
    const prev = out[out.length - 1]?.[0];
    if (prev !== undefined) while (x - prev > 180) x -= 360;
    if (prev !== undefined) while (prev - x > 180) x += 360;
    out.push([x, lat]);
  }
  return out;
}

/** The largest zoom (two decimals) at which all points fit with `pad` of the picture left free on each side; one point: maxZoom. */
export function fitZoom(points: LonLat[], width: number, height: number, o: { pad?: number; maxZoom?: number } = {}): { center: LonLat; zoom: number } {
  const pad = o.pad ?? 0.15, maxZoom = o.maxZoom ?? 18, at0 = points.map((p) => project(p, 0));
  const xs = at0.map((p) => p[0]), ys = at0.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const fit = Math.min((width * (1 - 2 * pad)) / (x1 - x0 || 1e-12), (height * (1 - 2 * pad)) / (y1 - y0 || 1e-12));
  const zoom = Math.min(maxZoom, Math.floor(Math.log2(fit) * 100) / 100);
  return { center: unproject([(x0 + x1) / 2, (y0 + y1) / 2], 0), zoom };
}

/** points as pixels of the picture */
export function toPixels(points: LonLat[], v: View): Array<[number, number]> {
  const [cx, cy] = project(v.center, v.zoom);
  return points.map((p) => { const [x, y] = project(p, v.zoom); return [x - cx + v.width / 2, y - cy + v.height / 2]; });
}

/** The tiles of `layer` that cover the picture: fetched at the next whole level (one lower for 512 px tiles), or the layer's last
 *  level drawn bigger (upscaled) when the view is closer than the layer goes. x wraps around the date line; rows past a pole are left out. */
export function tilesFor(v: View, layer: { tileSize: 256 | 512; maxZoom: number }): { tiles: TileNeed[]; tileZoom: number; upscaled: boolean } {
  const k = Math.log2(layer.tileSize / 256), tileZoom = Math.max(0, Math.min(layer.maxZoom, Math.ceil(v.zoom - k - 1e-9)));
  const size = layer.tileSize * 2 ** (v.zoom - k - tileZoom), n = 2 ** tileZoom;
  const [cx, cy] = project(v.center, v.zoom), left0 = cx - v.width / 2, top0 = cy - v.height / 2;
  const tiles: TileNeed[] = [];
  for (let ty = Math.floor(top0 / size); ty * size < top0 + v.height; ty++) {
    if (ty < 0 || ty >= n) continue;
    for (let tx = Math.floor(left0 / size); tx * size < left0 + v.width; tx++) {
      tiles.push({ z: tileZoom, x: ((tx % n) + n) % n, y: ty, left: tx * size - left0, top: ty * size - top0, size });
    }
  }
  return { tiles, tileZoom, upscaled: size > layer.tileSize + 1e-9 };
}
