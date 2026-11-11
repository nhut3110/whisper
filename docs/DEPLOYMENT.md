# Whisper deployment

## Architecture

Production has two providers: Vercel serves the static browser UI and proxies `/api/*` to the dedicated Supabase Edge Function `whisper`; Supabase Postgres stores ciphertext, capabilities as hashes, PIN HMACs and transactional request/challenge budgets. The Rust server remains an alternative local/self-hosted implementation; it is not run by Vercel or Supabase.

- Personal repository: `https://github.com/nhut3110/whisper`
- Vercel personal workspace: `my-hobby19`
- Supabase project: `whisper`, reference `hzzmzskqmgowntzqfxrd`, Mumbai (`ap-south-1`), Free.

Do not reuse an unrelated or company project. The SQL migrations are only for this dedicated database.

## Initial configuration

1. Set `SUPABASE_PROJECT_REF` in Vercel. It is a public identifier, not a credential. The build uses `npm ci --ignore-scripts` then `npm run build`; `scripts/build-web.mjs` emits Vercel Build Output API v3 with an explicit public-file allowlist, strict CSP, no-store headers and external API rewrites.
2. Store a project-scoped management token in the repository Actions secret `SUPABASE_ACCESS_TOKEN`; set Actions variable `SUPABASE_PROJECT_REF`. Token rights are Project Settings read, Database read/write, Edge Functions read/write and Edge Function Secrets read/write. No other project's permissions are required. Local copies belong only in ignored `.private/` with mode 0600.
3. Set Edge Function secrets `APP_ORIGIN` to the exact stable HTTPS frontend origin without a trailing slash, and `PIN_PEPPER` to a cryptographically random secret of at least 32 characters. Neither belongs in Vercel's public build. Supabase supplies its internal service-role environment variables. Rotating the pepper makes existing PIN-protected messages inaccessible.
4. Run `node scripts/deploy-supabase.mjs` with the scoped token and reference in the environment. It applies migrations through the Management API without a database password, records SHA-256 checksums in a private schema, and verifies both cleanup jobs are enabled. Never edit an applied migration; add a new one.
5. Run `npx --no-install supabase functions deploy whisper --project-ref "$SUPABASE_PROJECT_REF" --use-api --yes`. The function intentionally has `verify_jwt=false`: anonymous requests authenticate with high-entropy message capabilities, not Supabase user accounts. Tables and privileged RPC remain inaccessible to anonymous/authenticated public roles.
6. Connect only `nhut3110/whisper` to Vercel and verify the actual stable domain. Preview origins are not automatically trusted by the API. If the stable domain changes, update `APP_ORIGIN` and verify it before sharing links.

## Automatic deployments

`.github/workflows/ci.yml` checks Rust, browser crypto/locales, Edge integration tests on disposable PostgreSQL, frontend build and Chromium flows against both APIs. `.github/workflows/deploy-supabase.yml` runs only for successful push checks on `main` in `nhut3110/whisper`, checking out the exact tested commit. It applies migrations and deploys the function, then verifies API health. A manual workflow dispatch is available. Deployment jobs are serialized.

Vercel's native Git integration builds frontend pushes independently of the backend workflow. Keep changes backward compatible: add database columns/endpoints first, then clients, then remove old interfaces in a later release. This setup is not an atomic rollout across providers. Do not configure a second Supabase Git integration that also deploys the same migrations/functions.

## Verification and limits

Verify `/health`, text/rich/audio messages, PIN limits, metadata without consumption, timed expiry/revocation and a two-recipient single-read race on the actual stable site. Confirm both cron jobs have successful real run records and delete a disposable expired fixture. A health response is process liveness only; a successful create/open also checks database connectivity. Record results in `docs/QA.md`.

Messages are encrypted before upload. SQL deletion clears the active row; provider logs, backups/WAL, browser memory and recipients' copies cannot be promised to vanish. The custom gesture is not strong bot protection; shared request/storage budgets only suit a small personal deployment. Free provider quotas and project-pausing policies still apply. No paid resources are required by this configuration.

## Personal Git isolation

Repository-local author/committer is `nhut3110 <jatsu3110@gmail.com>`, remote is `https://github.com/nhut3110/whisper.git`. Ignore global Git configuration for publication commands and use isolated personal authentication; do not change or use company global credentials. Before pushing, inspect both author and committer, destination, branch and staged files. Never commit `.env`, `.private`, database files, coverage artifacts or credentials.
