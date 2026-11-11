# Bencho sources

Captured from the public Code panes on 2026-11-11:
- https://bencho.dev/?c=eye-tracker&theme=dark
- https://bencho.dev/?c=wake-slider&theme=dark
- https://bencho.dev/?c=slide-confirm&theme=dark

Original TSX files are unchanged. original.css contains their public stylesheet rules (plus matching gallery overrides). Public Code pane availability was verified without an account. Licence: https://bencho.dev/licence — free blocks and everything their Code pane supplies are MIT.

web/interactions.js adapts Watcher to vanilla DOM and ports the wake decay and fixed-right-edge handle morph. The original spherical eye projection has been replaced with a bounded shared face rig: eyes, mouth and glasses travel together, alternate cursor attention with forward-facing double blinks, and stay clear of the rim. Whisper adds share actions, incognito glasses, server challenge lifecycle, keyboard controls and contextual Vietnamese dialogue. Shape morph/demo knobs are omitted; eyes park their RAF after settling and blink on timers. Slide uses an equivalent critically damped spring instead of Framer Motion. CSS uses the original geometry with app theme variables. No React/Framer dependency or external font required.

Voice update: also inspected the public Code pane at https://bencho.dev/?c=voice-note&theme=dark and saved VoiceNote.tsx unchanged. That sample explicitly simulates speech and does not access a mic. Whisper borrows the pill/bar/playhead presentation and peak-resampling idea while implementing actual MediaRecorder capture, analyser waveform, encryption and lifecycle cleanup in web/audio.js. This is an adaptation, not a claim that the sample itself records.
