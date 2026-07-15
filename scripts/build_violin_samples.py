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
IOWA_LOW_SCALE_URL = (
    "https://theremin.music.uiowa.edu/sound%20files/MIS/Strings/violin2012/"
    "Violin.arco.pp.sulG.C4B4.stereo.aif"
)

ANCHORS = ("A3", "C4", "E4", "G4", "A4", "C5")


def source_name(articulation: str, pitch: str) -> str:
    if articulation == "arco":
        return f"Arco Vib/LLVln_ArcoVib_{pitch}_p.wav"
    return f"spic/LLVln_spic_{pitch}_v1_rr1.wav"


def trim_and_shape(data: np.ndarray, sample_rate: int, articulation: str) -> np.ndarray:
    channels = data if data.ndim > 1 else data[:, np.newaxis]
    peak = float(np.max(np.abs(channels)))
    if peak <= 0:
        raise ValueError("source sample is silent")

    frame_level = np.max(np.abs(channels), axis=1)
    onset_candidates = np.flatnonzero(frame_level >= peak * 0.012)
    if onset_candidates.size == 0:
        raise ValueError("unable to find sample onset")
    pre_roll = int(sample_rate * 0.025)
    start = max(0, int(onset_candidates[0]) - pre_roll)

    if articulation == "arco":
        end = min(len(channels), start + int(sample_rate * 3.2))
        fade_out_seconds = 0.12
    else:
        tail_candidates = np.flatnonzero(frame_level >= peak * 0.003)
        natural_end = int(tail_candidates[-1]) + int(sample_rate * 0.12)
        end = min(len(channels), natural_end, start + int(sample_rate * 1.5))
        fade_out_seconds = 0.06

    shaped = np.array(channels[start:end], dtype=np.float32, copy=True)
    shaped_peak = float(np.max(np.abs(shaped)))
    if shaped_peak > 0:
        shaped *= 0.72 / shaped_peak

    fade_in_frames = min(len(shaped), int(sample_rate * 0.012))
    fade_out_frames = min(len(shaped), int(sample_rate * fade_out_seconds))
    if fade_in_frames:
        shaped[:fade_in_frames] *= np.linspace(0, 1, fade_in_frames, dtype=np.float32)[:, None]
    if fade_out_frames:
        shaped[-fade_out_frames:] *= np.linspace(1, 0, fade_out_frames, dtype=np.float32)[:, None]
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


def build_native_low_notes(temp_dir: Path) -> None:
    """Extract native stereo C4 and D4 notes from Iowa's chromatic scale."""
    source_path = temp_dir / "iowa-violin-c4-b4.aif"
    urllib.request.urlretrieve(IOWA_LOW_SCALE_URL, source_path)
    data, sample_rate = sf.read(source_path, dtype="float32", always_2d=True)

    frame_level = np.max(np.abs(data), axis=1)
    window = max(1, int(sample_rate * 0.02))
    smoothed = np.convolve(frame_level, np.ones(window) / window, mode="same")
    sounding = smoothed >= max(float(smoothed.max()) * 0.025, 1e-4)
    edges = np.diff(np.r_[False, sounding, False].astype(np.int8))
    starts = np.flatnonzero(edges == 1)
    ends = np.flatnonzero(edges == -1)
    note_regions = [
        (start, end)
        for start, end in zip(starts, ends)
        if (end - start) / sample_rate >= 2.5
    ]
    if len(note_regions) < 3:
        raise ValueError("unable to isolate C4 and D4 from Iowa violin scale")

    for pitch, note_index in (("c4", 0), ("d4", 2)):
        start, end = note_regions[note_index]
        margin = int(sample_rate * 0.08)
        excerpt = data[max(0, start - margin) : min(len(data), end + margin)]
        shaped = trim_and_shape(excerpt, sample_rate, "arco")
        output_path = OUTPUT_DIR / f"arco-iowa-{pitch}.ogg"
        sf.write(output_path, shaped, sample_rate, format="OGG", subtype="VORBIS")
        print(f"{output_path.name}: {len(shaped) / sample_rate:.2f}s, "
              f"{output_path.stat().st_size / 1024:.1f} KiB")


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="a-game-violin-") as directory:
        temp_dir = Path(directory)
        for articulation in ("arco", "spiccato"):
            for pitch in ANCHORS:
                build_one(temp_dir, articulation, pitch)
        build_native_low_notes(temp_dir)


if __name__ == "__main__":
    main()
