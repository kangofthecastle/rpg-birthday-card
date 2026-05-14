#!/usr/bin/env python3
"""Build polished 4-direction idle/walk companion sheets from existing art."""

from __future__ import annotations

import argparse
import json
import math
import shutil
from collections import deque
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageEnhance, ImageFilter


CELL = 256
OUTPUT_COLUMNS = 6
OUTPUT_DIRECTIONS = ["down", "left", "right", "up"]


@dataclass(frozen=True)
class CharacterSource:
    name: str
    input_path: Path
    output_path: Path
    source_rows: dict[str, int]
    grid_rows: int = 4
    grid_columns: int = 6
    remove_light_background: bool = False
    top_crop_margins: dict[str, int] | None = None
    repair_clipped_top_directions: tuple[str, ...] = ()
    frame_indices: dict[str, tuple[int, ...]] | None = None


SOURCES = [
    CharacterSource(
        name="friendone",
        input_path=Path("public/assets/sprites/characters/friendone-walk-4dir-v2-alpha.png"),
        output_path=Path("public/assets/sprites/characters/friendone-idle-walk-4dir-v1-alpha.png"),
        source_rows={"down": 0, "left": 1, "right": 2, "up": 3},
        repair_clipped_top_directions=("up",),
        frame_indices={"left": (0, 1, 2, 3, 4, 3)},
    ),
    CharacterSource(
        name="friendthree",
        input_path=Path("public/assets/sprites/characters/friendthree-walk-4dir-v1-alpha.png"),
        output_path=Path("public/assets/sprites/characters/friendthree-idle-walk-4dir-v1-alpha.png"),
        source_rows={"down": 0, "left": 1, "right": 2, "up": 3},
        remove_light_background=True,
        top_crop_margins={"up": 96},
    ),
    CharacterSource(
        name="friendtwo",
        input_path=Path("public/assets/characters/friendtwo/friendtwo-spritesheet-v1.png"),
        output_path=Path("public/assets/sprites/characters/friendtwo-idle-walk-4dir-v1-alpha.png"),
        source_rows={"down": 0, "up": 1, "left": 2, "right": 3},
        remove_light_background=True,
    ),
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run-dir", default="asset-runs/companion-idle-walk-v1")
    return parser.parse_args()


def remove_light_background(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    pixels = rgba.load()
    for y in range(rgba.height):
        for x in range(rgba.width):
            r, g, b, a = pixels[x, y]
            if a == 0:
                continue
            near_gray = max(r, g, b) - min(r, g, b) <= 14
            if near_gray and r >= 188 and g >= 188 and b >= 188:
                pixels[x, y] = (r, g, b, 0)
            elif r >= 246 and g >= 246 and b >= 246:
                pixels[x, y] = (r, g, b, 0)
    return rgba


def crop_grid_cell(
    sheet: Image.Image,
    row: int,
    col: int,
    rows: int,
    columns: int,
    top_margin: int = 0,
) -> Image.Image:
    x0 = round(col * sheet.width / columns)
    x1 = round((col + 1) * sheet.width / columns)
    y0 = round(row * sheet.height / rows)
    y1 = round((row + 1) * sheet.height / rows)
    return sheet.crop((x0, max(0, y0 - top_margin), x1, y1)).convert("RGBA")


def alpha_components(image: Image.Image, alpha_cutoff: int = 8) -> list[tuple[int, tuple[int, int, int, int], set[int]]]:
    alpha = image.getchannel("A")
    width, height = alpha.size
    data = alpha.tobytes()
    seen = bytearray(width * height)
    components: list[tuple[int, tuple[int, int, int, int], set[int]]] = []

    for start, value in enumerate(data):
        if value <= alpha_cutoff or seen[start]:
            continue
        queue = deque([start])
        seen[start] = 1
        pixels: set[int] = set()
        min_x = width
        min_y = height
        max_x = 0
        max_y = 0
        while queue:
            current = queue.popleft()
            pixels.add(current)
            x = current % width
            y = current // width
            min_x = min(min_x, x)
            min_y = min(min_y, y)
            max_x = max(max_x, x)
            max_y = max(max_y, y)
            for nxt in (
                current - 1 if x else -1,
                current + 1 if x + 1 < width else -1,
                current - width if y else -1,
                current + width if y + 1 < height else -1,
            ):
                if nxt >= 0 and not seen[nxt] and data[nxt] > alpha_cutoff:
                    seen[nxt] = 1
                    queue.append(nxt)
        components.append((len(pixels), (min_x, min_y, max_x + 1, max_y + 1), pixels))
    return components


def isolate_character(cell: Image.Image) -> Image.Image:
    components = alpha_components(cell)
    if not components:
        return Image.new("RGBA", cell.size, (0, 0, 0, 0))

    _area, _bbox, kept_pixels = max(components, key=lambda component: component[0])

    out = Image.new("RGBA", cell.size, (0, 0, 0, 0))
    src = cell.load()
    dst = out.load()
    width = cell.width
    for idx in kept_pixels:
        x = idx % width
        y = idx // width
        dst[x, y] = src[x, y]
    return out


def clean_key_residue(image: Image.Image) -> Image.Image:
    out = image.copy()
    pixels = out.load()
    for y in range(max(0, out.height - 56), out.height):
        for x in range(out.width):
            r, g, b, a = pixels[x, y]
            if a > 0 and r > 170 and b > 150 and (r - g) > 20 and (b - g) > 20:
                pixels[x, y] = (r, g, b, 0)
    return out


def alpha_composite_clipped(base: Image.Image, overlay: Image.Image, dest: tuple[int, int]) -> None:
    x, y = dest
    crop_left = max(0, -x)
    crop_top = max(0, -y)
    crop_right = min(overlay.width, base.width - x)
    crop_bottom = min(overlay.height, base.height - y)
    if crop_left >= crop_right or crop_top >= crop_bottom:
        return

    cropped = overlay.crop((crop_left, crop_top, crop_right, crop_bottom))
    base.alpha_composite(cropped, (max(0, x), max(0, y)))


def extract_top_cap(donor: Image.Image) -> Image.Image | None:
    bbox = donor.getbbox()
    if bbox is None:
        return None

    cap_height = min(66, max(32, round((bbox[3] - bbox[1]) * 0.34)))
    cap = donor.crop((bbox[0], bbox[1], bbox[2], min(bbox[3], bbox[1] + cap_height)))
    if cap.getbbox() is None:
        return None
    return cap


def repair_clipped_top(sprite: Image.Image, donor: Image.Image | None) -> Image.Image:
    bbox = sprite.getbbox()
    cap = extract_top_cap(donor) if donor else None
    if bbox is None or bbox[1] > 0 or cap is None:
        return sprite

    alpha = sprite.getchannel("A")
    top_pixels: list[tuple[int, int]] = []

    for y in range(min(36, sprite.height)):
        for x in range(sprite.width):
            if alpha.getpixel((x, y)) <= 8:
                continue
            top_pixels.append((x, y))

    if not top_pixels:
        return sprite

    left = min(x for x, _y in top_pixels)
    right = max(x for x, _y in top_pixels) + 1
    width = right - left
    if width < 42:
        return sprite

    pad = min(40, max(26, round(width * 0.3)))
    repaired = Image.new("RGBA", (sprite.width, sprite.height + pad), (0, 0, 0, 0))
    cap_x = round((left + right - cap.width) / 2)
    cap_y = max(0, pad - cap.height + 16)
    alpha_composite_clipped(repaired, cap, (cap_x, cap_y))
    repaired.alpha_composite(sprite, (0, pad))
    return repaired


def fit_to_cell(sprite: Image.Image) -> Image.Image:
    bbox = sprite.getbbox()
    cell = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
    if bbox is None:
        return cell

    crop = sprite.crop(bbox)
    max_width = 150
    target_height = 216
    scale = min(max_width / crop.width, target_height / crop.height)
    if not math.isclose(scale, 1.0):
        crop = crop.resize(
            (max(1, round(crop.width * scale)), max(1, round(crop.height * scale))),
            Image.Resampling.LANCZOS,
        )
    crop = ImageEnhance.Contrast(crop).enhance(1.05)
    crop = ImageEnhance.Color(crop).enhance(1.04)
    crop = crop.filter(ImageFilter.UnsharpMask(radius=0.7, percent=85, threshold=2))
    cell.alpha_composite(crop, ((CELL - crop.width) // 2, CELL - crop.height - 8))
    return clean_key_residue(cell)


def frame_sequence(
    frames: list[Image.Image],
    direction: str,
    frame_indices: tuple[int, ...] | None = None,
) -> list[Image.Image]:
    if frame_indices:
        return [frames[index] for index in frame_indices]
    if direction in {"down", "up"}:
        mild = frames[1]
        mild_mirror = mild.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
        return [frames[0], mild, mild, frames[0], mild_mirror, mild_mirror]
    return frames


def load_frames(source: CharacterSource) -> dict[str, list[Image.Image]]:
    sheet = Image.open(source.input_path).convert("RGBA")
    if source.remove_light_background:
        sheet = remove_light_background(sheet)

    raw_frames: dict[str, list[Image.Image]] = {}
    for direction in ("down", "left", "up"):
        row = source.source_rows[direction]
        frames: list[Image.Image] = []
        top_margin = (source.top_crop_margins or {}).get(direction, 0)
        for col in range(source.grid_columns):
            frames.append(
                isolate_character(
                    crop_grid_cell(
                        sheet,
                        row,
                        col,
                        source.grid_rows,
                        source.grid_columns,
                        top_margin=top_margin,
                    )
                )
            )
        raw_frames[direction] = frames

    for direction in source.repair_clipped_top_directions:
        donor_frames = raw_frames.get("down", [])
        raw_frames[direction] = [
            repair_clipped_top(frame, donor_frames[col] if col < len(donor_frames) else None)
            for col, frame in enumerate(raw_frames[direction])
        ]

    extracted: dict[str, list[Image.Image]] = {}
    for direction, frames in raw_frames.items():
        indices = (source.frame_indices or {}).get(direction)
        extracted[direction] = frame_sequence(
            [fit_to_cell(frame) for frame in frames],
            direction,
            frame_indices=indices,
        )

    extracted["right"] = [
        frame.transpose(Image.Transpose.FLIP_LEFT_RIGHT) for frame in extracted["left"]
    ]
    return extracted


def build_sheet(source: CharacterSource, run_dir: Path) -> None:
    frames_by_direction = load_frames(source)
    row_names = [f"idle-{direction}" for direction in OUTPUT_DIRECTIONS] + [
        f"walk-{direction}" for direction in OUTPUT_DIRECTIONS
    ]
    sheet = Image.new(
        "RGBA",
        (CELL * OUTPUT_COLUMNS, CELL * len(row_names)),
        (0, 0, 0, 0),
    )

    for row_index, direction in enumerate(OUTPUT_DIRECTIONS):
        idle = frames_by_direction[direction][0]
        for col in range(OUTPUT_COLUMNS):
            sheet.alpha_composite(idle, (col * CELL, row_index * CELL))

    walk_offset = len(OUTPUT_DIRECTIONS)
    for direction_index, direction in enumerate(OUTPUT_DIRECTIONS):
        for col, frame in enumerate(frames_by_direction[direction]):
            sheet.alpha_composite(frame, (col * CELL, (walk_offset + direction_index) * CELL))

    source.output_path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(source.output_path)

    char_run = run_dir / source.name
    (char_run / "source").mkdir(parents=True, exist_ok=True)
    (char_run / "qa").mkdir(parents=True, exist_ok=True)
    shutil.copy2(source.input_path, char_run / "source" / source.input_path.name)
    qa = {
        "source": str(source.input_path),
        "active_asset": str(source.output_path),
        "size": [sheet.width, sheet.height],
        "cell_size": [CELL, CELL],
        "rows": len(row_names),
        "columns": OUTPUT_COLUMNS,
        "row_names": row_names,
        "directions": OUTPUT_DIRECTIONS,
        "notes": [
            "Built from the existing project sprite sheet.",
            "Normalized to 256px cells with bottom-center anchoring.",
            "Right-facing rows are mirrored from the left-facing source row for consistent side-walk timing.",
            "Straight up/down rows use mild mirrored steps to avoid pronounced leg crossing.",
            "Known edge-cropped source frames are omitted from the loop when a cleaner intact pose is available.",
        ],
    }
    (char_run / "qa" / f"{source.name}-idle-walk-4dir-v1-qa.json").write_text(
        json.dumps(qa, indent=2),
        encoding="utf-8",
    )
    print(json.dumps({"character": source.name, "output": str(source.output_path)}, indent=2))


def main() -> None:
    args = parse_args()
    run_dir = Path(args.run_dir)
    for source in SOURCES:
        build_sheet(source, run_dir)


if __name__ == "__main__":
    main()
