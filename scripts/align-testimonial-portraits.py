#!/usr/bin/env python3
"""Align the slide-9 testimonial portraits onto one shared geometry.

Every portrait is composited onto an identical canvas with its eye line at the
same height and its face scaled to the same size, so the heads line up across
the row and the slide needs no per-panel nudging.

The eye and chin positions below are measured by hand, not detected. Two
automatic approaches were tried on this set and both failed: a silhouette width
profile finds the crown of a head rather than the neck when the hair is wide,
and a YCbCr skin gate reads a tan plaid shirt as a face. For five images,
reading them off a labelled contact sheet is more reliable.

To re-measure after swapping a photo, render each cut-out at a known height
with gridlines every 5%, read off where the eyes and the chin fall, and put
those fractions here.

    python3 scripts/align-testimonial-portraits.py
"""

import os
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(HERE, "public/pitch-deck/testimonials/cutout")
OUT = os.path.join(HERE, "public/pitch-deck/testimonials/aligned")

# eye line and chin, as a fraction of each cut-out's own height
FACES = {
    "p1.png": (0.19, 0.37),  # Isaac Faber
    "p2.png": (0.21, 0.40),  # Paige Bailey
    "p3.png": (0.21, 0.36),  # Dhravya Shah
    "p4.png": (0.26, 0.48),  # Alex Russo
    "p5.png": (0.22, 0.38),  # Saurav Panda
}

CANVAS_W, CANVAS_H = 640, 1000
EYE_Y = 285   # far enough down that the tallest hair still clears the top edge
FACE_H = 175  # eyes-to-chin in canvas pixels; constant, so every head matches


def align(name, eye_frac, chin_frac):
    im = Image.open(os.path.join(SRC, name)).convert("RGBA")
    w, h = im.size
    eyes, chin = eye_frac * h, chin_frac * h
    scale = FACE_H / (chin - eyes)

    # centre on the head, not the body — folded arms and turned shoulders pull
    # a whole-silhouette centre off to one side
    alpha = np.array(im)[:, :, 3] > 90
    band = alpha[int(h * eye_frac * 0.35):int(chin)]
    cols = np.where(band.sum(axis=0) > 1)[0]
    head_cx = (cols[0] + cols[-1]) / 2

    im = im.resize((round(w * scale), round(h * scale)), Image.LANCZOS)
    canvas = Image.new("RGBA", (CANVAS_W, CANVAS_H), (0, 0, 0, 0))
    canvas.paste(im, (round(CANVAS_W / 2 - head_cx * scale),
                      round(EYE_Y - eyes * scale)), im)

    top = np.where((np.array(canvas)[:, :, 3] > 90).sum(axis=1) > 2)[0][0]
    canvas.save(os.path.join(OUT, name), optimize=True)
    return scale, int(top)


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    for name, (e, c) in FACES.items():
        scale, top = align(name, e, c)
        kb = round(os.path.getsize(os.path.join(OUT, name)) / 1024)
        flag = "  <-- CLIPPED" if top <= 0 else ""
        print(f"{name}  scale={scale:.2f}  headTop={top:4d}px  {kb:4d} KB{flag}")
