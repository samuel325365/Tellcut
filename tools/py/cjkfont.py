# A font that can write Chinese, for the pictures Tellcut makes with Pillow (contact sheets, maps).
import os

from PIL import ImageFont

WINDOWS = [f'C:/Windows/Fonts/{name}' for name in
           ('msjh.ttc', 'msjhl.ttc', 'msyh.ttc', 'mingliu.ttc', 'simsun.ttc', 'YuGothM.ttc', 'meiryo.ttc', 'malgun.ttf')]
# a Mac's: a Mac found none of the Windows ones and wrote its labels in Pillow's tiny Latin-only font
MAC = ['/System/Library/Fonts/PingFang.ttc', '/System/Library/Fonts/Hiragino Sans GB.ttc', '/System/Library/Fonts/STHeiti Medium.ttc',
       '/System/Library/Fonts/STHeiti Light.ttc', '/System/Library/Fonts/Supplemental/Songti.ttc', '/Library/Fonts/Arial Unicode.ttf']
LINUX = ['/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc', '/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc']


def cjk_font(size):
    """The first CJK font this computer has (Windows, macOS, Linux; labels can be Chinese); Pillow's own font otherwise (Latin only),
    at `size` where this Pillow can scale it."""
    for path in WINDOWS + MAC + LINUX:
        if not os.path.exists(path):
            continue
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    try:
        return ImageFont.load_default(size)
    except TypeError:   # a Pillow before 10.1: one size only
        return ImageFont.load_default()
