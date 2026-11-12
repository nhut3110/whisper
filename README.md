# Whisper.

Live: https://whisper-nhut3110.vercel.app

Personal temporary messages with a small, framework-free browser UI. The browser encrypts/decrypts with Web Crypto AES-256-GCM. Production uses Vercel static hosting + a Supabase Edge Function and Postgres. The Rust Axum implementation remains available for local development and self-hosting.

## Run locally on macOS

Double-click **Start Whisper.command**, or:

```sh
./scripts/dev.sh
```

Open http://localhost:8787. The script generates a private, Git-ignored `.env` pepper on first run. It uses installed Rust or the isolated `/tmp/temporary-cargo` toolchain created during development. `/tmp` is temporary; install stable Rust from https://rustup.rs for continued use. Requires OpenSSL for first-run secret generation.

Default storage is `hush.db` (SQLite, local only). The same API is tested against PostgreSQL. No cloud account or deployment is configured by this command.

## Interface

The UI follows the first supported browser language, with English fallback. 16 complete local dictionaries: English, Vietnamese, Chinese, Spanish, French, German, Portuguese, Japanese, Korean, Russian, Arabic (RTL), Hindi, Indonesian, Thai, Italian and Turkish. Change language using the language icon in the header. No content is sent to a translation service.

A blank writing surface with only the W. monogram in the upper-left, copy and appearance controls, and a compact eye-tracking share companion. Click the eyes for a single settings panel with inline desktop Wake Slider or mobile Slide to Confirm. Completed links wear incognito glasses. There is no separate chevron. Thought bubbles appear for 5 seconds, rest, and cycle through localized lines. Expiry, single-read, PIN and rich text live in a native modal (a bottom sheet on mobile). No decorative landing content or permanent settings form. Light/dark defaults to the system; an explicit choice is remembered locally under `whisper-theme` (appearance only, never message data). Logo assets and usage notes are in [art/brand](art/brand/README.md). Bencho original component sources, MIT notice and porting notes are in [references/bencho](references/bencho/README.md). Receiver hints use authenticated, non-consuming metadata and show the actual expiry/single-read policy.

Copy the complete message, individual paragraphs, or the selected substring. Optional rich text supports bold, italic, underline and lists. It loads the locally vendored DOMPurify module only when formatting is enabled or a rich message is opened. No CDN. Safe pasted rich text is detected automatically. Typed Markdown and semantic HTML are automatically rendered on the receiving screen; Markdown headings, lists, quotes, code blocks and tables are supported. Images and unsafe links are stripped. HTTPS links open separately with no referrer. Clipboard supports HTML + plain-text flavors where available; otherwise manual selection/copy remains available. Rich payload markup counts toward the 256 KiB encrypted-content limit.

## Compact private links

New links look like `https://your-domain/#<22-character-secret>`. The fragment contains a cryptographically random 128-bit seed. In the browser, HKDF-SHA256 derives domain-separated encryption, access and lookup values. Only the derived lookup ID/access capability and ciphertext go to the API; the seed and AES key do not. No external shortener or server-side key mapping is used. Effective secret strength is 128 bits (the AES-GCM key is 256-bit derived material).

The sender's revocation capability stays separate and is not derivable from the recipient seed. Revocation links retain their existing format. Existing `/m/<id>#k=…&a=…` message links continue to work. Reloading a new short-link reading page returns to an empty compose screen because the fragment was removed; reopen the original full link to retry if still valid.

## Features

- No account, cookies, analytics, external fonts/scripts, inbox or history.
- Unicode text up to **256 KiB of UTF-8**, encrypted before upload.
- 10 minutes / 1 hour / 24 hours / 7 days expiry, plus custom minutes (1 minute–7 days).
- Optional single read; expiry always applies, whichever happens first.
- Optional random six-digit code, sent separately. Five **wrong nonempty** attempts destroy the record. A missing code prompts without consuming an attempt.
- Explicit open button: GET requests/link previews never read or burn a message.
- Atomic `DELETE … RETURNING`: exactly one winner for a single-use link.
- Separate sender-only revocation link.
- Fragments removed from current URL after load, keys retained only in page memory. Reloading requires reopening the original full link.
- Backend expiry sweep every 30 seconds while running; Supabase cron migration sweeps every minute independently.

“Opened” means the server has handed ciphertext to the first authorized open request. It cannot prove the recipient actually read it. An interrupted response may consume a single-use message before the browser receives it. The UI explains this rather than retrying automatically.

## Supabase

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). The dedicated personal Supabase project is `hzzmzskqmgowntzqfxrd` (Mumbai). Four versioned migrations configure encrypted storage, restricted access, transactional API operations and independent minute-level cleanup. Public/anonymous database roles cannot read the tables or call the privileged RPC.

