# Local emoji tools

This is an owner-operated local MCP stdio server, not a public upload endpoint. The project skill at `.agents/skills/whisper-emoji-import/SKILL.md` describes the complete-pack import workflow. Example future request: “Add this pack to Whisper: https://emoji.gg/pack/195211-pepe”.

## Scope

Only three tools are exposed:

- `emoji_packs_list`: list registered pack names/counts.
- `emoji_pack_prepare`: fetch the exact public Emoji.gg API record and its ZIP, or read a ZIP basename from `emoji-import-local/inbox/`; validate every asset and produce a 24-hour plan. Preparation does not publish.
- `emoji_pack_apply`: revalidate the staged bytes and add an immutable pack locally. Produces a catalog-only Supabase migration, never executes it.

The launcher starts Node 24+ with its permission model, no child-process/worker permission and a small filesystem allowlist. It strips inherited environment secrets. Reads are limited to tool scripts, dependencies, package metadata, shared static data, emoji assets/catalog migrations and the dedicated import folder. Writes are limited to `public/emoji-packs/`, the emoji registry and its two temporary lock/manifest files, `supabase/migrations/` and `emoji-import-local/`. Tool arguments cannot select roots, arbitrary paths, SQL, shell commands or Git/deploy actions. Existing packs are immutable. Source/download URLs allow only HTTPS Emoji.gg endpoints; redirects are revalidated; payloads/timeouts are bounded.

Node grants a whole migration directory; the fixed importer further restricts output to a NEW `<timestamp>_emoji_pack_<id>.sql` containing catalog inserts. This is not a general SQL writer. Symlink/hardlink destinations are rejected and writes are serialized; normal failures roll back newly installed assets/migrations before the registry is committed. An OS/process crash can leave a lock or staged files; inspect them before removing the lock and retrying.

Sharp requires `--allow-addons`. Node emits a warning for this flag: its permission model is defense in depth, not an OS sandbox against malicious native dependencies or a hostile local user. This tool uses the project's installed Sharp; do not execute unreviewed dependencies in it. The restricted tool does not limit a separate agent's existing terminal access.

## Setup

The local `.codex/config.toml` is already prepared on this machine and ignored by Git. Open **the Whisper repository** as a trusted project and reload/start a new Codex session to load the MCP tools. Configuration does not change account/global config or Git identity. For another machine, use its absolute Node path and absolute repository path:

```toml
[mcp_servers.whisper_emoji]
command = "/absolute/path/to/node"
args = ["/absolute/path/to/whisper/scripts/emoji-tool.mjs"]
startup_timeout_sec = 15
tool_timeout_sec = 180
```

The same restricted worker also works without MCP registration:

```sh
npm run emoji:tool -- emoji_packs_list '{}'
```

MCP tool arguments for a downloaded complete pack:

```json
{
  "pack_url": "https://emoji.gg/pack/195211-pepe",
  "id": "pepe_full",
  "name": "Pepe",
  "attribution": "Creator credited by the source listing",
  "permission": "Record the actual license, permission or owner-authorized personal evaluation purpose here; this field does not grant rights.",
  "archive_file": "pepe.zip",
  "expected_count": 31
}
```

Put the ZIP at `emoji-import-local/inbox/pepe.zip` first. The example count must be checked against the live full listing before import. Apply only the `plan_id` returned by prepare, never construct a plan manually.

## Source availability and release

Emoji.gg documents its legacy packs API at https://emoji.gg/developer (`https://emoji.gg/api/packs`). It may be stale or blocked by Cloudflare. In the 2026-11-13 live probe, both the API and the requested Pepe page returned HTTP 403. Direct-link fetching therefore remains dependent on upstream availability; local ZIP and API-fixture integration are tested independently. The tool does not bypass challenges or fall back to a few preview images.

Optional `resize_to_fit: true` normalizes oversized source images before validation, retaining all emoji and GIF frame counts/timing. Original ZIPs remain in the inbox and their hashes are recorded. It never truncates a pack or discards animation frames.

All-or-nothing limits: 1–200 images; 256 KB each; 16 MB compressed/decompressed pack; PNG/GIF/WebP only; 256x256; 120 frames. Invalid/missing/duplicate assets reject the whole plan. No public/commercial rights are inferred from downloading a community pack.

After local import, run the checks and normal personal-account-approved release process to make assets and catalog entries available to all users. The MCP server has no release credentials and cannot publish them.
