# Whisper project tools

When asked to add/upload a custom emoji pack, read `.agents/skills/whisper-emoji-import/SKILL.md` and use the restricted `whisper_emoji` MCP tools or their `npm run emoji:tool` local fallback. Import the complete pack; never substitute preview thumbnails for missing assets. This workflow only changes local emoji files and a new catalog migration. It does not authorize commits, pushes or deployments.

Project-local MCP configuration is in ignored `.codex/config.toml`; do not install it into global/account config or change Git credentials to use it. Instructions and portability details are in `docs/EMOJI-TOOLS.md`.