GitHub Actions tests both implementations. After successful checks on a push to `main`, the backend workflow applies checksum-checked migrations and deploys the Edge Function. Vercel's native Git integration handles frontend builds. No additional container provider is needed for this architecture. Deployment verification status is recorded in [docs/QA.md](docs/QA.md).

## Verify

With Rust stable and Node 22+:

```sh
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test
npm ci
npm test
npx playwright install chromium
npm run test:browser
```

Browser tests start the app if port 8787 is unused, using isolated `test-results/browser.db`. If you already have an app running there, Playwright reuses it. Tests create disposable synthetic messages; do not point them at a public deployment. They include a real 60-second expiration wait and take about 1–2 minutes.

PostgreSQL API suite (use a dedicated disposable database):

```sh
TEST_DATABASE_URL='postgresql://postgres@127.0.0.1:55439/hush_test' cargo test
```

Tests bootstrap the first migration in that database and insert synthetic rows. Never target a production database.

Coverage:

```sh
rustup component add llvm-tools-preview
cargo install cargo-llvm-cov --locked
cargo llvm-cov --summary-only --ignore-filename-regex 'tests/|src/main.rs' --fail-under-lines 95
npm test
npm run test:browser
```

Rust coverage is for the API library, not the CLI/startup/background loop. Crypto unit coverage and browser UI coverage are separate. Browser raw coverage and summaries live in ignored `coverage/`. See [docs/QA.md](docs/QA.md) for observed results and limits.

## Security scope

Read [docs/SECURITY.md](docs/SECURITY.md). This is a personal MVP, not independently audited software. No promise of “no trace”: deletion removes the active encrypted row; backups, PostgreSQL WAL, device memory, screenshots and copies remain outside that promise. Never put cloud secrets in frontend code or commit `.env`. Cloud deployment credentials stay in ignored local files and GitHub Actions secrets. Git identity and authentication are configured locally for the personal repository only.

The project folder, Rust crate and local launcher are now named **Whisper**. Legacy database names and the `hush:…` cryptographic protocol labels remain unchanged for existing link/data compatibility; do not rename those protocol labels without a versioned migration.

## Voice messages

Choose the microphone icon. The companion moves into the writing area; hold it (or hold Space/Enter while focused) to record, release to stop. Live bars use a real microphone analyser. Listen, pause/seek, re-record, or share from the same link settings. Recording is limited to 2 minutes / 2 MiB; text/rich text supports 256 KiB of UTF-8. Microphone recording needs HTTPS or localhost and browser permission. Supported recording MIME types are selected through MediaRecorder capability detection (Opus WebM, MP4 or Ogg). Playback depends on recipient browser codec support; failures are shown.

Audio bytes, duration, waveform peaks and MIME type are packed together and AES-GCM encrypted locally. The API and database receive only ciphertext and the existing capabilities/policy; no separate upload service is used. Opening, one-use expiry, PIN and revocation use the same protocol as text. Mic tracks stop on release/cancel/tab hide/mode change; object URLs and clip references are cleared on replacement, successful share or leaving/closing. No speech-to-text or transcription service.

## Companion and sharing

Header order is theme, copy, language and text/voice. Voice mode keeps copy disabled so toolbar controls do not shift. Switching modes fades content and moves the same companion from its current displayed position, including when reversed mid-flight. Drafts and voice previews survive mode changes; active recording stops when leaving voice mode. Reduced-motion preferences bypass movement.

On touch devices the companion cycles nine gentle emotes, including curiosity, smiling, winking, blushing, surprise and sleepiness. Actual mouse input on hybrid devices restores bounded cursor following. Recording/playing expressions take priority, and hidden tabs pause animation timers.

Creating a link attempts to copy only the recipient link immediately; the PIN is never automatically included. Browser clipboard restrictions may require the visible Copy button. The creation screen reminds the sender that links are not saved in an inbox and must be copied before leaving. The mobile confirmation track fills its container on phones and touch tablets.

## Local music beta

`SUPABASE_PROJECT_REF=hzzmzskqmgowntzqfxrd npm run build:beta` builds the opt-in music experiment. Run `node scripts/preview-beta.mjs` and open http://127.0.0.1:8793/music-beta/. `npm run build` excludes music; the approved personal Vercel deployment uses `build:beta`. The main Text / Voice / Music (beta) switch now creates encrypted music-reference links using the existing expiry/PIN/one-read controls. Deezer streams previews only (up to 30 seconds); provider rights remain unresolved for public launch. See [music QC and limits](docs/MUSIC-BETA-QA.md) and [provider terms review](docs/DEEZER-REVIEW.md). `npm run test:music` runs repeatable fixture-based player regressions.

Hosted anonymous anti-spam controls and required server configuration are documented in [docs/ANTI-ABUSE.md](docs/ANTI-ABUSE.md). They use the existing Vercel + Supabase setup; no login or hardware fingerprint is required. The signed gateway secret must be configured in both services before deploying that revision.
