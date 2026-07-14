#!/usr/bin/env python3
"""Build the game's compact CC0 violin sample set from VSCO 2 CE masters.

Run from the repository root with:
  uv run --with numpy --with soundfile scripts/build_violin_samples.py
"""

from __future__ import annotations

import tempfile
import urllib.parse
import urllib.request
from pathlib import Path

import numpy as np
import soundfile as sf


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "public/assets/audio/violin"
RAW_BASE = "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Solo%20Violin"

ANCHORS = ("A3", "C4", "E4", "G4", "A4", "C5")


def source_name(articulation: str, pitch: str) -> str:
    if articulation == "arco":
        return f"Arco Vib/LLVln_ArcoVib_{pitch}_p.wav"
    return f"spic/LLVln_spic_{pitch}_v1_rr1.wav"


def trim_and_shape(data: np.ndarray, sample_rate: int, articulation: str) -> np.ndarray:
    mono = data.mean(axis=1) if data.ndim > 1 else data
    peak = float(np.max(np.abs(mono)))
    if peak <= 0:
        raise ValueError("source sample is silent")

    onset_candidates = np.flatnonzero(np.abs(mono) >= peak * 0.012)
    if onset_candidates.size == 0:
        raise ValueError("unable to find sample onset")
    pre_roll = int(sample_rate * 0.025)
    start = max(0, int(onset_candidates[0]) - pre_roll)

    if articulation == "arco":
        end = min(len(mono), start + int(sample_rate * 3.2))
        fade_out_seconds = 0.12
    else:
        tail_candidates = np.flatnonzero(np.abs(mono) >= peak * 0.003)
        natural_end = int(tail_candidates[-1]) + int(sample_rate * 0.12)
        end = min(len(mono), natural_end, start + int(sample_rate * 1.5))
        fade_out_seconds = 0.06

    shaped = np.array(mono[start:end], dtype=np.float32, copy=True)
    shaped_peak = float(np.max(np.abs(shaped)))
    if shaped_peak > 0:
        shaped *= 0.72 / shaped_peak

    fade_in_frames = min(len(shaped), int(sample_rate * 0.012))
    fade_out_frames = min(len(shaped), int(sample_rate * fade_out_seconds))
    if fade_in_frames:
        shaped[:fade_in_frames] *= np.linspace(0, 1, fade_in_frames, dtype=np.float32)
    if fade_out_frames:
        shaped[-fade_out_frames:] *= np.linspace(1, 0, fade_out_frames, dtype=np.float32)
    return shaped


def build_one(temp_dir: Path, articulation: str, pitch: str) -> None:
    relative_source = source_name(articulation, pitch)
    url = f"{RAW_BASE}/{urllib.parse.quote(relative_source, safe='/')}"
    source_path = temp_dir / Path(relative_source).name
    urllib.request.urlretrieve(url, source_path)

    data, sample_rate = sf.read(source_path, dtype="float32", always_2d=True)
    shaped = trim_and_shape(data, sample_rate, articulation)
    output_name = f"{articulation}-{pitch.lower()}.ogg"
    sf.write(OUTPUT_DIR / output_name, shaped, sample_rate, format="OGG", subtype="VORBIS")
    duration = len(shaped) / sample_rate
    size_kib = (OUTPUT_DIR / output_name).stat().st_size / 1024
    print(f"{output_name}: {duration:.2f}s, {size_kib:.1f} KiB")


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="a-game-violin-") as directory:
        temp_dir = Path(directory)
        for articulation in ("arco", "spiccato"):
            for pitch in ANCHORS:
                build_one(temp_dir, articulation, pitch)


if __name__ == "__main__":
    main()
