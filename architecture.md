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

Pi's `--no-skills` flag is sufficient on its own to suppress skill discovery. The flag prevents auto-discovered skill paths (from `~/.agents/skills` and `.agents/skills` in ancestor directories) from being loaded, regardless of `PI_CODING_AGENT_DIR`. Profiles can still opt into specific skills via `--skill <path>`:

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

No rename-hide/restore cycle is needed — pi's built-in `--no-skills` handles everything.

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
