# Solo violin samples

These twelve game-ready Ogg files are derived from the **VSCO 2 Community
Edition** solo violin recordings by Sam Gossner and Simon Dalzell, with sample
cutting credited by the source project to Elan Hickler / Soundemote.

- Source: <https://github.com/sgossner/VSCO-2-CE>
- Upstream license: [CC0 1.0 Universal](https://github.com/sgossner/VSCO-2-CE/blob/master/LICENSE)
- Upstream library page: <https://versilian-studios.com/vsco-community/>
- Local build command: `uv run --with numpy --with soundfile scripts/build_violin_samples.py`

The build script downloads the `p` (soft) **Arco Vib** recordings, except for
A3 where the more stable `f` recording is used, and the first velocity/round-robin
**spic** recordings for A3, C4, E4, G4, A4, and C5. It
removes leading silence, retains a short bow pre-roll, folds stereo to mono,
normalizes conservatively, adds short edge fades, crops unused tails, and encodes
the results as Ogg Vorbis. The original source filenames are:

```text
Strings/Solo Violin/Arco Vib/LLVln_ArcoVib_A3_f.wav
Strings/Solo Violin/Arco Vib/LLVln_ArcoVib_{C4,E4,G4,A4,C5}_p.wav
Strings/Solo Violin/spic/LLVln_spic_{A3,C4,E4,G4,A4,C5}_v1_rr1.wav
```

CC0 does not require attribution, but this provenance is retained so the
recordings and transformations remain auditable.
