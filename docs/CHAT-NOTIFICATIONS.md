# Chat entry and notifications

## Cold entry

Chat is still lazy loaded. The bundle warms during idle time after 1.2s, or on pointer/focus/touch intent over the Chat button. Warming does not mount a hidden chat or start requests to room APIs. Lobby dropdowns use the existing shadcn NativeSelect component, avoiding the initial mounting cost of several Radix dropdown trees.

Local Vite measurements on 2026-11-14, fresh Chromium contexts, CPU throttled 4x, three runs per case:

- Before: 330–442ms from clicking Chat until the nickname field appears; largest post-click long task 110–137ms.
- After, fast cold click: 306–319ms; largest post-click long task 55–59ms.
- After idle/intent warmup: 99–131ms; 0–1 post-click long tasks, maximum 66ms.

These are local development measurements, not production network/mobile guarantees. Raw samples are in `/tmp/chat-entry-before.json`, `/tmp/chat-entry-after-final-cold.json`, and `/tmp/chat-entry-after-native.json` for this session.

## Notifications

An in-room bell enables/mutes notifications. System permission is requested only after pressing the button. The local preference is remembered. Default behavior never prompts on load. Notifications contain only the application name and a localized “New messages” label; message content, sender names, invites and encryption keys are excluded. A short generated tone needs a prior user gesture and browser audio support. No audio asset is downloaded.

The tab title shows the number of incoming unread messages even without system permission. History, self-authored messages, pending drafts, edits, reactions and repeated snapshots do not create duplicate new-message notifications. Focusing the active chat clears the badge and dismisses the system notification. Notifications use one generic replacement tag to avoid a stack of previews.

Active-room sync stays at 3s. A mounted room continues syncing every 10s while viewing another Whisper mode, and every 15s while the document is hidden. Presence stays unfocused when not viewing chat; background delivery does not mark messages seen. Browsers can throttle/freeze these timers.

This is **not Web Push**: the page must remain open and able to run. Closed tabs/apps, suspended mobile browsers and locked devices are not guaranteed delivery. Some mobile browsers require service-worker notifications and cannot use the Notification constructor; the title badge still works. There is no service worker, push subscription, backend/schema change or added provider in this change.
