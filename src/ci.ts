import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { ExecError } from "@fly/sprites";
import { sanitizeName } from "./config.js";
import { bootstrapSprite } from "./bootstrap.js";
import { collectEvents } from "./output.js";
import { runtime } from "./runtime.js";

async function currentBranch(pi: ExtensionAPI): Promise<string> {
  const result = await pi.exec("git", ["branch", "--show-current"], { cwd: runtime.localCwd });
  return result.code === 0 ? result.stdout.trim() || "detached" : "workspace";
}

export interface CiRunResult {
  sprite: string;
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  cleanedUp: boolean;
  report: string[];
}

export async function runCi(
  pi: ExtensionAPI,
  commandOverride?: string,
  nameOverride?: string,
  projectTrusted = runtime.projectTrusted,
): Promise<CiRunResult> {
  const targetCwd = runtime.remoteCwd;
  const branch = await currentBranch(pi);
  const prefix = runtime.config.ci?.namePrefix || "pi-ci";
  const project = sanitizeName(runtime.localCwd.split("/").pop() || "project");
  const name = sanitizeName(nameOverride || `${prefix}-${project}-${branch}`);
  const command = commandOverride || runtime.config.ci?.command || "npm test";
  const target = await bootstrapSprite(pi, name, projectTrusted, targetCwd);
  const { sprite, remoteCwd, report } = target;

  const result = await sprite.exec(command, { cwd: remoteCwd, maxBuffer: 32 * 1024 * 1024 }).catch((error: unknown) => {
    if (error instanceof ExecError) return error.result;
    throw error;
  });
  if (result.exitCode !== 0) {
    await collectEvents(await sprite.createCheckpoint(`CI failed: ${command}`));
    report.push("captured failure checkpoint");
  }

  const cleanup = runtime.config.ci?.cleanup || "never";
  const shouldCleanup = cleanup === "always" || (cleanup === "on-success" && result.exitCode === 0);
  if (shouldCleanup) {
    await runtime.getClient().deleteSprite(name);
    report.push(`destroyed ${name} (${cleanup})`);
  }

  return {
    sprite: name,
    command,
    exitCode: result.exitCode,
    stdout: String(result.stdout),
    stderr: String(result.stderr),
    cleanedUp: shouldCleanup,
    report,
  };
}
