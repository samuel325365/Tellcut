# Photo helpers for Tellcut (run with the repo .venv: uv run python tellcut/tools/py/meta.py ...)
#   photo <path>                   -> JSON {"width","height","taken","offset","gps"} (size after EXIF orientation; offset: the EXIF zone of taken)
#   heic2jpg <in> <out>            -> writes an upright JPG (EXIF kept, orientation reset), prints the photo JSON of <out>
#   strip <in> <out>               -> writes the photo upright with no EXIF/XMP/comment, same format, prints the photo JSON of <out>
#   fit <in> <out> <maxW> <maxH>  -> writes an upright JPG inside maxW x maxH (never enlarged), prints {"width","height"}
import json
import math
import re
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
    try:
        lat, lon = _dms(g[2]), _dms(g[4])
    except (ArithmeticError, TypeError, ValueError, IndexError):
        return None
    # a camera with no fix writes 0/0 rationals: NaN, which is no place (and not JSON)
    if not (math.isfinite(lat) and math.isfinite(lon)):
        return None
    if g.get(1) == 'S':
        lat = -lat
    if g.get(3) == 'W':
        lon = -lon
    return [round(lat, 6), round(lon, 6)]


# EXIF writes "YYYY:MM:DD HH:MM:SS"; some apps write it ISO-style ("2023-05-01T12:00:00"); an unset one is blank or all zeros
TAKEN = re.compile(r'(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})')


def _taken(exif):
    v = exif.get_ifd(EXIF_IFD).get(DATETIME_ORIGINAL) or exif.get(DATETIME)
    m = TAKEN.search(str(v)) if v else None
    # none: the file's time is guessed from elsewhere (its modification time)
    if not m or int(m[1]) == 0 or int(m[2]) == 0 or int(m[3]) == 0:
        return None
    return f"{m[1]}-{m[2]}-{m[3]}T{m[4]}:{m[5]}:{m[6]}"


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


def strip(src, out):
    # A photo for a public export: no EXIF, XMP or comment (where and when it was taken, the camera), in its own format.
    # Upright, as the EXIF orientation showed it, so it looks the same with the tag gone; the colour profile stays, or a
    # wide-gamut phone photo would come out duller. An upright JPEG keeps its quantisation tables (next to no loss).
    im = Image.open(src)
    fmt = 'JPEG' if im.format in ('JPEG', 'MPO') else im.format
    turned = im.getexif().get(ORIENTATION, 1) not in (None, 1)
    up = ImageOps.exif_transpose(im) if turned else im
    icc = {'icc_profile': im.info['icc_profile']} if im.info.get('icc_profile') else {}
    if fmt == 'JPEG':
        up.save(out, 'JPEG', quality=95 if turned else 'keep', exif=b'', comment=b'', **icc)
    elif fmt == 'PNG':
        up.save(out, 'PNG', **icc)
    elif fmt == 'WEBP':
        up.save(out, 'WEBP', quality=95, exif=b'', xmp=b'', **icc)
    elif fmt in ('HEIF', 'AVIF'):
        up.save(out, fmt, quality=95, exif=None, xmp=None, **icc)
    else:
        raise ValueError(f'cannot strip a {im.format} picture')
    return photo(out)


def fit(src, out, max_w, max_h):
    up = ImageOps.exif_transpose(Image.open(src)).convert('RGB')
    up.thumbnail((int(max_w), int(max_h)), Image.LANCZOS)
    up.save(out, 'JPEG', quality=90)
    return {'width': up.width, 'height': up.height}


if __name__ == '__main__':
    cmd, args = sys.argv[1], sys.argv[2:]
    print(json.dumps({'photo': photo, 'heic2jpg': heic2jpg, 'strip': strip, 'fit': fit}[cmd](*args), allow_nan=False))
