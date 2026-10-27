# A font that can write Chinese, for the pictures Tellcut makes with Pillow (contact sheets, maps).
from PIL import ImageFont


def cjk_font(size):
    """The first Windows CJK font this PC has (labels can be Chinese); Pillow's own font otherwise (Latin only)."""
    for name in ('msjh.ttc', 'msjhl.ttc', 'msyh.ttc', 'mingliu.ttc', 'simsun.ttc', 'YuGothM.ttc', 'meiryo.ttc', 'malgun.ttf'):
        try:
            return ImageFont.truetype(f'C:/Windows/Fonts/{name}', size)
        except OSError:
            continue
    return ImageFont.load_default()
