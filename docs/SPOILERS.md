# Selected text spoilers

Select text and use the crossed-eye action in the writing toolbar or chat composer.
Chat uses `||selected text||`; rich messages retain a sanitized `data-spoiler` span.
Plain messages also support `||text||`, and Markdown can contain inline spoilers.

Receiver rendering holds concealed fragments in JS memory. Their text, links and
nested markup are absent from the live DOM until click/keyboard activation.
Placeholder geometry is measured in memory to follow the text flow. One shared Canvas2D painter animates independent particles with individual drift, brightness and phase; it never draws glyphs. Dimensions disclose approximate text length. At most 512 layout pieces are created per span, with roughly 5,000 visible particles shared across the viewport. Large scenes cap at 30fps, smaller ones at 60fps; hidden/offscreen scenes stop. Reduced motion renders a static frame. Reveal scatters the particles for 360ms. The painter is shared across bundled and legacy module URLs.
Copy uses the current visible DOM and substitutes `[•••]` for unopened spans.
Chat reply quotes and audit titles remain redacted; concealed URLs never request
link previews. Editing a changed spoiler resets its reveal state.

This helps against casual screenshots, DOM text scraping and automatic previews.
It is NOT encryption beyond the existing encrypted message transport. Decrypted
content remains accessible to an interactive bot or someone inspecting JS memory.
Never promise screenshot prevention or bot-proof secrecy. Revealing is an explicit
accessible button action, independent per span. No new schema or API is required.

Reference: the user-provided Threads post, inspected in their logged-in browser.
Threads itself includes spoiler text in accessibility labels; Whisper deliberately
keeps that plaintext out of ARIA as well.

## Live author preview

Marking a selection in the rich editor immediately conceals it using the same
particle painter. Click inside the marked text to edit normally. Move the caret
outside, blur the editor or press Escape to conceal it again. Decorations never
enter the editable DOM or serialized message: author text, formatting, paste and
native undo remain intact. The sender's editor contains their own draft text;
the receiver still holds unopened spoiler contents outside the DOM.
