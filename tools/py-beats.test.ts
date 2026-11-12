// tools/py/beats.py's onset envelope: worked out in blocks of frames, so its memory no longer grows with the music's length
// (the whole file's frame matrix took about 134 MB a minute), with the same result as the whole matrix at once
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PY_DIR, PY_PROJECT, runUv } from '@tellcut/media-node';

const dir = mkdtempSync(join(tmpdir(), 'py-beats-'));

// the envelope as it was made before (the whole matrix), against the block version on noise of a few lengths: shorter than one
// window, one block exactly, and several blocks with a ragged end; then the peak memory of 10 minutes of noise (tracemalloc
// sees numpy's arrays)
const script = String.raw`
import json, sys, tracemalloc
import numpy as np
sys.path.insert(0, sys.argv[1])
from beats import onset_env, SR, HOP, WIN

def whole(x):
    n = 1 + max(0, (len(x) - WIN) // HOP)
    idx = np.arange(WIN)[None, :] + HOP * np.arange(n)[:, None]
    frames = x[np.minimum(idx, len(x) - 1)] * np.hanning(WIN)
    mag = np.log1p(100 * np.abs(np.fft.rfft(frames, axis=1)))
    flux = np.concatenate([[0.0], np.maximum(0, np.diff(mag, axis=0)).sum(axis=1)])
    k = int(SR / HOP * 0.5)
    flux = np.maximum(0, flux - np.convolve(flux, np.ones(2 * k + 1) / (2 * k + 1), mode='same'))
    return flux / (flux.std() + 1e-9)

rng = np.random.default_rng(7)
same = []
for n in [WIN + HOP * 90, WIN + HOP * 2047, SR * 75 + 37]:
    x = rng.standard_normal(n).astype('<f4') * 0.3
    a, b = whole(x), onset_env(x, block=64)
    same.append(bool(a.shape == b.shape and np.allclose(a, b, rtol=0, atol=1e-9)))
# under a second (fewer frames than the 1 s smoothing window): the whole matrix failed to broadcast; now one value per frame
short = [len(onset_env(rng.standard_normal(n).astype('<f4'))) for n in [500, SR // 2]]
x = (rng.standard_normal(SR * 600) * 0.3).astype('<f4')
tracemalloc.start()
onset_env(x)
peak = tracemalloc.get_traced_memory()[1]
print(json.dumps({'same': same, 'short': short, 'peakMB': peak / 2**20}))
`;

test('beats: the onset envelope is the same in blocks, a sound under a second has one, and 10 minutes of music take well under 200 MB', async () => {
  const py = join(dir, 'check_beats.py');
  writeFileSync(py, script);
  const out = JSON.parse(await runUv(['run', '--project', PY_PROJECT, '--quiet', 'python', py, PY_DIR]));
  expect(out.same).toEqual([true, true, true]);
  expect(out.short).toEqual([1, 1 + Math.floor((11025 / 2 - 1024) / 128)]);
  expect(out.peakMB).toBeLessThan(200);
}, 180000);
