# Architecture: pi-profile (pii)

## Overview

`pii` is a profile launcher for the [pi coding agent](https://pi.dev). It lets you define named profiles — each bundling a specific set of packages, skills, and model settings — and launch pi with any of them. It ships in two forms:

1. **Standalone CLI** (`bin/pii`) — run from any shell, shows an interactive menu or launches directly with a named profile
2. **In-pi extension** (`extensions/index.ts`) — registers a `/pii` slash command inside pi that does the same

Both forms share the same core logic: profile discovery, runtime directory preparation, skill hiding/restoring, and child process management.

## Profile Definitions

Profiles live in `~/.pi/profiles/<name>/settings.json`. Each file is a standard pi settings file with an added `pii` block:

```json
{
  "pii": {
    "description": "Observability only — no skills, no extra extensions",
    "flags": ["--no-skills"]
  },
  "defaultProvider": "anthropic",
  "defaultModel": "claude-sonnet-4-20250514",
  "packages": [
    "git:github.com/imran-vz/pi-observability"
  ]
}
```

- **`pii.description`** — shown in the interactive menu
- **`pii.flags`** — CLI flags passed to the child pi process (e.g., `--no-skills`, `--hide-user-skills`, `--skill <path>`)
- All other keys are standard pi settings (provider, model, packages, etc.)

Profiles are discovered by scanning `~/.pi/profiles/` for subdirectories containing `settings.json`.

## Runtime Directory

On each launch, `pii` creates a temporary directory under the system temp dir:

```
tmpdir/pii-<profileId>-<uuid>/
├── settings.json          ← copied from the profile
├── git                    ← symlink to ~/.pi/agent/git/
├── auth.json              ← symlink to ~/.pi/agent/auth.json
├── models.json            ← symlink to ~/.pi/agent/models.json
├── sessions               ← symlink to ~/.pi/agent/sessions/
└── observability          ← symlink to ~/.pi/agent/observability/
```

`PI_CODING_AGENT_DIR` is set to this temp dir so pi reads the profile's settings instead of the default `~/.pi/agent/settings.json`. Shared state (auth, sessions, git packages) is symlinked so it's available across profiles and persists between launches. The temp dir is left for the OS to clean up — it's small and short-lived.

## Skill Management

This is the most involved part of pii. Pi auto-discovers skills from two locations regardless of `--no-skills`:

- `~/.agents/skills/`
- `~/.config/agents/skills/`

When a profile uses `--no-skills` or `--hide-user-skills`, pii must prevent these directories from being picked up. It does this through a **rename-hide / restore** cycle:

### Hide Phase (before spawning pi)

1. For each known skill directory, check if it exists via `accessSync`
2. If it exists, rename it to `<path>.pii-hidden` (e.g., `~/.agents/skills/` → `~/.agents/skills.pii-hidden`)
3. Track which directories were hidden

### Path Remapping

If the profile passes `--skill <path>` arguments that reference a hidden directory, those paths are remapped to point at the `.pii-hidden` location. This lets profiles selectively opt-in to specific skills while hiding the rest:

```json
{
  "pii": {
    "flags": [
      "--no-skills",
      "--skill", "/home/tibi/.agents/skills/kuri-browse",
      "--skill", "/home/tibi/.agents/skills/local-dev-server-mgmt"
    ]
  }
}
```

### Restore Phase (when pi exits)

The restore has two paths:

1. **Fast path** — if the destination directory doesn't exist, `renameSync` the `.pii-hidden` directory back. This is the common case.
2. **Merge path** — if the destination directory was recreated during the session (e.g., by another process), contents from `.pii-hidden` are recursively copied into it, then `.pii-hidden` is removed. This prevents data loss if something created the directory while pi was running.

### Cleanup on Unexpected Exit

Signal handlers for `SIGINT`, `SIGTERM`, and `SIGHUP` ensure the restore runs even when:

- The user presses Ctrl+C
- The terminal closes (SIGHUP)
- A process manager sends SIGTERM

An `exited` guard flag prevents double-restore if multiple events fire (e.g., SIGINT followed by the child's exit event).

### Error Handling

- **Hide phase**: silently skips directories that don't exist
- **Restore phase**: logs errors to stderr with `[pii] error:` prefix instead of silently swallowing them
- **Individual file copy failures** during merge: logged as `[pii] warn:` but don't abort the restore

## Extension API

The in-pi extension (`extensions/index.ts`) registers a single `/pii` command. Its logic mirrors the standalone CLI but uses pi's extension API:

- `ctx.ui.select()` for the interactive menu (instead of `@inquirer/prompts`)
- `ctx.ui.notify()` for error messages
- Same child process spawning, skill hiding, and restore logic

The extension is declared in `package.json` under `pi.extensions` so pi auto-discovers it when installed as a package.

## Project Structure

```
pi-profile-pkg/
├── bin/
│   └── pii              # Standalone CLI (ESM, Node.js)
├── extensions/
│   └── index.ts         # In-pi extension entry point
├── package.json         # Package manifest + pi extension registration
├── README.md            # User-facing documentation
└── architecture.md      # This file
```

## Key Constraints

- **No shared mutable state between pii and pi** — communication is via CLI flags and environment variables only
- **Skill directories are renamed, not deleted** — atomic rename prevents data loss even on crash
- **Temp dir isolation** — each launch gets a fresh temp dir; no cross-session pollution
- **Idempotent restore** — safe to call multiple times; skips missing `.pii-hidden` dirs
