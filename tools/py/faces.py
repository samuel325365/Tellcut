# Faces in still frames for Tellcut (toolkit phase 5): python faces.py <model.task>   with JSON on stdin {"images": [path, …]}
# One JSON line per image: {"image", "faces": [{"box": [x, y, w, h], "mouth": [x, y], "mouthW": w}]} — all as fractions of the
# whole image, so the caller maps them through its own crop. MediaPipe Face Landmarker on the CPU (no GPU needed).
#
# The landmarker's face detector is a short-range one: a face under ~12 % of the picture's width (a person at a table in a
# 16:9 shot) is not found. So besides the whole picture it also looks at overlapping squares as tall as the picture, where the
# same face is ~1.8× larger, and merges what both find.
import json
import sys

import mediapipe as mp
import numpy as np
from mediapipe.tasks.python import vision
from mediapipe.tasks.python.core.base_options import BaseOptions
from PIL import Image

# lip landmarks of the 478-point face mesh: inner upper / lower lip, the two corners
UPPER, LOWER, LEFT, RIGHT = 13, 14, 61, 291


def windows(w, h):
    """The whole picture, then squares of the short side, half overlapping, along the long side: (x, y, size_x, size_y)."""
    out = [(0, 0, w, h)]
    side = min(w, h)
    if max(w, h) > side * 1.2:
        steps = max(2, round(max(w, h) / side * 2) - 1)
        for i in range(steps):
            off = round(i * (max(w, h) - side) / (steps - 1))
            out.append((off, 0, side, side) if w > h else (0, off, side, side))
    return out


def face_of(pts, ox, oy, sw, sh, w, h):
    """A face from landmarks in a window, as fractions of the whole picture."""
    xs, ys = [(ox + p.x * sw) / w for p in pts], [(oy + p.y * sh) / h for p in pts]
    x0, y0, x1, y1 = max(0.0, min(xs)), max(0.0, min(ys)), min(1.0, max(xs)), min(1.0, max(ys))
    at = lambda i: ((ox + pts[i].x * sw) / w, (oy + pts[i].y * sh) / h)
    (lx, ly), (rx, ry), (ux, uy), (dx, dy) = at(LEFT), at(RIGHT), at(UPPER), at(LOWER)
    return {'box': [round(x0, 4), round(y0, 4), round(x1 - x0, 4), round(y1 - y0, 4)],
            'mouth': [round((lx + rx + ux + dx) / 4, 4), round((ly + ry + uy + dy) / 4, 4)],
            'mouthW': round(((rx - lx) ** 2 + (ry - ly) ** 2) ** 0.5, 4)}


def same(a, b):
    """The same face seen from two windows: mouths closer than half the smaller face's width."""
    d = ((a['mouth'][0] - b['mouth'][0]) ** 2 + (a['mouth'][1] - b['mouth'][1]) ** 2) ** 0.5
    return d < 0.5 * min(a['box'][2], b['box'][2])


def main(model):
    spec = json.load(sys.stdin)
    options = vision.FaceLandmarkerOptions(base_options=BaseOptions(model_asset_path=model), running_mode=vision.RunningMode.IMAGE,
                                           num_faces=4, min_face_detection_confidence=0.5)
    with vision.FaceLandmarker.create_from_options(options) as landmarker:
        for path in spec['images']:
            rgb = np.asarray(Image.open(path).convert('RGB'))
            h, w = rgb.shape[:2]
            faces = []
            for ox, oy, sw, sh in windows(w, h):
                tile = np.ascontiguousarray(rgb[oy:oy + sh, ox:ox + sw])
                for pts in landmarker.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=tile)).face_landmarks:
                    f = face_of(pts, ox, oy, sw, sh, w, h)
                    if not any(same(f, g) for g in faces):
                        faces.append(f)
            print(json.dumps({'image': path, 'faces': faces}), flush=True)


if __name__ == '__main__':
    main(sys.argv[1])
