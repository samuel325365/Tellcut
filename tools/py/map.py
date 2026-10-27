# A stitched map for Tellcut's `assets map`: JSON on stdin
#   {"out","width","height","background":"#rrggbb","tiles":[{"file"|null,"left","top","size"}],
#    "route"?:{"points":[[x,y]...],"color","width"},"pins"?:[[x,y]...],"attribution"}
# -> a JPEG. Tiles are scaled to their size and pasted (a null tile leaves the background); the route is drawn with a white edge,
# the pins as white-ringed dots, and the attribution near the bottom right corner on a dark box, as the sources' terms ask.
import json
import sys

from PIL import Image, ImageDraw

from cjkfont import cjk_font

spec = json.load(sys.stdin)
W, H = int(spec['width']), int(spec['height'])
pic = Image.new('RGB', (W, H), spec.get('background') or '#dddddd')
for t in spec['tiles']:
    if not t.get('file'):
        continue
    # both edges rounded, not the position and the size apart: at a fractional zoom that left 1 px seams of background
    x0, y0 = round(t['left']), round(t['top'])
    x1, y1 = round(t['left'] + t['size']), round(t['top'] + t['size'])
    tile = Image.open(t['file']).convert('RGB')
    if tile.size != (x1 - x0, y1 - y0):
        tile = tile.resize((max(1, x1 - x0), max(1, y1 - y0)), Image.LANCZOS)
    pic.paste(tile, (x0, y0))

draw = ImageDraw.Draw(pic)
route = spec.get('route')
if route and len(route['points']) > 1:
    pts = [tuple(p) for p in route['points']]
    w = int(route['width'])
    draw.line(pts, fill='white', width=w + 6, joint='curve')
    draw.line(pts, fill=route['color'], width=w, joint='curve')
dot_color = route['color'] if route else '#e5484d'
r = (int(route['width']) if route else max(6, round(min(W, H) / 90))) * 1.6
for x, y in spec.get('pins') or []:
    draw.ellipse((x - r - 3, y - r - 3, x + r + 3, y + r + 3), fill='white')
    draw.ellipse((x - r, y - r, x + r, y + r), fill=dot_color)

text = spec.get('attribution') or ''
if text:
    # 5 % in from the edges: a film pushes in on a map (c.photo zoom up to 1.1) and the credit must stay in the picture
    h = max(14, round(min(W, H) * 0.016))
    mx, my = max(h, round(W * 0.05)), max(h, round(H * 0.05))
    width = lambda s, f: draw.textlength(s, font=f)
    # a long credit (EOX's) on a small picture: a smaller font down to 10 px, then more lines — never off the left edge
    while True:
        font, pad = cjk_font(h), round(h * 0.4)
        room = W - 2 * mx - 2 * pad
        if width(text, font) <= room or h <= 10:
            break
        h -= 1
    lines, cur = [], ''
    for word in text.split(' '):
        if cur and width(f'{cur} {word}', font) > room:
            lines.append(cur)
            cur = word
        else:
            cur = f'{cur} {word}' if cur else word
    lines.append(cur)
    lh = round(h * 1.3)
    w = max(width(s, font) for s in lines)
    box = (W - mx - w - 2 * pad, H - my - lh * len(lines) - 2 * pad, W - mx, H - my)
    overlay = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(overlay).rectangle(box, fill=(0, 0, 0, 150))
    pic = Image.alpha_composite(pic.convert('RGBA'), overlay).convert('RGB')
    d = ImageDraw.Draw(pic)
    for k, s in enumerate(lines):
        d.text((box[2] - pad - width(s, font), box[1] + pad + k * lh), s, fill='white', font=font)

pic.save(spec['out'], 'JPEG', quality=92)
print(json.dumps({'width': W, 'height': H}))
