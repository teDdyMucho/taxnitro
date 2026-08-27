"""Turn each client's logo into a card-shaped background.

The logos are roughly square; the row they sit behind is about eight times wider
than it is tall. Filling the row with the logo itself crops it to a horizontal
slice — "1st Step to Greatness" loses everything but the middle of the words.

So the logo is placed on a canvas the shape of the row instead: held at the right,
sized to the row's height, with the space to its left transparent and the logo's
own left edge faded out. The result covers the row without being cropped, and
dissolves toward the text rather than stopping at a line.

Transparency is used rather than a white wash, so the same file works whatever
the card is painted.

  python scripts/make-card-backgrounds.py
"""
import os
import sys
from PIL import Image

sys.stdout.reconfigure(encoding='utf-8')

SRC = os.path.join('assets', 'clients')

# The canvas is a fixed shape and the card panel is given the same shape, so the
# image is never cropped at any screen width — the panel's width follows the
# row's height. Wide enough for the mark to read, narrow enough to leave the
# name and the button room on a phone.
W, H = 700, 260           # 2.7 : 1
LOGO_H = 0.80             # of the canvas height
RIGHT_PAD = 0.05          # of the canvas width
FADE_FROM, FADE_TO = 0.02, 0.42   # clear left of this, full strength right of it


def ramp() -> Image.Image:
    """Left-to-right: 0 up to FADE_FROM, rising to 255 by FADE_TO."""
    lo, hi = int(W * FADE_FROM), int(W * FADE_TO)
    row = [
        0 if x <= lo else 255 if x >= hi else round(255 * (x - lo) / (hi - lo))
        for x in range(W)
    ]
    strip = Image.new('L', (W, 1))
    strip.putdata(row)
    return strip.resize((W, H))


def build(path: str) -> Image.Image:
    logo = Image.open(path).convert('RGBA')

    # Scale to the row's height, never past a third of its width.
    h = round(H * LOGO_H)
    w = round(logo.width * h / logo.height)
    if w > round(W * 0.68):
        w = round(W * 0.68)
        h = round(logo.height * w / logo.width)
    logo = logo.resize((w, h), Image.LANCZOS)

    canvas = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    canvas.alpha_composite(logo, (W - w - round(W * RIGHT_PAD), (H - h) // 2))

    # Keep the logo's own transparency, and fade it out toward the left.
    faded = Image.new('L', (W, H))
    faded.putdata([
        a * m // 255
        for a, m in zip(canvas.getchannel('A').getdata(), ramp().getdata())
    ])
    canvas.putalpha(faded)
    return canvas


made = 0
for name in sorted(os.listdir(SRC)):
    if not name.endswith('.png') or name.endswith('-card.png'):
        continue
    out = os.path.join(SRC, name[:-4] + '-card.png')
    img = build(os.path.join(SRC, name))
    img.save(out, optimize=True)

    # A blank file is the failure worth catching here, so say how much ink landed.
    alpha = list(img.getchannel('A').getdata())
    ink = sum(1 for a in alpha if a > 8) * 100 // len(alpha)
    print(f'  {out}  {os.path.getsize(out) / 1024:5.0f} KB   {ink}% of the canvas has something on it')
    made += 1

print(f'\n{made} card background(s) written.')
