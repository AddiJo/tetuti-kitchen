"""Ubah ilustrasi logo (JPG berlatar krem) jadi set aset siap pakai.

Latar krem dihapus lewat flood fill dari tepi supaya warna terang di dalam
gambar (highlight cabai) tidak ikut terhapus.

Pakai: python3 tools/build-logo.py <file-sumber>
"""

import sys
from collections import deque

from PIL import Image, ImageFilter

CREAM = (246, 239, 228)
TOLERANCE = 62


def strip_background(img):
    img = img.convert("RGBA")
    w, h = img.size
    px = img.load()
    seed = px[0, 0][:3]

    def near(c):
        return sum((a - b) ** 2 for a, b in zip(c[:3], seed)) < TOLERANCE**2

    seen = bytearray(w * h)
    queue = deque()
    for x in range(w):
        for y in (0, h - 1):
            queue.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            queue.append((x, y))

    while queue:
        x, y = queue.popleft()
        if not (0 <= x < w and 0 <= y < h):
            continue
        i = y * w + x
        if seen[i] or not near(px[x, y]):
            continue
        seen[i] = 1
        px[x, y] = (0, 0, 0, 0)
        queue.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))

    # Kikis satu piksel lalu haluskan supaya sisa halo krem dari JPEG hilang.
    alpha = img.getchannel("A").filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
    img.putalpha(alpha)
    return img


def square(img, pad=0.06):
    box = img.getbbox()
    img = img.crop(box)
    side = int(max(img.size) * (1 + pad * 2))
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(img, ((side - img.width) // 2, (side - img.height) // 2), img)
    return canvas


def on_cream(img, size, radius_ratio=0.22):
    plate = Image.new("RGBA", (size, size), CREAM + (255,))
    mask = Image.new("L", (size * 4, size * 4), 0)
    from PIL import ImageDraw

    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, size * 4 - 1, size * 4 - 1), radius=int(size * 4 * radius_ratio), fill=255
    )
    plate.putalpha(mask.resize((size, size), Image.LANCZOS))

    art = img.resize((int(size * 0.84),) * 2, Image.LANCZOS)
    plate.paste(art, ((size - art.width) // 2, (size - art.height) // 2), art)
    return plate


def main():
    src = sys.argv[1]
    logo = square(strip_background(Image.open(src)))

    logo.resize((512, 512), Image.LANCZOS).save("assets/logo-cabai.png")
    on_cream(logo, 32, 0.28).save("assets/favicon-32.png")
    on_cream(logo, 180, 0.22).save("assets/apple-touch-icon.png")
    on_cream(logo, 64, 0.28).save(
        "assets/favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)]
    )
    print("selesai:", logo.size)


if __name__ == "__main__":
    main()
