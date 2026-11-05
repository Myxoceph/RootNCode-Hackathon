"""
Cuts the achievement badge art out of the design sheet and writes the code → image map.

    npm run badges --workspace @vagabonds/app

Reads docs/design/achievement-badges.png (5 columns × 7 rows, a name under each badge) and the
single badges in docs/design/badges/ (STANDALONE), and writes, for every one of them:
  - assets/badges/<code>.png         the badge, full color, outside the circle transparent
  - assets/badges/<code>.locked.png  the same in grey, for a badge not yet earned
  - src/content/badge-art.ts         the map the app reads

Needs Pillow (python3 -m pip install -r data/requirements.txt). Replacing the sheet: keep the
grid, or update GRID_X / GRID_Y; the script finds each glass ring around those rough centers.
"""

import math
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
RING_MIN, RING_MAX = 64, 96  # where to look for a ring's outer edge, in sheet pixels from the center
BACKGROUND_MAX = 50  # the sheet's background and the rings' dark outline stay below this brightness
RING_WIDTH = 4  # the glass ring and its dark outline, inside the outer edge
STANDALONE_FACE = 576 / 640  # the face of a single badge's SVG, inside its glass ring


def main() -> None:
    sheet = Image.open(SHEET_PATH).convert("RGB")
    pixels = sheet.load()

    def luminance(x: float, y: float) -> int:
        return sum(pixels[round(x), round(y)])

    def ring(cx0: int, cy0: int) -> tuple[float, float, float]:
        """Center and radius of the glass ring around a rough center.

        Each ring is a thin light line with a dark outline just outside it, so along every ray
        from the center its outer edge is the steepest fall onto the background. A circle is fitted to
        those edges, dropping the ones a drawing's own edges threw off.
        """
        points = []
        # Not straight down, where the badge's name sits close under the ring.
        for degrees in [d for d in range(0, 360, 3) if not 50 <= d <= 130]:
            dx, dy = math.cos(math.radians(degrees)), math.sin(math.radians(degrees))
            at = [luminance(cx0 + r * dx, cy0 + r * dy) for r in range(RING_MIN, RING_MAX + 5)]
            # Only a fall onto a few pixels of plain dark background: not the badge's name below it.
            edges = [i for i in range(RING_MAX - RING_MIN) if max(at[i + 1 : i + 5]) < 3 * BACKGROUND_MAX]
            if edges:
                i = max(edges, key=lambda i: at[i] - at[i + 1])
                points.append((cx0 + (RING_MIN + i + 0.5) * dx, cy0 + (RING_MIN + i + 0.5) * dy))
        circle = fit_circle(points)
        for _ in range(4):
            close = [p for p in points if abs(math.dist(p, circle[:2]) - circle[2]) < 1.2]
            if len(close) < 12:
                break
            circle = fit_circle(close)
        return circle

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    centers = [(cx, cy) for cy in GRID_Y for cx in GRID_X]
    for code, (cx0, cy0) in zip(SHEET, centers):
        cx, cy, radius = ring(cx0, cy0)
        # Only the face inside the glass ring: the app draws its own rim around it.
        face = radius - RING_WIDTH
        box = (cx - face, cy - face, cx + face, cy + face)
        tile = sheet.transform((SIZE * SUPERSAMPLE,) * 2, Image.EXTENT, box, Image.BICUBIC)
        save(code, tile.resize((SIZE, SIZE), Image.LANCZOS))

    for code, path in STANDALONE.items():
        tile = Image.open(path).convert("RGBA")
        # Flatten onto the rim's navy, so the grey copy has no stray light pixels in the corners.
        flat = Image.new("RGB", tile.size, (11, 23, 45))
        flat.paste(tile, mask=tile.getchannel("A"))
        # The SVG is drawn on 640; its face, inside the glass ring, is STANDALONE_FACE of that.
        inset = tile.width * (1 - STANDALONE_FACE) / 2
        save(code, flat.crop((inset, inset, tile.width - inset, tile.height - inset)).resize((SIZE, SIZE), Image.LANCZOS))

    write_map()
    total = len(SHEET) + len(STANDALONE)
    print(f"{total} badges → {OUT_DIR.relative_to(APP)}, map → {MAP_PATH.relative_to(APP)}")


def fit_circle(points: list[tuple[float, float]]) -> tuple[float, float, float]:
    """Least-squares circle through points: x² + y² = 2ax + 2by + c, solved for a, b, c."""
    rows = [(2 * x, 2 * y, 1.0, x * x + y * y) for x, y in points]
    m = [[sum(r[i] * r[j] for r in rows) for j in range(4)] for i in range(3)]
    for i in range(3):  # Gauss-Jordan on the 3×3 normal equations
        pivot = max(range(i, 3), key=lambda k: abs(m[k][i]))
        m[i], m[pivot] = m[pivot], m[i]
        for k in range(3):
            if k != i:
                f = m[k][i] / m[i][i]
                m[k] = [a - f * b for a, b in zip(m[k], m[i])]
    a, b, c = (m[i][3] / m[i][i] for i in range(3))
    return a, b, math.sqrt(c + a * a + b * b)


def save(code: str, tile: Image.Image) -> None:
    """Writes the color and grey badge, cut to the circle that fills the tile."""
    big = SIZE * SUPERSAMPLE
    mask = Image.new("L", (big, big), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, big - 1, big - 1), fill=255)
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
