"""
Cuts the achievement badge art out of the design sheet and writes the code → image map.

    npm run badges --workspace @vagabonds/app

Reads docs/design/achievement-badges.png (5 columns × 7 rows, a name under each badge) and the
single badges in docs/design/badges/ (STANDALONE), and writes, for every one of them:
  - assets/badges/<code>.png         the badge, full color, outside the circle transparent
  - assets/badges/<code>.locked.png  the same in grey, for a badge not yet earned
  - src/content/badge-art.ts         the map the app reads

Needs Pillow (python3 -m pip install -r data/requirements.txt). Replacing the sheet: keep the
grid, or update GRID_X / GRID_Y; the script measures each circle around those rough centers.
"""

import statistics
from pathlib import Path

from PIL import Image, ImageDraw, ImageOps

APP = Path(__file__).resolve().parent.parent
SHEET_PATH = APP.parent.parent / "docs/design/achievement-badges.png"
OUT_DIR = APP / "assets/badges"
MAP_PATH = APP / "src/content/badge-art.ts"

# The sheet, row by row, as achievement codes (docs/achievements.md).
SHEET = [
    "hatay-ilk-adim", "konya-ilk-adim", "yildirim-gezgini", "iznik-gezgini", "antakya-gezgini",
    "meram-gezgini", "selcuklu-ilcesi-gezgini", "karatay-gezgini", "bursa-ilceleri", "hatay-ilceleri",
    "konya-ilceleri", "ilce-avcisi", "iki-sehir", "uc-sehir", "bir-gunde-uc-ilce",
    "hafta-sonu-rotasi", "bir-haftada-iki-il", "cami-meraklisi", "hamam-yolu", "kervan-yolu",
    "turbe-ziyaretcisi", "ilim-yolu", "selcuklu-izinde", "erken-osmanli", "muradiye-kulliyesi",
    "esrefoglu-kulliyesi", "sokullu-kulliyesi", "ilk-fotograf", "katkici", "on-not",
    "rehber-kalem", "zaman-yolcusu", "zaman-ustasi", "osmangazi-gezgini", "ilk-not",
]

# Badges drawn on their own, as a square PNG with the badge filling it. Each has its source SVG
# next to it; the PNG is that SVG rendered at 640×640.
STANDALONE = {
    "bursa-ilk-adim": APP.parent.parent / "docs/design/badges/bursa-ilk-adim.png",
}

# Rough circle centers on the 1024×1536 sheet; each circle is measured around them.
GRID_X = [123, 317, 511, 706, 901]
GRID_Y = [125, 337, 561, 780, 988, 1189, 1386]

SIZE = 160  # every badge is written at this size, whatever its size on the sheet
SUPERSAMPLE = 4  # the circle mask is drawn this much larger, then reduced, for a smooth edge
BACKGROUND_DIFF = 45  # how far from the sheet's background a pixel must be to count as badge


def main() -> None:
    sheet = Image.open(SHEET_PATH).convert("RGB")
    pixels = sheet.load()
    background = pixels[5, 5]

    def is_badge(x: int, y: int) -> bool:
        return sum(abs(a - b) for a, b in zip(pixels[x, y], background)) > BACKGROUND_DIFF

    def edges(cx: int, cy: int) -> tuple[int, int, int]:
        """Left, right and bottom of the glass ring around a rough center."""
        left, right = cx, cx
        for y in range(cy - 30, cy + 31, 3):
            l = next((x for x in range(cx - 100, cx) if is_badge(x, y)), cx)
            r = next((x for x in range(cx + 100, cx, -1) if is_badge(x, y)), cx)
            if r - l > right - left:
                left, right = l, r
        bottom = cy
        for x in (cx - 30, cx + 30):
            y, gap, last = cy, 0, cy
            # The ring ends where a few background rows follow; the badge's name is below that gap.
            while y < cy + 120 and gap < 4:
                if is_badge(x, y):
                    last, gap = y, 0
                else:
                    gap += 1
                y += 1
            bottom = max(bottom, last)
        return left, right, bottom

    circles = []
    for cy in GRID_Y:
        found = [edges(cx, cy) for cx in GRID_X]
        # A dark patch in a drawing can stop the walk down early; trust the row's usual bottom then.
        usual = statistics.median(b for _, _, b in found)
        for left, right, bottom in found:
            if bottom < usual - 8:
                bottom = usual
            radius = (right - left) / 2
            circles.append(((left + right) / 2, bottom - radius, radius))

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for code, (cx, cy, radius) in zip(SHEET, circles):
        half = radius + 2
        box = (round(cx - half), round(cy - half), round(cx + half), round(cy + half))
        save(code, sheet.crop(box).resize((SIZE, SIZE), Image.LANCZOS), (radius - 1) / half)

    for code, path in STANDALONE.items():
        tile = Image.open(path).convert("RGBA")
        # Flatten onto the rim's navy, so the grey copy has no stray light pixels in the corners.
        flat = Image.new("RGB", tile.size, (11, 23, 45))
        flat.paste(tile, mask=tile.getchannel("A"))
        save(code, flat.resize((SIZE, SIZE), Image.LANCZOS), 0.99)

    write_map()
    total = len(SHEET) + len(STANDALONE)
    print(f"{total} badges → {OUT_DIR.relative_to(APP)}, map → {MAP_PATH.relative_to(APP)}")


def save(code: str, tile: Image.Image, keep: float) -> None:
    """Writes the color and grey badge, cut to a circle `keep` of the tile's width across."""
    big = SIZE * SUPERSAMPLE
    inner = keep * big / 2
    mask = Image.new("L", (big, big), 0)
    ImageDraw.Draw(mask).ellipse((big / 2 - inner, big / 2 - inner, big / 2 + inner, big / 2 + inner), fill=255)
    mask = mask.resize((SIZE, SIZE), Image.LANCZOS)

    earned = tile.convert("RGBA")
    earned.putalpha(mask)
    earned.save(OUT_DIR / f"{code}.png", optimize=True)
    locked = ImageOps.grayscale(tile.convert("RGB")).convert("RGBA")
    locked.putalpha(mask)
    locked.save(OUT_DIR / f"{code}.locked.png", optimize=True)


def write_map() -> None:
    lines = [
        'import type { ImageSourcePropType } from "react-native";',
        "",
        "/**",
        " * Illustrated badge art for the achievements in docs/achievements.md, keyed by achievement code.",
        " * `earned` is the full-color medal, `locked` the same drawing in grey for one not yet earned.",
        " *",
        " * Achievements without art here (any an admin adds later) fall back to their emoji (`badge`",
        " * in the contract).",
        " *",
        " * Generated by scripts/cut-badges.py from docs/design/achievement-badges.png and",
        " * docs/design/badges/; do not edit.",
        " */",
        "export interface BadgeArt {",
        "  earned: ImageSourcePropType;",
        "  locked: ImageSourcePropType;",
        "}",
        "",
        "export const badgeArt: Record<string, BadgeArt> = {",
    ]
    for code in sorted([*SHEET, *STANDALONE]):
        lines.append(
            f'  "{code}": {{ earned: require("@/assets/badges/{code}.png"), locked: require("@/assets/badges/{code}.locked.png") }},'
        )
    lines += ["};", ""]
    MAP_PATH.write_text("\n".join(lines))


if __name__ == "__main__":
    main()
