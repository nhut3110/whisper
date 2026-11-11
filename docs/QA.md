# Local QA — 11 November 2026

Final local build: Rust Axum API + browser interface in `whisper/`. Blank writing surface inspired by the supplied blankweb.online reference; secondary controls are in a modal/bottom sheet.

## Observed automated results

- **21 Rust API integration tests passed on SQLite.** The same 21 passed against a real isolated PostgreSQL **13.14** Docker instance (not Supabase cloud).
- **8 crypto unit tests passed** using Node Web Crypto: Unicode, fresh key/IV, tamper/wrong-key failure, UTF-8 bounds, fragment validation, random token/PIN shape.
- **31 Chromium end-to-end tests passed**, including a real 60-second TTL expiration wait. Final full run took about 1.2 minutes.
- `cargo clippy --all-targets -- -D warnings` passed; Rust formatted with rustfmt.
- DOMPurify/esbuild/browser test dependencies: npm install audit reported 0 vulnerabilities. This is not a full application security audit.

Measured coverage (not estimates):

| Scope | Line coverage | Branch coverage |
| --- | ---: | ---: |
| Rust API library `src/lib.rs`, LLVM | 98.49% | Not enabled/reported by this LLVM invocation |
| Crypto module, Node unit tests | 100% | 100% |
| Browser app module, V8 browser execution | 100% | 97.88% |
| Rich helper, V8 browser execution | 100% | 100% |

Rust startup/CLI/background loop `src/main.rs`, test source, and third-party DOMPurify internals are excluded from these application coverage numbers. Browser coverage is V8→Istanbul source coverage, not a proof of all security properties. No combined full-project percentage is claimed. The normal writing page loads about 26 KiB of local HTML/CSS/JS before HTTP headers (no CDN/fonts/images); this is an asset-size observation, not a mobile-network load-time benchmark. Reports regenerate into ignored `coverage/`.

## Cases exercised

- Default single-read create/open/clear/second-open refusal, database row physically absent from the live table after consume.
- GET preview navigation does not consume. Concurrent **12 API callers** produce exactly one winner. Two real browser tabs also produce exactly one successful recipient.
- Timed messages can reopen until expiry; expired access denied; cleanup deletes expired rows. A real one-minute TTL was waited out in browser tests.
- Missing PIN prompts without consuming attempts; wrong and correct retries; fifth wrong nonempty PIN deletes; correct timed opens do not reset the wrong-attempt budget. Invalid access tokens cannot read or lock out legitimate recipients.
- Separate revocation secret; open capability cannot revoke. Sender revoke prevents further reads.
- Unicode and multiline content; oversized UTF-8 rejection; malformed requests, unknown fields, body size cap, origin rejection, global create limiter, generic database-error responses.
- Stored ciphertext and capability/PIN hashes inspected by tests. Browser create request checked to contain no plaintext or AES key.
- No localStorage/sessionStorage/cookies created by normal messaging use; explicitly choosing appearance stores only `whisper-theme`; fragment removed from current URL; reload cannot recover its key; malformed/missing-fragment failure. Same-path hash navigation reinitializes the receiving screen.
- Clipboard copies link/PIN/revocation secret, entire plain message, individual paragraph, selected substring, and formatted HTML + text. Permission failure has a manual-copy message. Clipboard tests wait for asynchronous write completion.
- Formatting toggle preserves text. Bold toolbar, safe pasted formatting, sanitize before encrypt and on read, literal script-looking plain text, malicious HTML/image/script/link stripping, formatted clipboard roundtrip, optional-module download failure fallback. Plain mode makes no requests for rich modules.
- Modal settings are hidden on the main surface; Escape closes and restores focus; close button works. Mobile viewport overflow assertion passed at 390×844.

## Actual manual/visual checks

Using a separate named agent-browser Chromium session:

- Inspected the supplied reference live, including its More menu; no login/save/share actions were performed on it.
- Created a disposable Vietnamese message with optional PIN; manually tried an incorrect code, then the generated code and saw the decrypted content.
- Inspected mobile compose/read, blank canvas, and settings sheet screenshots. Opened settings and enabled rich formatting through the sheet, then manually typed, selected, applied bold and created a new encrypted link in the final layout.
- Verified the blank main surface and mobile settings sheet with axe WCAG 2 A/AA: **0 violations** for the inspected states. This does not imply every state/all assistive technologies passed.
- Applied the actual permission migration locally with test `anon`/`authenticated` roles. Privilege checks returned false for both; `SET ROLE anon; SELECT …` failed with permission denied. RLS migration applied successfully.

## Explicit limits

