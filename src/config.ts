import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import type { PiSpritesConfig, RuntimeOverrides } from "./types.js";

export const DEFAULT_CONFIG: Required<Pick<PiSpritesConfig, "mode" | "tokenEnv">> & PiSpritesConfig = {
  mode: "auto",
  tokenEnv: "SPRITES_TOKEN",
  toolActivation: "auto",
  checkpoint: { mode: "risky" },
  ci: { command: "npm test", namePrefix: "pi-ci", cleanup: "never" },
  workers: { count: 2, namePrefix: "pi-worker", cleanup: "never" },
  rpcHost: { port: 43120, localPort: 43120, piCommand: "pi", secretEnv: "PI_SPRITES_RPC_SECRET" },
};

function configError(path: string, field: string, expected: string): never {
  throw new Error(`Invalid ${field || "configuration"} in ${path}: expected ${expected}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validateConfig(value: unknown, path: string): PiSpritesConfig {
  if (!isRecord(value)) configError(path, "configuration", "an object");
  const root = value;
  const stringField = (object: Record<string, unknown>, key: string, field = key): void => {
    if (object[key] !== undefined && typeof object[key] !== "string") configError(path, field, "a string");
  };
  const booleanField = (object: Record<string, unknown>, key: string, field = key): void => {
    if (object[key] !== undefined && typeof object[key] !== "boolean") configError(path, field, "a boolean");
  };
  const positiveInteger = (object: Record<string, unknown>, key: string, field = key, max?: number): void => {
    const item = object[key];
    if (item !== undefined && (!Number.isInteger(item) || Number(item) <= 0 || (max !== undefined && Number(item) > max))) {
      configError(path, field, `a positive integer${max ? ` no greater than ${max}` : ""}`);
    }
  };
  const nonNegativeInteger = (object: Record<string, unknown>, key: string, field = key, max?: number): void => {
    const item = object[key];
    if (item !== undefined && (!Number.isInteger(item) || Number(item) < 0 || (max !== undefined && Number(item) > max))) {
      configError(path, field, `a non-negative integer${max ? ` no greater than ${max}` : ""}`);
    }
  };
  const enumField = (object: Record<string, unknown>, key: string, values: string[], field = key): void => {
    const item = object[key];
    if (item !== undefined && (typeof item !== "string" || !values.includes(item))) configError(path, field, values.join(" | "));
  };
  const objectField = (key: string): Record<string, unknown> | undefined => {
    const item = root[key];
    if (item === undefined) return undefined;
    if (!isRecord(item)) configError(path, key, "an object");
    return item;
  };
  const stringArray = (object: Record<string, unknown>, key: string, field: string): void => {
    const item = object[key];
    if (item !== undefined && (!Array.isArray(item) || item.some((entry) => typeof entry !== "string"))) {
      configError(path, field, "an array of strings");
    }
  };
  const knownKeys = (object: Record<string, unknown>, allowed: string[], field: string): void => {
    const unknown = Object.keys(object).find((key) => !allowed.includes(key));
    if (unknown) configError(path, field ? `${field}.${unknown}` : unknown, "a supported configuration field");
  };

  knownKeys(root, ["mode", "sprite", "remoteCwd", "baseURL", "tokenEnv", "toolActivation", "checkpoint", "bootstrap", "policy", "ci", "workers", "rpcHost"], "");
  enumField(root, "mode", ["auto", "local", "remote"]);
  enumField(root, "toolActivation", ["auto", "always", "off"]);
  for (const key of ["sprite", "remoteCwd", "baseURL", "tokenEnv"]) stringField(root, key);

  const checkpoint = objectField("checkpoint");
  if (checkpoint) {
    knownKeys(checkpoint, ["mode"], "checkpoint");
    enumField(checkpoint, "mode", ["off", "risky", "turn"], "checkpoint.mode");
  }

  const bootstrap = objectField("bootstrap");
  if (bootstrap) {
    knownKeys(bootstrap, ["repository", "branch", "commands", "services", "checkpoint"], "bootstrap");
    stringField(bootstrap, "repository", "bootstrap.repository");
    stringField(bootstrap, "branch", "bootstrap.branch");
    booleanField(bootstrap, "checkpoint", "bootstrap.checkpoint");
    stringArray(bootstrap, "commands", "bootstrap.commands");
    if (bootstrap.services !== undefined) {
      if (!Array.isArray(bootstrap.services)) configError(path, "bootstrap.services", "an array");
      for (const [index, service] of bootstrap.services.entries()) {
        if (!isRecord(service)) configError(path, `bootstrap.services[${index}]`, "an object");
        knownKeys(service, ["name", "cmd", "args", "env", "dir", "needs", "httpPort", "duration"], `bootstrap.services[${index}]`);
        stringField(service, "name", `bootstrap.services[${index}].name`);
        stringField(service, "cmd", `bootstrap.services[${index}].cmd`);
        if (!service.name || !service.cmd) configError(path, `bootstrap.services[${index}]`, "non-empty name and cmd strings");
        for (const key of ["dir", "duration"]) stringField(service, key, `bootstrap.services[${index}].${key}`);
        for (const key of ["args", "needs"]) stringArray(service, key, `bootstrap.services[${index}].${key}`);
        positiveInteger(service, "httpPort", `bootstrap.services[${index}].httpPort`, 65535);
        if (service.env !== undefined && (!isRecord(service.env) || Object.values(service.env).some((entry) => typeof entry !== "string"))) {
          configError(path, `bootstrap.services[${index}].env`, "an object of string values");
        }
      }
    }
  }

  const policy = objectField("policy");
  if (policy) {
    knownKeys(policy, ["network", "privileges", "resources"], "policy");
    const network = policy.network;
    if (network !== undefined) {
      if (!isRecord(network)) configError(path, "policy.network", "an object");
      knownKeys(network, ["rules"], "policy.network");
      if (!Array.isArray(network.rules)) configError(path, "policy.network.rules", "an array");
      for (const [index, rule] of network.rules.entries()) {
        if (!isRecord(rule)) configError(path, `policy.network.rules[${index}]`, "an object");
        knownKeys(rule, ["domain", "action", "include"], `policy.network.rules[${index}]`);
        stringField(rule, "domain", `policy.network.rules[${index}].domain`);
        stringField(rule, "include", `policy.network.rules[${index}].include`);
        enumField(rule, "action", ["allow", "deny"], `policy.network.rules[${index}].action`);
      }
    }
    const privileges = policy.privileges;
    if (privileges !== undefined) {
      if (!isRecord(privileges)) configError(path, "policy.privileges", "an object");
      knownKeys(privileges, ["profile", "devices", "noNewPrivileges"], "policy.privileges");
      enumField(privileges, "profile", ["", "minimal", "standard", "privileged"], "policy.privileges.profile");
      stringArray(privileges, "devices", "policy.privileges.devices");
      booleanField(privileges, "noNewPrivileges", "policy.privileges.noNewPrivileges");
    }
    const resources = policy.resources;
    if (resources !== undefined) {
      if (!isRecord(resources)) configError(path, "policy.resources", "an object");
      knownKeys(resources, ["memory"], "policy.resources");
      if (resources.memory !== undefined) {
        if (!isRecord(resources.memory)) configError(path, "policy.resources.memory", "an object");
        knownKeys(resources.memory, ["limitMB", "autoscale"], "policy.resources.memory");
        positiveInteger(resources.memory, "limitMB", "policy.resources.memory.limitMB");
        if (resources.memory.limitMB === undefined) configError(path, "policy.resources.memory.limitMB", "a positive integer");
        booleanField(resources.memory, "autoscale", "policy.resources.memory.autoscale");
      }
    }
  }

  const ci = objectField("ci");
  if (ci) {
    knownKeys(ci, ["command", "namePrefix", "cleanup"], "ci");
    stringField(ci, "command", "ci.command");
    stringField(ci, "namePrefix", "ci.namePrefix");
    enumField(ci, "cleanup", ["never", "on-success", "always"], "ci.cleanup");
  }
  const workers = objectField("workers");
  if (workers) {
    knownKeys(workers, ["count", "namePrefix", "agentCommand", "cleanup"], "workers");
    positiveInteger(workers, "count", "workers.count", 16);
    stringField(workers, "namePrefix", "workers.namePrefix");
    stringField(workers, "agentCommand", "workers.agentCommand");
    enumField(workers, "cleanup", ["never", "on-success", "always"], "workers.cleanup");
  }
  const rpcHost = objectField("rpcHost");
  if (rpcHost) {
    knownKeys(rpcHost, ["port", "httpPort", "localPort", "piCommand", "secretEnv"], "rpcHost");
    for (const key of ["port", "httpPort"]) positiveInteger(rpcHost, key, `rpcHost.${key}`, 65535);
    nonNegativeInteger(rpcHost, "localPort", "rpcHost.localPort", 65535);
    stringField(rpcHost, "piCommand", "rpcHost.piCommand");
    stringField(rpcHost, "secretEnv", "rpcHost.secretEnv");
  }
  return root as PiSpritesConfig;
}

function readConfig(path: string): PiSpritesConfig {
  if (!existsSync(path)) return {};
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch (error) {
    throw new Error(`Invalid JSON in ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
  return validateConfig(raw, path);
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

export function loadConfig(cwd: string, overrides: RuntimeOverrides = {}, projectTrusted = false): PiSpritesConfig {
  const globalConfig = readConfig(join(homedir(), ".pi", "agent", "sprites.json"));
  const projectConfig = projectTrusted ? readConfig(join(cwd, ".pi", "sprites.json")) : {};
  const localConfig = projectTrusted ? readConfig(join(cwd, ".pi", "sprites.local.json")) : {};
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
