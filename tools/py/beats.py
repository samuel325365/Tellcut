# Beat tracking for Tellcut: python beats.py <mono float32 little-endian raw at 11025 Hz>
# -> JSON {"bpm","offset","beats"}: spectral-flux onsets, tempo by autocorrelation (60-200 BPM, prefers ~120),
# beats by dynamic programming (Ellis 2007).
import json
import sys

import numpy as np

SR, HOP, WIN = 11025, 128, 1024


def onset_env(x):
    n = 1 + max(0, (len(x) - WIN) // HOP)
    idx = np.arange(WIN)[None, :] + HOP * np.arange(n)[:, None]
    frames = x[np.minimum(idx, len(x) - 1)] * np.hanning(WIN)
    mag = np.log1p(100 * np.abs(np.fft.rfft(frames, axis=1)))
    flux = np.concatenate([[0.0], np.maximum(0, np.diff(mag, axis=0)).sum(axis=1)])
    k = int(SR / HOP * 0.5)
    flux = np.maximum(0, flux - np.convolve(flux, np.ones(2 * k + 1) / (2 * k + 1), mode='same'))
    return flux / (flux.std() + 1e-9)


def tempo(o):
    fps = SR / HOP
    lags = np.arange(int(fps * 60 / 200), int(fps * 60 / 60) + 1)
    ac = np.array([np.dot(o[:-l], o[l:]) for l in lags]) / len(o)
    w = np.exp(-0.5 * (np.log2((60 * fps / lags) / 120) / 0.9) ** 2)
    s = ac * w
    i = int(np.argmax(s))
    d = 0.0
    if 0 < i < len(lags) - 1:
        a, b, c = s[i - 1], s[i], s[i + 1]
        d = 0.5 * (a - c) / (a - 2 * b + c + 1e-12)
    return lags[i] + d


def track(o, period, alpha=100.0):
    n = len(o)
    score, back = o.copy(), -np.ones(n, dtype=int)
    lo, hi = max(1, int(round(period / 2))), int(round(period * 2))
    for t in range(hi, n):
        prev = np.arange(t - hi, t - lo + 1)
        pen = -alpha * np.log((t - prev) / period) ** 2
        j = int(np.argmax(score[prev] + pen))
        score[t] = o[t] + score[prev[j]] + pen[j]
        back[t] = prev[j]
    p = int(round(period))
    t = int(np.argmax(score[-p:])) + n - p
    out = []
    while t >= 0:
        out.append(t)
        t = back[t]
    return np.array(out[::-1])


if __name__ == '__main__':
    x = np.fromfile(sys.argv[1], dtype='<f4')
    o = onset_env(x)
    period = tempo(o)
    bpm = 60 * SR / HOP / period
    beats = track(o, period) * HOP / SR if len(o) > 4 * period else np.array([])
    print(json.dumps({'bpm': round(float(bpm), 1), 'offset': round(float(beats[0]), 3) if len(beats) else 0,
                      'beats': [round(float(b), 3) for b in beats]}))