- Local Chromium only. No actual iPhone/Android/Safari manual test or adverse mobile-network benchmark. Browser mobile emulation is not a physical device.
- **No Whisper Supabase cloud project, Supabase cron run, hosted Rust deployment, Git commit or push was completed.** Migrations, Dockerfile, CI and deployment instructions are prepared. The Supabase `pg_cron` migration remains to be validated in a real dedicated project.
- Native Docker image build and future GitHub Actions run were not executed; local equivalents of the main checks were run.
- Not an independent penetration test. No promise of zero traces in backups/WAL/recipient devices. Browser encryption cannot protect against a maliciously replaced frontend.

## Compact link update

New recipient links are `/#<22-character base64url seed>`, 45 characters total on localhost versus about 159 in the prior format. The seed is generated with 128 bits of cryptographic randomness; HKDF-SHA256 derives independent lookup, access and encryption values. Secret strength is 128 bits; no seed/key is uploaded or mapped through a third-party shortener. Revocation remains a separate secret and its existing format is unchanged.

Short links, PIN, timed/single-read, rich text and separate revocation pass the browser suite. Legacy URLs are still accepted; new records were also opened through their equivalent legacy format. Known independent HKDF vectors pin protocol v1 compatibility. Malformed/noncanonical short fragments fail without an open request. Client-supplied lookup IDs are validated and duplicate creates return 409 without overwriting ciphertext, verified on SQLite and PostgreSQL. The test harness now serializes first PostgreSQL schema initialization, so parallel tests on an empty database do not race CREATE TABLE.

Manual named-browser QA created and opened a real disposable compact URL locally and verified the receiving and decrypted states. Reloading a fragment-cleared short URL returns to the blank compose surface with no decrypted content.

Current browser-only crypto source coverage is 95.74% lines / 100% branches; its full Node unit suite remains 100% lines / branches. These scopes are deliberately separate. No cloud deployment or push was performed for this update.

## Whisper branding, grouped actions and themes

Renamed the project folder and Rust crate to `whisper`, updated the title and local launcher, and added an original SVG waveform-w logo/wordmark plus favicon. Existing database and cryptographic namespace values were deliberately kept for compatibility. The create-link button is icon-only and is joined to its settings dropdown trigger in one bordered group. Both actions retain accessible labels and tooltips. The modal is explicitly labelled for the current link.

Light/dark covers compose, settings, generated links, receiving, reading and closed states. A small local script applies preference before CSS paints, defaults to OS preference and follows OS changes until an explicit selection. Only the appearance value is persisted; no draft/message data is stored. Tests exercise reload persistence, OS changes, blocked storage, untouched drafts, 320px header fit and all messaging flows in dark mode. Theme script V8 coverage: 100% lines/branches/functions. Browser app coverage is 100% lines / 97.88% branches / 85% functions; do not equate line coverage with every callback path.

Manual Chromium visual inspection covered light/dark desktop at 1280×800, light mobile at 390×844 and the dark mobile settings sheet. Dark compose axe: 0 violations, with one incomplete check for aria-controls pointing at the closed native dialog; the target ID exists and opening it works. The opened dark settings sheet reports 0 violations and 0 incomplete checks. Native iOS/Android/Safari remain untested. Rust API tests (21), crypto unit tests (8), browser tests (31), and Clippy passed after this update. No new PostgreSQL/schema behavior was introduced in this UI change; prior PostgreSQL verification still applies to unchanged SQL.

## Whisper. interactive sharing update (2026-11-11)

Supersedes the earlier waveform/logo and joined-action layout notes above. Header now contains only W.; name is Whisper. Original public Bencho Watcher.tsx, WakeSlider.tsx, SlideConfirm.tsx and CSS are archived with licence and adaptation notes in references/bencho. The app ports their sphere projection, wake energy decay, and fixed-right-edge morph into vanilla JS, with incognito glasses and contextual dialogue. No React/Framer runtime or remote font was added. Eye RAF parks after settling, stops when the element/tab is hidden, and blinking uses timers.

Validation: 23 Rust API integration cases + 1 expiry/consumption unit case, 8 crypto unit cases, 34 Chromium browser cases, strict Clippy. Rust API library line coverage 98.07%; Node crypto 100% lines/branches. Clean V8 browser coverage before the final geometry correction: app 100% lines / 97.79% branches; interactions 100% lines / 97.97% branches. Coverage scopes remain separate.

New cases cover required verification, exact target, too-fast attempts, expiry, rejection/replay consumption, mobile verification, authenticated metadata without consuming a single-read record or exhausting PIN attempts, keyboard desktop/mobile controls, partial mobile drag return, canceled verification, failed challenge fetch/retry preserving draft, eye movement and incognito state, accurate timed receiver copy, reduced motion and 320px overflow. Existing encryption/PIN/rich text/copy/timed expiry/two-tab race tests continue to pass.

