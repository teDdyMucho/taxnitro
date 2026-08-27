"""Draw the shared background used behind every row of Financial Reports.

One image for all of them rather than each client's own logo. The logos are
roughly square and a row is many times wider than it is tall, so covering a row
with one crops it to a horizontal slice; drawing the background here instead
means the shape is chosen rather than fought.

What it shows is what the list is for: a rising bar chart with a trend line over
it, in the same golds as the rest of the app. It is drawn edge to edge: the
dissolve into the card is laid on by the screen instead of baked in here, so the
image can be cropped to whatever share of the row it is given and the fade still
lands where it should.

  python scripts/make-report-motif.py
"""
import os
import sys

from PIL import Image, ImageDraw

sys.stdout.reconfigure(encoding='utf-8')

OUT = os.path.join('assets', 'report-row-motif.png')

# Drawn large and reduced at the end, which is what keeps the curves clean.
SS = 3
W, H = 620 * SS, 250 * SS

GOLD = (232, 185, 35)         # Colors.primary
GOLD_DEEP = (196, 148, 20)
INK = (44, 35, 32)            # Colors.primaryDeep

# Heights as a share of the canvas, so the shape is described rather than typed.
BARS = [0.34, 0.50, 0.42, 0.66, 0.80, 0.70, 0.94]


def draw() -> Image.Image:
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    pad_r, pad_b, pad_t = int(W * 0.05), int(H * 0.14), int(H * 0.10)
    gap = int(W * 0.026)
    bar_w = int(W * 0.082)
    floor = H - pad_b
    span = floor - pad_t

    right = W - pad_r
    left = right - (len(BARS) * bar_w + (len(BARS) - 1) * gap)

    tops = []
    for i, share in enumerate(BARS):
        x0 = left + i * (bar_w + gap)
        top = floor - int(span * share)
        tops.append((x0 + bar_w // 2, top))
        # The tallest bar is the strongest; the rest sit back a little.
        weight = 0.42 + 0.38 * share
        colour = GOLD if i % 2 == 0 else GOLD_DEEP
        d.rounded_rectangle(
            [x0, top, x0 + bar_w, floor],
            radius=bar_w // 3,
            fill=(*colour, int(255 * weight)),
        )

    # A trend line over the tops, with a mark at each turn.
    lift = int(H * 0.06)
    line = [(x, y - lift) for x, y in tops]
    d.line(line, fill=(*INK, 90), width=max(2, int(H * 0.016)), joint='curve')
    r = int(H * 0.022)
    for x, y in line:
        d.ellipse([x - r, y - r, x + r, y + r], fill=(*INK, 120))

    # A baseline the bars stand on, so they do not float.
    d.line([(left - gap, floor), (right, floor)],
           fill=(*INK, 45), width=max(2, int(H * 0.010)))

    return img.resize((W // SS, H // SS), Image.LANCZOS)


img = draw()
img.save(OUT, optimize=True)

alpha = list(img.getchannel('A').getdata())
ink = sum(1 for a in alpha if a > 8) * 100 // len(alpha)
print(f'  {OUT}  {os.path.getsize(OUT) / 1024:.0f} KB   {ink}% of the canvas has something on it')
