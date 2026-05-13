# @tiberiuichim/pi-profile

Profile manager for the [pi coding agent](https://pi.dev). Switch between curated sets of packages, skills, and extensions with one command.

## Installation

### From npm _(not yet published)_

Once published, use:

```bash
# As a pi extension (auto-discovered, registers /pii command inside pi)
pi install npm:@tiberiuichim/pi-profile

# As a CLI tool (global, installs the `pii` binary)
npm install -g @tiberiuichim/pi-profile
```

### From git _(works now)_

Install directly from this repo:

```bash
# As a pi extension
pi install git:github.com/tiberiuichim/pi-profile
```

### Manual setup

```bash
# Clone the repo
git clone https://github.com/tiberiuichim/pi-profile.git

# Install dependencies
cd pi-profile && npm install

# Run the CLI binary directly
node bin/pii                  # interactive menu
node bin/pii minimal          # launch with a specific profile
node bin/pii --help           # list profiles

# Or use it as a pi extension from the command line
pi -e ./extensions/index.ts

# Or symlink for convenience
ln -s $(pwd)/bin/pii ~/.local/bin/pii
# Now `pii` works from anywhere (add ~/.local/bin to $PATH if needed)
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

The temp dir is left for the OS to clean up. Sessions are shared across profiles.

Profiles can use `--no-skills` to disable all skill discovery, and selectively re-enable specific ones with `--skill <path>`. Pi's built-in `--no-skills` flag handles this without any filesystem manipulation.

## Sharing with Your Team

Share your `~/.pi/profiles/` directory via git or copy it to colleagues' machines. Each user keeps their own auth and session data — only the profile definitions need to be shared.

```bash
git clone team-repo ~/.pi/profiles
```
