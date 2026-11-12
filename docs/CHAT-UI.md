# Chat UI sources

The room UI composes the official **shadcn/ui `radix-nova` registry** rather than a custom chat bubble implementation. Sources retrieved on 2026-11-12:

| Component | Upstream source | Used for |
| --- | --- | --- |
| Message | https://ui.shadcn.com/r/styles/radix-nova/message.json | Sender alignment, avatar, header, content, footer |
| Bubble | https://ui.shadcn.com/r/styles/radix-nova/bubble.json | Incoming/outgoing surfaces and overlapping reactions |
| Message Scroller | https://ui.shadcn.com/r/styles/radix-nova/message-scroller.json | Follow live edge, preserve reading position, jump to latest |
| Attachment | https://ui.shadcn.com/r/styles/radix-nova/attachment.json | File metadata and accessible download trigger |
| Input Group | https://ui.shadcn.com/r/styles/radix-nova/input-group.json | Textarea with contextual reply/edit and attachment/send addons |
| Dropdown Menu | https://ui.shadcn.com/r/styles/radix-nova/dropdown-menu.json | Reply, copy, edit, delete |
| Popover | https://ui.shadcn.com/r/styles/radix-nova/popover.json | Reaction picker and room participants |
| Dialog | https://ui.shadcn.com/r/styles/radix-nova/dialog.json | External-link, file, destruction and leave confirmations |
| Select | https://ui.shadcn.com/r/styles/radix-nova/select.json | Room settings |

Upstream license: MIT, https://github.com/shadcn-ui/ui/blob/main/LICENSE.md.

Local integration changes in `frontend/components/ui`: resolve `cn` and registry imports to project aliases; replace registry-only `IconPlaceholder` with its specified Lucide icon; expose Radix `Popover.Close` to close the reaction picker. Preserve upstream component structure and variants. `@shadcn/react/message-scroller` supplies the actual scroll behavior.

`frontend/chat/chat.css` supplies Whisper layout, spacing, typography, palette, responsive behavior, and scoped overrides for the legacy HTML shell defaults. `frontend/styles.css` adds the missing shadcn muted/card/popover color tokens. No global Tailwind preflight is introduced, to avoid changing the existing note/audio/music UI.

Transport, encryption, admission, limits and expiry remain in the existing room implementation. This UI change does not introduce a new backend service. The chat route and its controls remain lazy-loaded.

## Conversation grouping and message details

- Avatar and Tooltip also use official `radix-nova` sources: https://ui.shadcn.com/r/styles/radix-nova/avatar.json and https://ui.shadcn.com/r/styles/radix-nova/tooltip.json.
- Adjacent messages from one participant within two minutes form a visual group. The final incoming bubble displays that participant's deterministic local avatar; one receipt appears at the end of each outgoing group.
- Desktop hover/focus reveals the full sent time through shadcn Tooltip, without inserting rows into the conversation. Touch or pen taps toggle a compact time row beneath that message. Pointer travel/long press/selection and nested links, files, reaction buttons or menus do not toggle it. This state is local to the message component and survives polling.
- Reactions use one compact summary pill, showing up to three emoji types and a total count. Its shadcn Popover lists participants and lets the current participant remove their reaction. No remote avatar/image service is requested.

## Emoji picker and private pack publishing

Chat uses Emoji Mart 5 (MIT), loaded on demand when an emoji picker opens. The native Unicode dataset is bundled locally; no third-party search or image request is required. The pinned Unicode fixture and its version are recorded in `shared/emoji-info.json`. Glyph appearance and support for newer characters depend on the recipient's OS. Official Emoji Mart CSS is served as a local stylesheet in its shadow root to preserve the strict CSP without `unsafe-inline`.

Reactions first open a compact six-emoji strip with a plus button; the plus opens the full picker used by the composer, including search, skin tones and separate custom pack categories. Picker width matches its content; small custom categories shrink vertically. The composer stores plain text plus `:pack_shortcode:` tokens; known tokens render local images. Message text remains encrypted. As with Unicode reactions, reaction emoji and membership are room metadata, not encrypted content.

There is deliberately no upload endpoint or public admin UI. Only someone with repository write and deployment access can publish a pack. To prepare a pack, download a ZIP yourself (or use a local folder), check the creator's rights and record permission in a text file. Emoji.gg is a source of community uploads, not a blanket redistribution license; four public preview assets from the requested Pepe pack are included for personal/local evaluation, with source and rights limitations recorded in the registry. The full 31-emoji ZIP was not accessible behind its verification/login flow.

