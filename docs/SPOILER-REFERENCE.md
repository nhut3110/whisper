# Spoiler visual reference

Reference inspected on 2026-11-13: https://www.threads.com/@special.leader/post/DTIePbYE9Pb

The public page's `BarcelonaSpoilerParticlesAnimation` and its actual canvas output were inspected. The reference uses solid circular particles (not a CSS blur or a repeating noise texture), a 3.5 CSS-pixel starting grid, 20% random omissions, small linear velocities, edge attenuation over 6 CSS pixels, and respawning within the text rectangles. Dark-mode color is #f3f5f7. Text appears over 150ms; the particle canvas fades over 250ms with ease-out timing.

Whisper implements a geometry-only simulator in `web/spoiler-dust.js` and one shared viewport painter in `web/spoiler-particles.js`. A vertical spatial index avoids scanning every line for each particle. Identical geometry does not reseed particles when unrelated DOM nodes disappear. Offscreen and hidden groups stop drawing; reduced motion draws a still frame. Large documents have an 8,000-particle budget; canvas resolution is capped at DPR 3.

## Comparison evidence

Local artifacts (ignored by Git) are under `coverage/manual/2026-11-13-sharing/`:

- `threads-whisper-comparison.webp`: moving comparison; actual Threads paragraph canvas above, actual Whisper receiver below, same text, 15px system font, 21px line height, and 590px width. Independent random streams, not synchronized particles.
- `threads-whisper-comparison.png`: a still from that capture.
- `spoiler-layout-390.png` and `spoiler-layout-1280.png`: actual editor after marking a selection, with the gutter outside the text.

A separate fixed-seed control compared the public reference renderer and Whisper's simulator on one 289.546875×18px text rectangle. Both generated 339 particles. The initial frame matched all 49,560 RGBA bytes; 120 subsequent frames had 15 differing channel bytes out of 5,947,200. This verifies the particle model at that geometry, not every layout or interaction. Normal screenshots are not pixel-identical because random seeds and frame times differ. Receiver word-width measurement can differ by fractions of a pixel from native text shaping. Do not describe the entire feature as universally pixel-identical to Threads.

Unlike the reference page, Whisper does not put unrevealed recipient text into DOM/ARIA attributes. Text remains in JS memory and appears in the DOM only after interaction. This is concealment from passive DOM/screenshot inspection, not protection against an interactive client or someone inspecting JS memory.

## Layout regression

Inline formatting spans must never be treated as paragraph blocks by the writing gutter. Textarea and contenteditable use the same 1.8 line height, and automatic promotion to rich text preserves scroll position. The mobile gutter is narrower and stays outside the paragraph. Browser regressions check line baselines and gutter bounds at 390px and 1280px, in addition to copy/reveal, editor undo and reduced motion.