Manual named-browser Chromium checks: desktop eyes → settings → real pointer drag to target → created link; receiver opened and decrypted on mobile viewport; light mobile sheet and real full slide → created link. Visual inspection caught the handle initially sitting outside its mobile track because reset measured a hidden sheet (zero width). Travel is now clamped nonnegative; regression assertions check actual handle bounds and label opacity after opening. Final mobile/eye/keyboard/dark regression checks are recorded below. Dark glasses use black lenses in both themes.

Limit: gesture verification is not a strong CAPTCHA; an automated client can solve it. Server enforces expiring one-use challenges and existing budgets. All checks are local Chromium/SQLite in this update, not physical iOS/Android or new Supabase cloud/Postgres verification. No deployment, commit or push.

Final correction verification: all 6 focused browser cases passed (mobile create/read, 320px geometry + partial drag/keyboard confirmation, W. header, eye tracking/incognito, failed challenge retry, dark flow). Manually re-opened the light mobile sheet: handle sits 4px inside the track and the label is visible; final screenshot /tmp/whisper-slide-mobile-final.png.

## Soft W., locales, thought bubbles and encrypted voice (2026-11-11)

Supersedes earlier UI/32 KiB limit descriptions. W. now uses smooth curves; the chevron is removed. Bot click opens one settings sheet with verification inline. The toast clears after 4.5 seconds and clears on editing. Thought bubbles grow from two round dots, show for 5 seconds, disappear for several seconds, and avoid repeating the preceding line (12 compose lines in English/Vietnamese, 6 in each other supported locale). Hidden tabs pause bubbles. Reduced-motion bypasses movement.

16 complete local UI dictionaries with English fallback and browser-language detection were checked for missing entries and preserved variable placeholders. Manual override persists only whisper-language; message contents never enter a translation service. Arabic switches layout direction. Browser tests iterated all language choices and reload persistence.

Text/rich content now allows 256 KiB UTF-8; a ~100 KiB multiline Unicode message was encrypted, opened and compared exactly. Binary audio accepts an encrypted envelope up to 2 MiB. Browser voice recording uses real MediaRecorder and Web Audio analyser, not Bencho's simulated sound. The archived Bencho VoiceNote.tsx explicitly states that its demo does not record; Whisper implements the actual capture/encryption lifecycle.

Validation: full 40-case browser suite passed; 10 focused cases passed after final lifecycle/UI cleanup, including 2 new cases (42 distinct cases exercised). 11 Node crypto/locale cases passed; crypto module 100% lines and branches. 24 Rust integration cases + 1 challenge unit case passed on SQLite; Rust library line coverage 98.17%, with startup/tests excluded. Strict Clippy passed. Browser source coverage is reported separately by scripts/browser-coverage.mjs and is not evidence that every hardware/permission path ran.

Audio browser tests use Chromium's real fake-device microphone fed by the synthetic tests/fixtures/voice.wav. They do not replace MediaRecorder/analyser with a mock. Checked non-flat actual waveform samples, stop-on-release tracks, preview play/pause/seek, ciphertext-only request with MIME/peaks inside the encrypted envelope, decrypt/envelope roundtrip, receiver playback, single-read refusal, clear revoking/removing media, denied mic permission, delayed permission after release, switching to text while holding, re-record/delete, rapid consecutive holds, pagehide cleanup, and malformed/unsafe envelope rejection. Normal recording/clip states were inspected in screenshots on desktop/mobile. This verifies synthetic audio capture and browser playback, not recording quality on a real phone microphone.

Manual named agent-browser inspection: soft logo and English fallback, dark mobile voice introduction with visible thought bubble, combined desktop/mobile setup and inline slider, Vietnamese language switch, and recording/preview images from the real browser tests. Mobile voice introduction axe WCAG 2 A/AA: 0 violations, 0 incomplete. Local server remains at http://localhost:8787. Physical Safari/iOS/Android and cross-browser codec interoperability remain untested; no external deployment, commit or push.

PostgreSQL confirmation: all 24 API integration cases passed against a fresh disposable PostgreSQL 13.14 instance, including the maximum encrypted audio payload and aggregate-usage SQL. This is local PostgreSQL compatibility, not a Supabase cloud deployment.

Final visual cleanup: removed the duplicate mobile slider heading and restored the source-style SVG arrow. Both final mobile setup and real MediaRecorder end-to-end smoke cases passed again. Final Vietnamese mobile setup axe: 0 violations / 0 incomplete; screenshot /tmp/whisper-settings-inline-mobile-final.png.


