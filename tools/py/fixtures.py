# Generated test photos for Tellcut (never real footage). The stored pixels are left half red, right half blue,
# so an orientation mistake shows: with Orientation=6 the upright picture is red on top, blue at the bottom.
#   jpg  <out> <w> <h> <orientation> <taken "YYYY:MM:DD HH:MM:SS" | -> [lat lon] [offset=+08:00]
#   heic <out> <w> <h> <taken | ->
import sys

from PIL import Image
from pillow_heif import register_heif_opener

register_heif_opener()


def _img(w, h):
    im = Image.new('RGB', (w, h), (210, 30, 30))
    im.paste((30, 30, 210), (w // 2, 0, w, h))
    return im


def _exif(im, orientation, taken, lat=None, lon=None, offset=None):
    exif = im.getexif()
    exif[274] = orientation
    if taken != '-':
        exif[306] = taken
        exif[0x8769] = {36867: taken, **({36881: offset} if offset else {})}
    if lat is not None:
        exif[0x8825] = {1: 'N' if lat >= 0 else 'S', 2: (abs(lat), 0.0, 0.0), 3: 'E' if lon >= 0 else 'W', 4: (abs(lon), 0.0, 0.0)}
    return exif


if __name__ == '__main__':
    kind, out, w, h = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
    if kind == 'jpg':
        orientation, taken = int(sys.argv[5]), sys.argv[6]
        rest = sys.argv[7:]
        offset = next((a.split('=', 1)[1] for a in rest if a.startswith('offset=')), None)
        nums = [float(a) for a in rest if not a.startswith('offset=')]
        gps = (nums[0], nums[1]) if len(nums) == 2 else (None, None)
        im = _img(w, h)
        im.save(out, 'JPEG', quality=90, exif=_exif(im, orientation, taken, *gps, offset=offset).tobytes())
    else:
        taken = sys.argv[5]
        im = _img(w, h)
        im.save(out, 'HEIF', exif=_exif(im, 1, taken).tobytes())
