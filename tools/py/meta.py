# Photo helpers for Tellcut (run with the repo .venv: uv run python tellcut/tools/py/meta.py ...)
#   photo <path>                   -> JSON {"width","height","taken","offset","gps"} (size after EXIF orientation; offset: the EXIF zone of taken)
#   heic2jpg <in> <out>            -> writes an upright JPG (EXIF kept, orientation reset), prints the photo JSON of <out>
#   fit <in> <out> <maxW> <maxH>   -> writes an upright JPG inside maxW x maxH (never enlarged), prints {"width","height"}
import json
import sys

from PIL import Image, ImageOps
from pillow_heif import register_heif_opener

register_heif_opener()

ORIENTATION, DATETIME, EXIF_IFD, GPS_IFD, DATETIME_ORIGINAL = 274, 306, 0x8769, 0x8825, 36867
OFFSET_TIME, OFFSET_TIME_ORIGINAL = 36880, 36881


def _dms(v):
    return float(v[0]) + float(v[1]) / 60 + float(v[2]) / 3600


def _gps(exif):
    g = exif.get_ifd(GPS_IFD)
    if not g or 2 not in g or 4 not in g:
        return None
    lat, lon = _dms(g[2]), _dms(g[4])
    if g.get(1) == 'S':
        lat = -lat
    if g.get(3) == 'W':
        lon = -lon
    return [round(lat, 6), round(lon, 6)]


def _taken(exif):
    v = exif.get_ifd(EXIF_IFD).get(DATETIME_ORIGINAL) or exif.get(DATETIME)
    if not v:
        return None
    day, time = str(v).strip().split(' ')[:2]
    return f"{day.replace(':', '-')}T{time}"


def photo(path):
    im = Image.open(path)
    exif = im.getexif()
    w, h = im.size
    if exif.get(ORIENTATION) in (5, 6, 7, 8):
        w, h = h, w
    ifd = exif.get_ifd(EXIF_IFD)
    offset = ifd.get(OFFSET_TIME_ORIGINAL) or ifd.get(OFFSET_TIME)
    return {'width': w, 'height': h, 'taken': _taken(exif), 'offset': str(offset).strip() if offset else None, 'gps': _gps(exif)}


def heic2jpg(src, out):
    im = Image.open(src)
    exif = im.getexif()
    up = ImageOps.exif_transpose(im).convert('RGB')
    exif[ORIENTATION] = 1
    up.save(out, 'JPEG', quality=92, exif=exif.tobytes())
    return photo(out)


def fit(src, out, max_w, max_h):
    up = ImageOps.exif_transpose(Image.open(src)).convert('RGB')
    up.thumbnail((int(max_w), int(max_h)), Image.LANCZOS)
    up.save(out, 'JPEG', quality=90)
    return {'width': up.width, 'height': up.height}


if __name__ == '__main__':
    cmd, args = sys.argv[1], sys.argv[2:]
    print(json.dumps({'photo': photo, 'heic2jpg': heic2jpg, 'fit': fit}[cmd](*args)))
