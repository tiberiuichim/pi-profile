/**
 * pi-profile — Launch a new pi instance with a selected profile.
 *
 * Registers a `/pii` command inside pi that shows an interactive menu
 * and exec's into a fresh pi process with the chosen profile's settings.
 *
 * Profile definitions are read from ~/.pi/profiles/<name>/settings.json.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { spawn, execSync } from "node:child_process";
import { mkdirSync, symlinkSync, rmSync, copyFileSync, readFileSync, readdirSync, accessSync, renameSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

// ── Helpers ────────────────────────────────────────────────────────────────

const homedir = process.env.HOME || "";
const profilesDir = join(homedir, ".pi", "profiles");

function loadProfiles() {
  try {
    const entries = readdirSync(profilesDir, { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
    return dirs.map((id) => {
      let description = id;
      let flags: string[] = [];
      try {
        const s = JSON.parse(readFileSync(join(profilesDir, id, "settings.json"), "utf-8"));
        description = s.pii?.description ?? id;
        flags = s.pii?.flags ?? [];
      } catch {
        // fallback
      }
      return { id, description, flags };
    });
  } catch {
    return [];
  }
}

function findPiBin(): string | null {
  const candidates = [
    process.env.PI_BIN,
    join(homedir, ".local", "share", "nvm", "v24.14.1", "bin", "pi"),
  ];

  for (const c of candidates) {
    if (c) {
      try {
        accessSync(c);
        return c;
      } catch {
        // try next
      }
    }
  }

  try {
    return execSync("which pi", { encoding: "utf-8" }).trim();
  } catch {
    return null;
  }
}

function prepareRuntimeDir(profileId: string): string {
  const agentDir = process.env.PI_CODING_AGENT_DIR || join(homedir, ".pi", "agent");
  const runtimeDir = join(tmpdir(), `pii-${profileId}-${randomUUID()}`);
  mkdirSync(runtimeDir, { recursive: true });

  const profileSettingsPath = join(profilesDir, profileId, "settings.json");
  copyFileSync(profileSettingsPath, join(runtimeDir, "settings.json"));

  const sharedItems = ["git", "auth.json", "models.json", "sessions", "observability"];
  for (const item of sharedItems) {
    const src = join(agentDir, item);
    const dst = join(runtimeDir, item);
    try {
      symlinkSync(src, dst);
    } catch {
      // skip
    }
  }

  return runtimeDir;
}

const skillDirs = [
  join(homedir, ".agents", "skills"),
  join(homedir, ".config", "agents", "skills"),
];

function hideSkillDirs(): string[] {
  const hidden: string[] = [];
  for (const dir of skillDirs) {
    try {
      accessSync(dir);
      renameSync(dir, dir + ".pii-hidden");
      hidden.push(dir);
    } catch {
      // doesn't exist
    }
  }
  return hidden;
}

function restoreSkillDirs(hidden: string[]) {
  for (const dir of hidden) {
    try {
      renameSync(dir + ".pii-hidden", dir);
    } catch {
      // already restored
    }
  }
}

function remapSkillPaths(args: string[], hiddenDirs: string[]) {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--skill" && i + 1 < args.length) {
      for (const orig of hiddenDirs) {
        const hidden = orig + ".pii-hidden";
        if (args[i + 1] === orig || args[i + 1].startsWith(orig + "/")) {
          args[i + 1] = hidden + args[i + 1].slice(orig.length);
          break;
        }
      }
    }
  }
}

// ── Extension ──────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  pi.registerCommand("pii", {
    description: "Launch pi with a selected profile",
    handler: async (_args, ctx) => {
      const profiles = loadProfiles();

      if (profiles.length === 0) {
        ctx.ui.notify("No profiles found in ~/.pi/profiles/", "error");
        return;
      }

      const items = profiles.map((p) => `${p.id.padEnd(16)} ${p.description}`);
      const selected = await ctx.ui.select("Select profile", items);

      if (!selected) {
        return;
      }

      const profile = profiles.find((p) => selected.startsWith(p.id));
      if (!profile) {
        ctx.ui.notify("No profile selected", "error");
        return;
      }

      const runtimeDir = prepareRuntimeDir(profile.id);
      const piBin = findPiBin();
      if (!piBin) {
        ctx.ui.notify("Could not find pi binary", "error");
        return;
      }

      const env = { ...process.env, PI_CODING_AGENT_DIR: runtimeDir };
      const allArgs = [...profile.flags];

      const hideUserSkills = allArgs.includes("--hide-user-skills");
      if (hideUserSkills) {
        const idx = allArgs.indexOf("--hide-user-skills");
        allArgs.splice(idx, 1);
      }
      let hiddenDirs: string[] = [];
      if (allArgs.includes("--no-skills") || hideUserSkills) {
        hiddenDirs = hideSkillDirs();
        remapSkillPaths(allArgs, hiddenDirs);
      }

      const child = spawn(piBin, allArgs, {
        env,
        stdio: "inherit",
        cwd: process.cwd(),
      });

      const onExit = () => {
        if (hiddenDirs.length > 0) restoreSkillDirs(hiddenDirs);
      };

      child.on("exit", (code, signal) => {
        onExit();
        if (signal) process.exit(code ?? 128 + signal.charCodeAt(0) - 64);
        process.exit(code ?? 0);
      });

      child.on("error", (err) => {
        onExit();
        ctx.ui.notify(`Failed to launch pi: ${err.message}`, "error");
      });
    },
  });
}
