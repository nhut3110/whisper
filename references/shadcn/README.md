# shadcn/ui

The TypeScript Button, Input, Textarea, Label, NativeSelect, Checkbox and ContextMenu sources in
`frontend/components/ui` were retrieved from the official new-york-v4 registry:
`https://ui.shadcn.com/r/styles/new-york-v4/{name}.json` on 2026-11-12.

shadcn/ui is MIT licensed. See LICENSE. Import paths use the project's `@` alias
and the small modular Radix packages. NativeSelect's chevron and Checkbox's tick use inline SVGs
so one icon does not add another dependency. Whisper's original CSS and native
mobile pickers take precedence over the primitive defaults.

Mascot/bubbles, voice recording/playback, PIN cells, verification sliders,
rich-text editor and native top-layer dialogs remain custom.

ContextMenu uses the official Root, Trigger, Content and Item implementations with
the modular `@radix-ui/react-context-menu` import. Content accepts a portal container
to work inside native top-layer dialogs. Unused submenu and radio variants are omitted.
The context-menu surface loads on demand, preserving the existing selection/clipboard
bridge. Radix owns focus, keyboard navigation and collision handling.