## Shared face and bubble alignment (2026-11-11)

Replaced the spherical eye-only projection with one bounded face rig containing eyes, mouth and glasses. Cursor input uses soft saturation, a damped spring, limited travel and subtle shell tilt. Attention alternates 3.2–5 seconds following with 1.6–2.4 seconds facing forward and a double blink. Touch does not leave a stuck gaze; reduced motion centers the face. Animation frames park when settled and pause in hidden tabs.

Text and recording bubbles now anchor to the same share dock. Voice bubbles center above the bot; corner bubbles aim their tail at the companion. The recording waveform no longer uses a separate viewport-based position.

Validation: all 6 focused Chromium cases passed, including two new checks for extreme cursor clearance, return-to-center/blink/resume, and centered text/real synthetic-mic recording bubbles at 320, 390 and 1280px. Existing gaze/incognito, timed bubbles, encrypted voice roundtrip/playback and mobile recording-switch checks passed. Inspected rendered light desktop/mobile introduction, recording and preview screenshots plus dark voice view using an isolated agent-browser session (closed afterwards). No physical-device or Safari validation; no backend changes, commit, push or deployment.


## Supabase Edge production port (2026-11-11)

This section supersedes older statements that no dedicated cloud project exists. A dedicated Free Whisper project was created in Mumbai. All four versioned migrations have been applied through the project-scoped Management API; both independent cron jobs are enabled. Deployment is being verified; enabled jobs alone do not prove a successful run.

The same framework-free client now has a TypeScript Edge handler backed by a transactional PostgreSQL RPC. Fourteen integration cases passed against disposable PostgreSQL 13.14, including encrypted roundtrip, metadata, one-winner concurrent burn, concurrent PIN lockout, expiry/revoke, challenge replay/timing, shared budgets, table/RPC role restrictions, maximum 2 MiB encrypted payload, collision refusal, origin/JSON/size checks and generic provider failure. Handler coverage: 100% lines, 92.31% branches. TypeScript checking and the Vercel public-file build passed.

Eight Chromium flows passed against the actual Edge handler and local PostgreSQL: text creation/read/clear, PIN retries, five-wrong-code destruction, timed/revoke, two-tab race, mobile viewport, sanitized rich text/copy and real MediaRecorder capture/encrypted voice/playback. The local bridge now uses the production CSP: the first run exposed its missing CSP in the malicious-rich-editor test; this was corrected and all eight passed. Audio still uses a synthetic Chromium microphone; no physical device or Safari check is claimed.

Cloud API verification completed directly against the deployed Supabase Function: health, exact-origin rejection, non-consuming metadata, AES-GCM roundtrip, concurrent single-read (one winner), PIN retry/lockout, timed reopening and revocation all passed using disposable messages. A production-only routing issue was detected: the Supabase runtime passes function-relative `/whisper/...` paths. Routing now handles that prefix; a regression case covers it without relaxing origin checks.

Cloud role checks confirmed `anon` and `authenticated` cannot SELECT the message table or execute the privileged RPC. Both cron jobs reported real `succeeded` runs; a disposable expired message and stale challenge were subsequently absent from the live tables. Live Vercel UI and GitHub automation remain pending until push/import are complete.


## Verified hosted deployment

Production URL: https://whisper-nhut3110.vercel.app. Vercel reported Ready for commit `cbf9d3e25141b80ce97feaa69c40b49c26c162ee`, sourced from personal `nhut3110/whisper`, branch `main`. The same public-API smoke checks also passed through Vercel's `/api` proxy, verifying the actual frontend origin and route configuration.

GitHub CI [43014680059](https://github.com/nhut3110/whisper/actions/runs/43014680059) succeeded, including Rust checks/coverage, crypto/locales, PostgreSQL Edge integration, frontend build and browser suites against Rust and Edge. It automatically triggered Supabase deployment [43015579401](https://github.com/nhut3110/whisper/actions/runs/43015579401), which succeeded at checked migrations, function deployment and live health. This verifies the backend push-to-CI-to-deploy chain, beyond local equivalents.

Manual Chrome production check: typed disposable Vietnamese content, enabled a PIN, completed the app slider through supported keyboard interaction, created a compact link, opened it in a separate recipient tab, tried a wrong code, then decrypted with the correct generated code. The correct text appeared; closing cleared the display, and reopening the original link showed unavailable. The fragment was removed from the URL. Screenshots captured the real settings and decrypted result. No real personal message content was used.

No physical-phone microphone, Safari or network-adversity test is claimed. Audio capture/playback and responsive behavior are covered by the local/CI Chromium cases described above, not a manual production hardware test. The dedicated local QC container was removed. No company repository or global account configuration was modified.
