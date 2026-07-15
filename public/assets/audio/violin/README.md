# Solo violin samples

These game-ready Ogg files are derived from the **VSCO 2 Community Edition**
solo violin recordings by Sam Gossner and Simon Dalzell, plus native stereo C4
and D4 notes from the University of Iowa Musical Instrument Samples.

- Source: <https://github.com/sgossner/VSCO-2-CE>
- Upstream license: [CC0 1.0 Universal](https://github.com/sgossner/VSCO-2-CE/blob/master/LICENSE)
- Upstream library page: <https://versilian-studios.com/vsco-community/>
- Iowa source: <https://theremin.music.uiowa.edu/MISviolin2012.html>
- Local build command: `uv run --with numpy --with soundfile scripts/build_violin_samples.py`

The build script downloads the `p` (soft) **Arco Vib** recordings and the first
velocity/round-robin **spic** recordings for A3, C4, E4, G4, A4, and C5. It
removes leading silence, retains a short bow pre-roll, preserves both stereo
microphone channels, normalizes conservatively, adds short edge fades, crops
unused tails, and encodes the results as Ogg Vorbis. The original source
filenames are:

```text
Strings/Solo Violin/Arco Vib/LLVln_ArcoVib_{A3,C4,E4,G4,A4,C5}_p.wav
Strings/Solo Violin/spic/LLVln_spic_{A3,C4,E4,G4,A4,C5}_v1_rr1.wav
Violin.arco.pp.sulG.C4B4.stereo.aif (native C4 and D4 extracted)
```

CC0 does not require attribution, but this provenance is retained so the
recordings and transformations remain auditable.
