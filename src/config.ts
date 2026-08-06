import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import type { PiSpritesConfig, RuntimeOverrides } from "./types.js";

export const DEFAULT_CONFIG: Required<Pick<PiSpritesConfig, "mode" | "tokenEnv">> & PiSpritesConfig = {
  mode: "auto",
  tokenEnv: "SPRITES_TOKEN",
  checkpoint: { mode: "risky", retention: 10 },
  ci: { command: "npm test", namePrefix: "pi-ci", cleanup: "never" },
  workers: { count: 2, namePrefix: "pi-worker", cleanup: "never" },
  rpcHost: { port: 43120, localPort: 43120, piCommand: "pi", secretEnv: "PI_SPRITES_RPC_SECRET" },
};

function readConfig(path: string): PiSpritesConfig {
  if (!existsSync(path)) return {};
  const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`Expected an object in ${path}`);
  }
  return raw as PiSpritesConfig;
}

function mergeObjects<T extends object>(base: T, override: Partial<T>): T {
  const result = { ...base } as Record<string, unknown>;
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) continue;
    const current = result[key];
    if (
      current &&
      value &&
      typeof current === "object" &&
      typeof value === "object" &&
      !Array.isArray(current) &&
      !Array.isArray(value)
    ) {
      result[key] = mergeObjects(current as object, value as object);
    } else {
      result[key] = value;
    }
  }
  return result as T;
}

export function loadConfig(cwd: string, overrides: RuntimeOverrides = {}): PiSpritesConfig {
  const globalConfig = readConfig(join(homedir(), ".pi", "agent", "sprites.json"));
  const projectConfig = readConfig(join(cwd, ".pi", "sprites.json"));
  const localConfig = readConfig(join(cwd, ".pi", "sprites.local.json"));
  return mergeObjects(mergeObjects(mergeObjects(mergeObjects(DEFAULT_CONFIG, globalConfig), projectConfig), localConfig), overrides);
}

export function defaultRemoteCwd(cwd: string): string {
  return `/workspace/${sanitizeName(basename(cwd)) || "project"}`;
}

export function sanitizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

export function parsePositiveInteger(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : fallback;
}
