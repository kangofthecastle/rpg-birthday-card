#!/usr/bin/env python3
"""Build the in-game sheet-music keepsake from the supplied score PDF.

The complete PDF page is preserved and placed on the 512x640 parchment texture
used by the reward modal and paper-folding game. No notes are re-typeset or
omitted, so the keepsake remains an exact visual copy of the supplied score.
"""

from __future__ import annotations

import argparse
import random
import subprocess
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


OUTPUT_SIZE = (512, 640)
WORK_SCALE = 2
CANVAS_SIZE = tuple(value * WORK_SCALE for value in OUTPUT_SIZE)
INK = (43, 73, 84)


def font(size: int, *, italic: bool = False, bold: bool = False) -> ImageFont.FreeTypeFont:
    suffix = "BoldItalic" if bold and italic else "Bold" if bold else "Italic" if italic else ""
    candidates = [
        Path(f"/System/Library/Fonts/Supplemental/Georgia{suffix}.ttf"),
        Path(f"/System/Library/Fonts/Supplemental/Times New Roman {suffix}.ttf"),
        Path("/System/Library/Fonts/Supplemental/Georgia.ttf"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size)
    return ImageFont.load_default(size=size)


def render_pdf_page(source_pdf: Path) -> Image.Image:
    with tempfile.TemporaryDirectory(prefix="a-game-sheet-") as temp_dir:
        prefix = Path(temp_dir) / "source"
        subprocess.run(
            [
                "pdftoppm",
                "-f",
                "1",
                "-singlefile",
                "-png",
                "-r",
                "200",
                str(source_pdf),
                str(prefix),
            ],
            check=True,
        )
        return Image.open(prefix.with_suffix(".png")).convert("RGB")


def notation_layer(page: Image.Image, target_width: int) -> Image.Image:
    scale = target_width / page.width
    resized = page.resize((target_width, round(page.height * scale)), Image.Resampling.LANCZOS)
    gray = resized.convert("L")
    alpha = gray.point(lambda value: max(0, min(255, round((244 - value) * 1.55))))
    alpha = alpha.filter(ImageFilter.GaussianBlur(0.15))
    ink = Image.new("RGBA", resized.size, (*INK, 0))
    ink.putalpha(alpha)
    return ink


def parchment() -> Image.Image:
    width, height = CANVAS_SIZE
    rng = random.Random(19021832)
    image = Image.new("RGB", CANVAS_SIZE, (247, 237, 204))
    pixels = image.load()
    for y in range(height):
        edge = abs(y - height / 2) / (height / 2)
        for x in range(width):
            horizontal_edge = abs(x - width / 2) / (width / 2)
            grain = rng.randint(-5, 5)
            shade = round((edge + horizontal_edge) * 3)
            pixels[x, y] = (
                max(0, min(255, 247 + grain - shade)),
                max(0, min(255, 237 + grain - shade)),
                max(0, min(255, 204 + grain - shade)),
            )

    wash = Image.new("RGBA", CANVAS_SIZE, (0, 0, 0, 0))
    wash_draw = ImageDraw.Draw(wash)
    for _ in range(70):
        x = rng.randrange(width)
        y = rng.randrange(height)
        radius = rng.randrange(4, 30)
        wash_draw.ellipse(
            (x - radius, y - radius, x + radius, y + radius),
            fill=(132, 92, 39, rng.randrange(2, 9)),
        )
    wash = wash.filter(ImageFilter.GaussianBlur(10))
    return Image.alpha_composite(image.convert("RGBA"), wash)


def build(source_pdf: Path, output_path: Path) -> None:
    source = render_pdf_page(source_pdf)
    canvas = parchment()
    draw = ImageDraw.Draw(canvas)
    rendered = notation_layer(source, 944)
    x = (CANVAS_SIZE[0] - rendered.width) // 2
    canvas.alpha_composite(rendered, (x, 32))

    draw.line((56, 1138, CANVAS_SIZE[0] - 56, 1138), fill=(108, 82, 48, 90), width=2)
    draw.text((CANVAS_SIZE[0] - 204, 1158), "____", font=font(34, italic=True), fill=(57, 88, 96, 220))

    output_path.parent.mkdir(parents=True, exist_ok=True)
    final = canvas.convert("RGB").resize(OUTPUT_SIZE, Image.Resampling.LANCZOS)
    final.save(output_path, format="PNG", optimize=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source_pdf", type=Path)
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("public/assets/activities/fold-the-letters/paper-sheetmusic.png"),
    )
    args = parser.parse_args()
    if not args.source_pdf.exists():
        parser.error(f"source PDF does not exist: {args.source_pdf}")
    build(args.source_pdf, args.output)


if __name__ == "__main__":
    main()
