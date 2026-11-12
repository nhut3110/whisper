# Deezer: terms review and local feasibility experiment

Reviewed 2026-11-11. This is an engineering assessment, not a legal clearance or a provider approval.

## Decision

The user approved integrating music-reference sharing into the main layout for personal beta testing on 2026-11-12. The feature streams only provider-hosted previews and stores an encrypted numeric track reference, never a music file. Ordinary builds keep music disabled; the personal Vercel build explicitly enables it. This user decision does not establish provider approval or settle licensing for a public launch. The official-source findings below remain relevant before going public.

## Official sources and constraints

- [Developer Terms](https://developers.deezer.com/termsofuse): I/II describe free access for personal applications, subject to acceptance and compliance. III requires necessary rights and prohibits unauthorized music sharing. IV requires non-commercial use, restricts direct/indirect association with brands/logos, and confines content use to a private family scope. This leaves the Whisper-branded friend-to-friend sharing feature unresolved, even without charging users. IX requires prior Deezer review/approval for other uses. II/VI permit restricting or withdrawing service without notice.
- [Integration Guidelines](https://developers.deezer.com/guidelines): content varies by user region; the public API provides 30-second extracts rather than unrestricted full-track audio. Audio must not be offered for download. Local/offline audio storage is prohibited without contacting Deezer.
- [API documentation](https://developers.deezer.com/api) redirects to login. No current authenticated rate-limit specification was obtained. The public search response carried no quota headers. A historical number repeated online is not treated as a current quota guarantee; do not load-test to discover the limit.

Before a public launch, obtain clarification/approval from Deezer for the exact branded, ephemeral sharing design, permitted player controls and attribution, registration/access, geographic handling and quotas. No contact message has been sent, and no new account or credential has been created.

## Local experiment

Run `node experiments/deezer-preview/server.mjs`, then open http://127.0.0.1:8791.

- Loopback only; separate technical page. Explicit submit searches the public API via the local server, at most one upstream search per second. This is our conservative cap, not a claim about Deezer's quota.
- Select a result and play the provider's existing preview with a native audio element; link back to the original track and identify the source.
- No audio proxy, extraction, trimming, waveform decoding, persistent cache, download button, Supabase upload, or shared-message creation. `preload=none` delays fetching until playback. Selecting a track or opening the local recipient preview starts a short introduction followed by a playback attempt; browser autoplay policy may require another tap. Ordinary streaming still involves browser buffering.
- Requests go to Deezer/CDN, which receive network metadata. Ephemeral deletion in Whisper could only remove our reference; it cannot delete the publisher's track or their logs. Do not claim end-to-end confidentiality for third-party playback.
- Public search and an MP3 range response were verified without a key. This proves technical reachability only, not permission to launch or guaranteed availability.

The default production build copies a fixed frontend allowlist and excludes this experiment. `INCLUDE_MUSIC_BETA=1` explicitly adds the beta assets/search function; the user approved enabling this preview-only beta on their personal Vercel deployment. Public music-sharing launch still requires resolving the rights review. Push still requires user approval.

## Observed manual checks

- Browser search: Rick Astley returned the original song plus alternate mixes. Selecting the original and clicking native Play produced `readyState=4`, `paused=false`, a progressing current time (~1.80s observed), and duration `29.988563s`.
- Selecting another result paused playback and reset current time. Starting a new search removed the previous audio source.
- Vietnamese search `Hào Hoa Jack J97` returned `Hào Hoa` by `Jack - J97` and two other results, with loaded cover artwork.
- At 390px viewport, the list and selected player fit without horizontal overflow. Empty search results displayed the expected message. No browser runtime errors were reported.
- Short/oversize queries returned 400, unknown paths 404. Of two simultaneous valid searches, one was forwarded and succeeded, one received our local 429. No upstream load test was performed.
- This is Chromium desktop with a narrow viewport, not a physical iPhone/Android test. Playback state confirms browser decoding; no assertion is made about physical speaker output.

## Vinyl UI iteration

The isolated local player now renders a square album sleeve over a grooved vinyl disc, with track/artist captions, an accessible play/pause button, time/seek controls, and the existing Whisper face rig wearing headphones. Playback events control the rotating disc and small decorative dance/notes. This is a preset dance, not audio beat analysis. Pausing, waiting/seeking and ending stop motion; reduced-motion preferences disable the decorative animation while preserving audio playback. A hidden document pauses playback. No audio processing, extraction, new audio storage or sharing has been introduced.

Verified with real `Hào Hoa` preview in Chromium: `playing` started the disc and bot animations; clicking the bot paused both and changed the SVG icon; keyboard seeking to the end stopped both; clicking replay resumed playback. Light/dark views were inspected and the 320px and 390px layouts fit without horizontal overflow. Reduced-motion emulation returned `animation-name: none` for both the disc and bot while audio remained playable. No runtime browser errors were reported. These are desktop Chromium/narrow-viewport checks, not physical-mobile verification.

## Minimal separate screens (supersedes the timeline layout above)

Search/results now live on a dedicated library screen. Choosing a track opens the confirmation stage; the eye control opens an in-memory recipient preview of the same minimal player. The preview is a local UI simulation, not a shareable recipient link. Both stages show only the sleeve/vinyl, track/artist, headphone mascot and a small Deezer source link, with navigation outside the content. All progress, duration and seek controls/listeners have been removed. The whole sleeve/disc and the mascot are accessible play/pause buttons. Ordinary playback status stays screen-reader accessible; failures are visibly explained.

Manual Chromium checks: real audio starts both animations; pause stops both; seeking near the end through the QC console lets the actual ended event stop both (no seek control is exposed to users). Opening recipient preview pauses/resets playback; returning to the library clears the audio source, retains query/results and restores focus to the chosen track. At 320x740 and 390x844 the player fits without horizontal overflow; no range inputs remain. No runtime browser errors were reported. This remains an isolated preview experiment; music sharing is not enabled.

## Opt-in beta build and singing introduction

`SUPABASE_PROJECT_REF=hzzmzskqmgowntzqfxrd npm run build:beta` creates `.vercel/output` including `/music-beta/`. `node scripts/preview-beta.mjs` serves the built artifact at http://127.0.0.1:8793/music-beta/. This preview serves static pages and the music search function only; private-message APIs are not emulated. `npm run build` excludes the beta unless explicitly enabled through the environment.

A brief centered cloud/bot introduction precedes a transform-only move down and record fade-in. Playback then attempts to start; if browser policy blocks it, the sleeve/bot remains a tap-to-play fallback. The bot wears headphones and holds a microphone; disc, dance, mouth and notes track actual playing/pause/waiting/ended events. Navigation and visibility changes cancel pending introductions. Reduced motion skips decorative animation. No shareable music messages have been implemented.

`npm run test:music` uses synthetic search/media fixtures for repeatable state, cancellation and mobile/reduced-motion tests. Separate manual checks against the built beta used real Deezer search and the Rick Astley preview, which reached its actual end at 29.988563 seconds. These evidence sources must not be conflated.


## Integrated personal beta — 2026-11-12

The main Text / Voice / Music (beta) switch embeds the tested player at a same-origin route. A numeric `{provider:"deezer",id}` reference is sealed with the normal message key inside `whisper:music:v1` and follows the existing PIN/expiry/burn/revoke lifecycle. Receivers resolve fresh metadata from the server and stream directly from the provider CDN. There is no music-file upload, download, caching or full-track support.

The selected reference is encrypted at rest, but the provider/CDN sees search, metadata and playback requests. This does not make music listening anonymous or private from Deezer or the hosting providers. The beta frame alone can fetch CDN covers/audio; the parent keeps its existing external image/media restrictions and allows only self-origin frames. Frame messages require both the exact origin and expected sender.

The earlier sections describe historical preview-only iterations; the integrated personal beta supersedes their statements that shareable music links are absent.
