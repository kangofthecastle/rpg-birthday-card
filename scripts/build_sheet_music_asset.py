#!/usr/bin/env python3
"""Build the sheet-music keepsake and Boatigami texture from the score PDF.

The complete PDF page is preserved and placed on the 512x640 parchment texture
used by the reward modal. A second texture rotates that finished page onto a
landscape parchment canvas for Boatigami, so the existing game sheet can remain
260x150 without stretching the score. No notes are re-typeset or omitted.
"""

from __future__ import annotations

import argparse
import random
import subprocess
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


OUTPUT_SIZE = (512, 640)
BOATIGAMI_OUTPUT_SIZE = (832, 480)
WORK_SCALE = 2
CANVAS_SIZE = tuple(value * WORK_SCALE for value in OUTPUT_SIZE)
BOATIGAMI_CANVAS_SIZE = tuple(value * WORK_SCALE for value in BOATIGAMI_OUTPUT_SIZE)
INK = (43, 73, 84)


def font(size: int, *, italic: bool = False, bold: bool = False) -> ImageFont.FreeTypeFont:
    georgia_name = (
        "Georgia Bold Italic.ttf"
        if bold and italic
        else "Georgia Bold.ttf"
        if bold
        else "Georgia Italic.ttf"
        if italic
        else "Georgia.ttf"
    )
    candidates = [
        Path("/System/Library/Fonts/Supplemental") / georgia_name,
        Path("/System/Library/Fonts/Supplemental/Georgia.ttf"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size)
    return ImageFont.load_default(size=size)


def centered(
    draw: ImageDraw.ImageDraw,
    text: str,
    y: int,
    face: ImageFont.ImageFont,
    fill: tuple[int, ...],
) -> None:
    box = draw.textbbox((0, 0), text, font=face)
    x = (CANVAS_SIZE[0] - (box[2] - box[0])) // 2
    draw.text((x, y), text, font=face, fill=fill)


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


def parchment(size: tuple[int, int] = CANVAS_SIZE) -> Image.Image:
    width, height = size
    rng = random.Random(19021832)
    image = Image.new("RGB", size, (247, 237, 204))
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

    wash = Image.new("RGBA", size, (0, 0, 0, 0))
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


def build_boatigami_texture(portrait_canvas: Image.Image) -> Image.Image:
    """Rotate the portrait page without changing Boatigami's landscape geometry."""
    canvas = parchment(BOATIGAMI_CANVAS_SIZE)
    rotated = portrait_canvas.rotate(90, expand=True)
    target_height = BOATIGAMI_CANVAS_SIZE[1]
    scale = target_height / rotated.height
    rotated = rotated.resize(
        (round(rotated.width * scale), target_height),
        Image.Resampling.LANCZOS,
    )
    x = (BOATIGAMI_CANVAS_SIZE[0] - rotated.width) // 2
    canvas.alpha_composite(rotated, (x, 0))
    return canvas.convert("RGB").resize(BOATIGAMI_OUTPUT_SIZE, Image.Resampling.LANCZOS)


def build(source_pdf: Path, output_path: Path, boatigami_output_path: Path) -> None:
    source = render_pdf_page(source_pdf)
    # Replace only the PDF's heading; the notation below remains untouched.
    source_draw = ImageDraw.Draw(source)
    source_draw.rectangle((0, 0, source.width, round(source.height * 0.12)), fill="white")

    canvas = parchment()
    draw = ImageDraw.Draw(canvas)
    rendered = notation_layer(source, 944)
    x = (CANVAS_SIZE[0] - rendered.width) // 2
    canvas.alpha_composite(rendered, (x, 32))
    centered(
        draw,
        "Do You Hear the People Sing?",
        70,
        font(44, italic=True),
        (*INK, 255),
    )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    final = canvas.convert("RGB").resize(OUTPUT_SIZE, Image.Resampling.LANCZOS)
    final.save(output_path, format="PNG", optimize=True)

    boatigami_output_path.parent.mkdir(parents=True, exist_ok=True)
    boatigami = build_boatigami_texture(canvas)
    boatigami.save(boatigami_output_path, format="PNG", optimize=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source_pdf", type=Path)
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("public/assets/activities/fold-the-letters/paper-sheetmusic.png"),
    )
    parser.add_argument(
        "--boatigami-output",
        type=Path,
        default=Path(
            "public/assets/activities/fold-the-letters/paper-sheetmusic-boatigami.png"
        ),
    )
    args = parser.parse_args()
    if not args.source_pdf.exists():
        parser.error(f"source PDF does not exist: {args.source_pdf}")
    build(args.source_pdf, args.output, args.boatigami_output)


if __name__ == "__main__":
    main()
