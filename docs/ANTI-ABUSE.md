# Anonymous abuse controls

No login, invite, hardware fingerprint, or third-party CAPTCHA account is introduced. The existing slider remains a UI confirmation, not proof that the caller is human.

## Hosted request path

Browser → Vercel Node gateway → signed request → Supabase Edge Function → transactional PostgreSQL RPC.

- A random, HMAC-signed `__Host-whisper-device` cookie is Secure, HttpOnly, SameSite=Strict, path `/`, with a seven-day lifetime. JS cannot read it; no content, decryption key or link is stored in it. Client fetches now use same-origin credentials so the cookie can be sent and received.
- Client IP comes exclusively from Vercel's platform `x-vercel-forwarded-for` header. Local tests use the socket address instead. Arbitrary client forwarding/identity headers are not trusted. Missing platform identity fails closed. [Vercel header contract](https://vercel.com/docs/headers/request-headers#x-vercel-forwarded-for).
- Vercel derives a keyed network hash scoped to the UTC date, plus a keyed owner hash from the random cookie. Raw IPs never enter app DB payloads. This is pseudonymous abuse tracking, not a guarantee that hosting providers do not log request metadata. Rotation/clearing cookies changes the owner, so the IP and global budgets are necessary.
- Vercel signs owner/network, method, endpoint and timestamp. Edge checks the signature and a 30-second timestamp tolerance before database access. Direct unsigned calls to private-message actions are refused even with a forged Origin. Existing public health/policy-preview endpoints remain available without signing; previews retain their global RPC cap and never consume content.
- POST routes are allowlisted. JSON only; create bodies are capped at 2,850,000 bytes, other POST bodies at 4 KiB, including streamed bodies. The gateway has an additional bounded, warm-instance 60 requests/minute/network brake before buffering. This brake is best effort across cold starts; PostgreSQL remains the authoritative distributed limiter.

## Authoritative limits

| Scope | Limit |
|---|---|
| Owner/browser | 2 active links |
| Owner/browser | 10 create attempts/hour after request validation and challenge ownership check |
| Network | 30 create attempts/hour after request validation and challenge ownership check |
| Service | 200 create attempts/UTC day after request validation and challenge ownership check |
| Owner / network / service | 60 / 120 / 240 admitted POST requests/minute |
| Music search | 10/network/minute, 20/service/minute before calling Deezer |
| Storage | Existing 128 MiB ciphertext-character cap and 10,000-row cap |

Time budgets use fixed windows; boundary bursts remain possible. Failed creates can consume creation budgets. Unauthenticated synthetic identifiers never count as trustworthy hardware identity. The counters are shared across Edge instances; their updates commit even on rejected calls. A guard runs before JSON decoding in Edge. Indexes and the existing minute housekeeping job bound expired budget retention.

Count/insert is protected by the same PostgreSQL transaction lock as the storage cap. Expiry, successful burn-on-read, explicit revocation and five wrong nonempty PIN attempts release a slot. Challenge records are bound to their issuing owner. No link recovery list or local content storage is added. Existing messages created before the migration lack an owner hash and are exempt from the new per-owner slot count until their normal expiry.

Errors return 409/`activeLimit` or 429/`rateLimit`/`createLimit`, with local UI messages and Retry-After on throttling. Rate limits can also affect legitimate users behind a shared IP; the defaults target a small personal service.

## Deployment prerequisites and rollout

**Do not push/deploy this revision before configuration is ready.** The user requires separate approval for every push.

1. Create one random 32+ character `WHISPER_GATEWAY_SECRET`; store the same value in this project's Vercel server environment and Whisper's Supabase Edge secrets. Never use a public/`VITE_` variable, commit it, reuse another project's credential or print it. It is distinct from PIN_PEPPER.
2. Build/test both services, then deploy the new migration and Edge code together with the Vercel gateway revision. Coordinate the rollout: the migration requires owner fields and the new Edge code refuses unsigned requests, so mismatched old/new versions can temporarily reject creates. Existing ciphertext and capabilities are unchanged.
3. The existing Supabase workflow discovers the new checksum-checked migration automatically; no extra provider is needed. `index.ts` fails closed if the gateway secret is missing. The Vercel build bundles the gateway without embedding its runtime secret.
4. Verify cookie flags, spoofed-header refusal, direct-Supabase refusal, three parallel creates, real 429 responses, metadata/open/revoke, audio, previews and music on the deployed version.

The Rust local reference API retains its existing global rate/storage caps and slider checks. The hosted identity limits are implemented in the Vercel/Edge/Postgres path; use `scripts/edge-dev.ts` to test that path, not standalone `cargo run`. The local music lab and loopback `preview-beta.mjs` search likewise remain isolated provider experiments; hosted beta music uses the distributed admission path.

## Limits of protection

This reduces automatic mass creation and bounds accepted storage/creation, but cannot guarantee availability against a distributed denial of service. Rejected requests still reach hosting infrastructure, and shared global quotas can themselves be exhausted. Vercel/Supabase network-level protection, provider quotas, monitoring and spending controls remain necessary; no firewall or billing settings were changed in this revision. Large distributed attacks require provider-level mitigation, not more fingerprinting or JavaScript tricks. No load test was run against production or Deezer.

## Local verification

- 25 Node tests: signed cookies, changed paths/identities, expired signatures, direct calls, pre-body rejection, routing after Vercel rewrites, bounded burst checks, build isolation and previous crypto/preview checks.
- 24 real Edge/PostgreSQL integration tests: simultaneous creates, slot release via read/revoke/expiry/PIN, cookie/owner rotation under shared network limits, challenge ownership, budget expiry, daily/hourly quotas, distributed music limits and previous encrypted message/PIN/RLS flows.
- 9 browser regressions against the actual signed gateway + Edge handler + disposable PostgreSQL: encrypted text/rich/audio creation and reading, PINs, revocation, concurrent readers and mobile layouts. The added quota UI test verifies a persistent in-dialog error, retained draft, HttpOnly cookie and creation after a read frees a slot.

These are local checks. The shared secret and approved backend commit are deployed. Live smoke confirmed the two-link limit, slot release, PIN reading and direct unsigned request denial. Provider-level flood protection and load behavior remain unverified; no production load test was run.

## Test configuration prepared

A random 256-bit `WHISPER_GATEWAY_SECRET` has been configured on the dedicated
Whisper Supabase project and the personal `my-hobby19/whisper-nhut3110` Vercel
project (Production and Preview). Its local backup is in ignored
`.private/deploy.json`, mode 0600. Never expose it via `VITE_`/`NEXT_PUBLIC_`,
commit it, or reuse it for a user-facing PIN. Rotate the same value on both
services together. The gateway, migration and Edge code from approved commit `0e14145` are deployed. The initial CI browser batch itself reached the gateway request brake; the pending workflow fix separates server lifetimes without changing any production quota.