```sh
node scripts/import-emoji-pack.mjs \
  --source /path/to/pack.zip --id pepe --name Pepe \
  --origin https://emoji.gg/pack/195211-pepe \
  --license /path/to/permission.txt --attribution 'Creator name'
```

This is a dry run. Repeat with `--apply` after reviewing permission and preview. The tool writes content-addressed PNG/GIF/WebP assets, the shared registry and a new Supabase catalog migration. It never commits, pushes, deploys or changes credentials. Review the diff, run the checks/build, apply the new migration, then deploy frontend and Edge function together through the normal approved release process. Do not rename or replace published IDs: existing messages reference those tokens. To update artwork, publish a new pack ID. Failed writes may leave unreferenced local assets; inspect the diff before retrying.

Limits: 200 emoji per pack, 256 KB each, 16 MB archive, 256×256 pixels, 120 frames. Active SVG/HTML, symlinks, traversal paths and invalid image data are rejected. These checks reduce accidental unsafe uploads; pack permission and visual quality still require owner review. No new credential grants are necessary.

`generate-chat-emojis.mjs` is a maintenance tool for the initial Unicode catalog, not part of normal pack import or build. Do not regenerate an already deployed migration; future Unicode upgrades must use a new migration. The original Whisper mascot sample pack is included to exercise custom emoji end to end.

CSP verification distinguishes the picker from existing shell/Radix behavior: Emoji Mart itself uses an external local shadow stylesheet and makes no external requests. Browser diagnostics still observe blocked inline styles from the prerendered non-chat shell and Radix scroll-lock helpers. The test records these separately; it does not claim the entire app has zero CSP warnings. No CSP permission was broadened for the picker.

## Conversation motion and emoji-only messages

Messages containing only recognized Unicode emoji/known custom shortcodes use a transparent bubble with larger glyphs; mixed text and attachments keep the regular bubble. Grapheme segmentation keeps flags, skin tones and ZWJ families intact. A weak cache keyed by the decrypted content object avoids rescanning unchanged content on each room poll, without retaining old message text after room data is cleared.

Reaction panels use short native CSS/Web Animations: staggered quick choices, selection feedback, an arrival pulse on changed reaction counts, and a FLIP transform between the quick strip and full picker. No width/height tween or permanent animation loop is used. The picker is warmed on trigger hover/focus; opening the quick strip does not mount the full grid. Timers/frames are cleaned up on unmount, and reduced-motion users receive immediate state changes without decorative motion.

## Shared application chrome

Chat now uses `SiteHeader` with the same brand geometry, icon treatment and mode-switch styling as the message composer. Its companion is the shared `Mascot` component and watcher rig, using the existing comic thought cloud CSS and expression cycle. Theme changes dispatch the same `whisper:theme-toggle` event as the composer, including the mascot-origin reveal and reduced-motion fallback. Rooms retain a dedicated scrolling conversation, not a separate visual identity. On narrow layouts the companion sits beside room controls, leaving the composer unobstructed. Identical sync responses no longer replace the decrypted conversation state.

## Open Graph previews

Link cards use the image/domain/title/short-description hierarchy reviewed on metatags.io, with a compact URL-only fallback. The room gateway checks membership through the existing sync endpoint before retrieving metadata (seen stays unchanged; presence is refreshed and typing is cleared). The server sees the preview URL; message plaintext and encryption keys are not sent to this endpoint. No third-party preview API is used. Images are fetched by the server and displayed through local blob URLs, with no browser requests to the linked site. Metadata is not persisted, responses are no-store, and the client keeps at most eight in-memory request results per room. Private/reserved addresses, IP literals, unusual ports, credentials, own Whisper links, redirects to private networks, oversized responses and unsafe image types are rejected. DNS addresses are validated and pinned for each connection, with a seven-second retrieval deadline. These are application checks, not a penetration-test certification.

## Unified composer modes

Chat is the fourth button beside Text, Voice and Music in the shared header. It loads on demand on the root screen (`/?mode=chat`), retaining text/media drafts and the current room when switching. Hidden chat suspends polling; expiry still clears its content. Invites use `/?mode=chat#r=…&a=…&k=…`; the fragment is removed after joining. Legacy `/chat` links are normalized to the same root screen. The composer controller and chat panel keep separate rendering ownership so switching does not remount editor/media islands.
