# Editor shortcuts

Hover a formatting button to see the shortcut. macOS uses Command; Windows/Linux use Control. Inline shortcuts only run while one of the writing surfaces has focus, ignore composition input, and preserve the current selection when promoting plain text to rich text.

| Action | macOS | Windows/Linux |
| --- | --- | --- |
| Bold | Cmd+B | Ctrl+B |
| Italic | Cmd+I | Ctrl+I |
| Underline | Cmd+U | Ctrl+U |
| Strikethrough | Cmd+Shift+S | Ctrl+Shift+S |
| Spoiler | Cmd+Shift+P | Ctrl+Shift+P |
| Inline code | Cmd+E | Ctrl+E |
| Link | Cmd+K | Ctrl+K |
| Clear text formatting | Cmd+Backslash | Ctrl+Backslash |
| Block style | Cmd+Option+0–9 | Ctrl+Alt+0–9 |
| Duplicate current block | Cmd+Shift+D | Ctrl+Shift+D |

Block digits: 0 paragraph, 1–3 heading, 4 checklist, 5 bullets, 6 numbered list, 7 toggle, 8 code block, 9 quote. The block picker displays individual shortcuts.

Existing editing gestures: `/` opens the block menu, Enter creates a line/block, Shift+Enter inserts a line break within a block, Tab/Shift+Tab moves between table cells or indents/outdents list items, and Up/Down on the focused drag handle reorders a block. ArrowRight at a spoiler's end or Escape exits spoiler formatting. Escape also exits code/toggle/callout/quote contexts. These behaviors depend on the caret context; Escape is not a universal reset of every inline style.

Markdown-like block triggers followed by Space: `#`, `##`, `###`, `-`, `*`, `1.`, `>`, three backticks, `[]`, `[ ]`, `[x]`, and `---`.

Shortcut routing and hover hints are defined together in `frontend/editor-shortcuts.ts`. Browser tests cover macOS/Windows modifier mapping, style application, inline code, clearing styles, spoiler exit, heading conversion and opening the link editor. Tests use Chromium with platform overrides; they do not prove OS-reserved shortcuts are available in every browser or keyboard layout.
