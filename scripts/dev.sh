#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
if ! command -v cargo >/dev/null 2>&1; then
  if [ -x /tmp/temporary-cargo/bin/cargo ]; then
    export PATH="/tmp/temporary-cargo/bin:$PATH"
    export CARGO_HOME=/tmp/temporary-cargo
    export RUSTUP_HOME=/tmp/temporary-rustup
  else
    echo 'Install Rust from https://rustup.rs first.' >&2
    exit 1
  fi
fi
if [ ! -f .env ]; then
  (umask 077; printf 'PIN_PEPPER=%s\n' "$(openssl rand -hex 32)" > .env)
fi
set -a
. ./.env
set +a
exec cargo run
