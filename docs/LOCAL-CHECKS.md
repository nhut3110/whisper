# Release checks

Run `npm run check:local` before proposing a push. This command never commits,
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

GitHub Actions invokes the same steps with `npm run check:ci`, using its own
loopback `hush_test` service database. It uploads logs and browser artifacts on
failure. Passing local checks is evidence for this machine and browser, not a
guarantee for all devices or remote services. Push still requires review of the
personal remote, branch, author and committer, followed by explicit approval.
