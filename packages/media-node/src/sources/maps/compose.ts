// The stitching itself is Pillow's (tools/py/map.py): Tellcut has no canvas library in Node, and adds no native dependency for maps.
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { runPy } from '../../py.ts';

export interface MapSpec {
  out: string; width: number; height: number; background: string;
  tiles: Array<{ file: string | null; left: number; top: number; size: number }>;
  route?: { points: Array<[number, number]>; color: string; width: number };
  pins?: Array<[number, number]>;
  /** printed in the bottom right corner */
  attribution: string;
}

/** the map as a JPEG at `spec.out` */
export async function composeMap(spec: MapSpec): Promise<string> {
  mkdirSync(dirname(spec.out), { recursive: true });
  await runPy('map.py', [], { input: JSON.stringify(spec) });
  return spec.out;
}
