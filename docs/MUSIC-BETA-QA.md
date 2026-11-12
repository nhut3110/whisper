# Integrated music beta — 2026-11-12

The personal beta is part of the main Text / Voice / Music switch. Search has its own screen; selection and recipient use the minimal sleeve/vinyl + mascot view. The recipient intro yields to playback, with a click fallback for browsers that refuse autoplay. A small share button opens the existing link settings/confirmation. Theme and language follow the parent (Vietnamese/English, English fallback for other music locales).

Music links contain an encrypted Deezer track reference. Recipient metadata is freshly resolved; existing expiry, six-digit PIN, burn-on-read and revocation apply. No audio files enter the message database. The beta is lazy-loaded. Changing mode, closing a message, hiding the page or opening privacy warnings pauses the player. The child can be framed only by the same origin; its extra CDN policy does not apply to text/audio content.

Local verification:

- 25 Node tests, including numeric lookup validation and sanitized provider responses.
- 24 real Edge/PostgreSQL tests, including quotas and distributed music admission.
- 57 existing Rust-backed browser tests passed (3 Edge-only cases skipped in that run); the Edge-only cases were exercised separately.
- 9 browser regression flows through the signed gateway/Edge/PostgreSQL.
- 2 integrated browser cases with deterministic provider/media fixtures: encrypted reference -> fresh recipient lookup -> playback -> close -> consumed link denial; mobile layout and mode-switch cancellation/draft preservation.
- 3 standalone player tests covering intro, real media events with fixture audio, cancellation, reduced motion and 320px layout.
- Manual local integrated search against real Deezer returned Rick Astley results; preview playback reached its actual end at 29.988563 seconds. Desktop sleeve/art/mascot were visually inspected. Physical mobile devices, speaker output and iOS autoplay have not been verified.

This revision has not been pushed/deployed. The shared gateway secret is already configured on personal Vercel Production/Preview and dedicated Supabase Whisper; the pending migration/gateway require coordinated rollout. See [abuse controls](ANTI-ABUSE.md) and [provider review](DEEZER-REVIEW.md).

---

The following is historical QC for the earlier preview-only build.

# Music beta / animation QC — 2026-11-11

## Scope and build

Music is an opt-in preview player, not a sharing feature. The user approved enabling this beta on the personal Vercel deployment on 2026-11-11. See [provider review](DEEZER-REVIEW.md). `npm run build` excludes it, while `vercel.json` now selects `npm run build:beta` for the approved personal deployment; no Supabase schema or private-message payload change is required.

```sh
SUPABASE_PROJECT_REF=hzzmzskqmgowntzqfxrd npm run build:beta
node scripts/preview-beta.mjs
```

Open http://127.0.0.1:8793/music-beta/. The built artifact lives in `.vercel/output`. This loopback preview supports static frontend and real music search only; test private messages through the regular Rust or Edge dev server.

The beta begins with a centered mascot/cloud, moves the bot down, reveals the sleeve/vinyl and attempts playback. Delayed autoplay may be blocked by browser policy: tap the sleeve or bot to play. The bot wears headphones and a hand microphone, with dance/mouth/notes and record rotation driven by actual media events. Back navigation, hidden tabs and interrupted intros cancel pending playback. Reduced motion disables decoration. No progress bar, audio extraction, persistence or shareable music link is provided.

## Verification

- 18 Node tests passed, including build opt-in/CSP isolation and upstream search validation/error handling.
- 57 existing browser tests passed (3.6 minutes), including encrypted text/audio lifecycle, waveform playback, narrow layouts, cursor bounds, touch emotes, reduced motion and interruption of text/audio transitions.
- 3 music browser tests passed: intro/visibility/geometry + actual fixture media state, cancellation during navigation, 320px/reduced-motion. Their search/audio responses are fixtures.
- Separately, real built API search returned Rick Astley tracks. Browser decoding/playback progressed and the actual preview ended at 29.988563 seconds. Artwork, dark/light mobile layouts, intro cloud spacing, microphone and headphones were visually inspected. No runtime browser errors observed. Speaker output and physical mobile devices were not verified.

## Animation changes and measurement

Pointer events are coalesced to a single geometry read per animation frame. IntersectionObserver replaces synchronous visibility layout checks. Unchanged SVG attributes are not rewritten; numeric face geometry is rounded to subpixel precision. Waveform heights use fixed geometry and transform scaling; unchanged peaks are not rewritten during playback. Bubble exit uses opacity/transform instead of animated blur. Existing finite animation loops, offscreen/hidden pauses and reduced-motion behavior are retained.

`node scripts/profile-animations.mjs` compares HEAD and working-tree source overrides against the local Rust server on port 8787. The same 390x844 viewport, pointer moves and repeated text/audio transitions run at Chrome CPU slowdown 6. This is a short desktop simulation, not a device/battery test or proof of universal smoothness.

Observed comparison: p95 frame interval 16.7ms in both versions; long tasks 0 in both; frames over 33.4ms 1 → 0; style recalculations 1013 → 699 (about 31% fewer). Layout duration was slightly higher (0.0598s → 0.0637s); total task duration slightly lower (0.636s → 0.617s). No large FPS gain is claimed. Metrics vary with system load and random emotes.

A separate 390x844 / CPU slowdown 6 run through the built beta's real search, intro and playback observed p95 16.7ms, with a short startup long task. It is still possible to see an occasional startup hitch; this work does not guarantee zero jank on midrange phones. Images use asynchronous decoding. Real iOS autoplay, hardware performance and power consumption remain unverified.

## CI failure

Run [43041337281](https://github.com/nhut3110/whisper/actions/runs/43041337281) failed during `playwright install --with-deps chromium`: Ubuntu package hosts could not resolve, so browser tests never started and the dependent Supabase deploy was skipped.

The workflow now pins Ubuntu 24.04 and exports the preinstalled runner Chrome path through `CHROME_PATH`, which the browser configs already honor. It fails explicitly if Chrome is missing. All prior tests/coverage remain; music regressions are added. This removes the failing apt-install path, but the fix is not verified on GitHub until an approved push triggers a new run. The first local QC completed before push. The user subsequently approved pushing this revision and enabling the preview beta for personal testing; verify GitHub/Vercel status after that push.
