# @tiberiuichim/pi-profile

Profile manager for the [pi coding agent](https://pi.dev). Switch between curated sets of packages, skills, and extensions with one command.

## Installation

```bash
# As a pi extension (auto-discovered, registers /pii command inside pi)
pi install npm:@tiberiuichim/pi-profile

# As a CLI tool (global, installs the `pii` binary)
npm install -g @tiberiuichim/pi-profile
```

## Usage

### CLI

```bash
pii                       # interactive menu to select a profile
pii minimal               # launch pi with the "minimal" profile
pii rpiv --continue       # pass extra args to pi
pii --help                # list available profiles
```

### Inside pi

When installed as a pi extension, a `/pii` command is registered:

```
/pii                      # interactive menu
```

## Profile Setup

Create profile settings files under `~/.pi/profiles/<name>/settings.json`:

```
~/.pi/profiles/
├── minimal/
│   └── settings.json
├── dev/
│   └── settings.json
├── rpiv/
│   └── settings.json
└── full/
    └── settings.json
```

Each `settings.json` is a standard pi settings file. The `pii.description` field is shown in the menu:

```json
{
  "pii": {
    "description": "Observability only — no skills, no extra extensions"
  },
  "defaultProvider": "anthropic",
  "defaultModel": "claude-sonnet-4-20250514",
  "packages": [
    "git:github.com/imran-vz/pi-observability"
  ]
}
```

## How It Works

On each launch, `pii` creates a temporary runtime directory with:
- The profile's `settings.json`
- Symlinks to shared state (git packages, auth, models, sessions)
- `PI_CODING_AGENT_DIR` pointing to the temp dir

The temp dir is cleaned up when pi exits. Sessions are shared across profiles.

## Sharing with Your Team

Share your `~/.pi/profiles/` directory via git or copy it to colleagues' machines. Each user keeps their own auth and session data — only the profile definitions need to be shared.

```bash
git clone team-repo ~/.pi/profiles
```
