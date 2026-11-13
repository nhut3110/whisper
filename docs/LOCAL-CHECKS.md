# Release checks

Run `npm run check:linux` before proposing a release push. It requires Docker
Compose and builds the same pinned Linux arm64 image used by GitHub Actions:
Ubuntu Noble, Node 24.22.1, Rust 1.99.1, cargo-llvm-cov 0.9.1, Playwright 1.65.0
and its bundled browser. The image is limited to 2 CPU / 7 GB RAM on both sides.
On Apple Silicon it runs natively inside the Linux VM; CI uses the public
`ubuntu-24.04-arm` runner. The image does not reproduce the physical CPU or network
of a GitHub runner.

The build context excludes `.private`, `.git`, env files and generated assets.
Only report directories are bound into the container. No Docker socket, user home,
Git configuration or credentials are mounted. Postgres is available only on the
Compose network. Containers are removed afterwards; dependency/build caches use
project-specific Docker volumes. To discard those caches, run
`docker compose -f compose.checks.yml -p whisper-release-checks down --volumes`.

`npm run check:local` remains a faster native-machine check (macOS/Linux), useful
while editing; it is not evidence of Linux/browser parity. This command never commits,
pushes, or deploys. A successful run prints `PASS: all 16 checks`.

Requirements: Node.js 24, Docker, a Rust toolchain with rustfmt, Clippy and
llvm-tools-preview, `cargo-llvm-cov`, and Chromium available to Playwright.
Install the Rust coverage tool with `cargo install cargo-llvm-cov --locked`.
Use `CHROME_PATH` if Chrome is not in the Playwright/agent-browser cache.
Stop development servers on ports 8787, 8788 and 8792 first: the gate refuses
to reuse them or stop unrelated processes.

The local command creates its own PostgreSQL 17 container on a random loopback
port, ignores any supplied database URL, and removes the container afterwards.
Test migrations destroy test tables; never point individual test commands at a
real project database.

The gate installs locked npm dependencies, checks TypeScript/builds, Rust
formatting/Clippy, SQLite and PostgreSQL API tests, Rust coverage (minimum 95%),
Node unit tests, Edge API tests, the production frontend package, isolated music
tests, the complete Rust browser suite, and Edge text/audio, chat and music flows.
Each browser suite owns a fresh server, so assets and in-memory rate budgets
cannot leak from a previous suite. No automatic retries hide failed tests.

Logs and a machine-readable step summary are under `coverage/checks/<timestamp>/`.
Browser failures retain screenshots and Playwright traces in `test-results/`.
For a failing trace, use `npx playwright show-trace <path-to-trace.zip>`.

GitHub Actions invokes `node scripts/check-container.mjs`, exactly as
`npm run check:linux` does locally. The container runs `npm run check:ci` with its
isolated `hush_test` service database. An `environment.json` report records runtime
and browser revisions alongside each run. It uploads logs and browser artifacts on
failure. Passing local checks is evidence for this machine and browser, not a
guarantee for all devices or remote services. Push still requires review of the
personal remote, branch, author and committer, followed by explicit approval.
