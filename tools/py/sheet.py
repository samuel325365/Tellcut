# Contact sheet for Tellcut: JSON on stdin {"out","cols","cellW","cells":[{"img","label"}]} -> a labelled JPG grid.
# Optional: "cellH" fixes the cell box (images fit inside it; otherwise cells are as tall as the tallest image needs),
# "maxCellH" caps that height (a very tall image is shrunk to fit), "img": null leaves a cell blank, "rowLabels" + "rowLabelW" add a left column with one (wrapped) label per row.
import json
import sys

from PIL import Image, ImageDraw, ImageOps

from cjkfont import cjk_font

spec = json.load(sys.stdin)
cols, cw = int(spec['cols']), int(spec['cellW'])
cells = [ImageOps.exif_transpose(Image.open(c['img'])).convert('RGB') if c.get('img') else None for c in spec['cells']]
ch = int(spec['cellH']) if spec.get('cellH') else max([int(cw * im.height / im.width) for im in cells if im] or [cw])
if spec.get('maxCellH'):
    ch = min(ch, int(spec['maxCellH']))
row_labels = spec.get('rowLabels') or []
lw = int(spec.get('rowLabelW') or 0) if row_labels else 0
pad, lab = 6, 28
rows = max(1, (len(cells) + cols - 1) // cols)
sheet = Image.new('RGB', (lw + cols * (cw + pad) + pad, rows * (ch + lab + pad) + pad), (20, 20, 22))
font = cjk_font(18)
draw = ImageDraw.Draw(sheet)


def wrap(text, width):
    """Lines of `text` no wider than `width` px (breaks anywhere: ids and CJK have no spaces)."""
    lines, cur = [], ''
    for chr_ in text:
        if chr_ == '\n' or (cur and draw.textlength(cur + chr_, font=font) > width):
            lines.append(cur)
            cur = '' if chr_ == '\n' else chr_
        else:
            cur += chr_
    return lines + [cur] if cur else lines


for r, text in enumerate(row_labels[:rows]):
    y = pad + r * (ch + lab + pad)
    for k, line in enumerate(wrap(str(text), lw - 2 * pad)[: max(1, (ch + lab) // 24)]):
        draw.text((pad, y + 4 + k * 24), line, fill=(235, 235, 235), font=font)
for i, (im, c) in enumerate(zip(cells, spec['cells'])):
    x, y = lw + pad + (i % cols) * (cw + pad), pad + (i // cols) * (ch + lab + pad)
    if im:
        im.thumbnail((cw, ch))
        sheet.paste(im, (x + (cw - im.width) // 2, y + (ch - im.height) // 2))
    if c.get('label'):
        draw.text((x + 4, y + ch + 4), c['label'], fill=(235, 235, 235), font=font)
sheet.save(spec['out'], 'JPEG', quality=85)
print(json.dumps({'width': sheet.width, 'height': sheet.height}))
