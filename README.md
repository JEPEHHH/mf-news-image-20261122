# THE WORLD — front page for Sunday 22 November 2026

One program, one image, no dependencies.

`node main.ts` writes `/output/entry.png` — a 1520 x 2520 PNG (8-bit RGBA) that reads
as a serious newspaper front page summarising the world news of 22 November 2026.

    node main.ts        # -> /output/entry.png

## What it draws

| block | content |
|---|---|
| masthead | "THE WORLD", date, volume, evening edition, teaser strap |
| lead (60% of page height) | CLIMATE — COP31 ends with no global climate deal; deck, byline, globe graphic, two-column story |
| right rail | Democrats take the US House · fire aboard the Russian ship Sparta II (photo strip) · Islam to pass Christianity by 2035 |
| footer | IN BRIEF — Ukraine, West Bank, Haiti, China |

The lead package occupies exactly 60% of the page height, measured from the first
baseline below the masthead to the rule above the briefs.

## How it is built

* **No dependencies at all.** Only `node:fs` and `node:zlib`.
* **PNG is written by hand**: an RGBA byte buffer, per-scan-line adaptive filtering
  (the cheapest of the five PNG filters), `zlib.deflateSync`, and a table-driven CRC32.
  Chunks are IHDR + IDAT + IEND.
* **Type is drawn, not loaded.** A 5x7 bitmap font for A-Z, a-z, 0-9 and punctuation is
  defined in the source as `#`/`.` pixel tables and stamped out as pixel squares. Display
  type is set on a square grid with a heavier stroke; body copy is set condensed
  (narrower cells) so the measure stays newspaper-like. Every block measures its text and
  picks the largest size that fits, so nothing is ever clipped or truncated.
* **Artwork is procedural**: a wireframe globe with meridians, parallels, a fractured
  heating flank and an ink frame; a burning ship silhouette (hull, deckhouse, funnel,
  mast, flames, smoke, reflection). Both are screened with a 4x4 Bayer halftone so they
  sit on the same press as the type.
* **Print texture**: warm paper gradient, corner vignette, deterministic two-level grain.
* **Deterministic**: no `Date`, no `Math.random`, no network. Two runs produce
  byte-identical files (sha256 `f95dedde2c2fd7fc72fdeea7bb59eeabff094cd0cd6372e2627c960d26a6da12`
  on Node 22.22.1).

## Verification

Runs of `node main.ts` were hashed three times — one hash. The file was then decoded by
an independent PNG reader (python `zlib`/`struct`): signature, every chunk CRC, and the
inflated scanline size all check out, header reads 1520x2520 / 8-bit / colour type 6
(RGBA) / non-interlaced, every sampled pixel is fully opaque, and no text block overflows
its allotted box (`node main.ts` prints a layout report for each block).

## Layout

    page      1520 x 2520, 56 px margins, 12 px gutters
    lead      920 px wide, 1512 px tall (60.0% of page height)
    rail      448 px wide
    briefs    two columns x two rows, under an ink bar

Requires Node 22 (runs `.ts` directly through native type stripping).

MIT licensed.
