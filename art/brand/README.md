# Whisper.

Minimal W. monogram: a soft curved W stroke with round caps and a separate period, built as SVG without fonts.
- whisper-logo.svg: light background
- whisper-logo-dark.svg: dark background
- web/whisper-mark.svg: neutral favicon

The app header shows only the monogram. The product name is Whisper. (including the period).

All geometry now comes from `frontend/lib/brand.ts`. Run `node scripts/generate-brand.mjs` and `node scripts/generate-og.mjs` after changing it. The soft stroke and filled period match the header, favicon and all three social images.
