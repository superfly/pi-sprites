import { dirname } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { APIError, type Sprite } from "@fly/sprites";
import { sanitizeName } from "./config.js";
import { collectEvents } from "./output.js";
import { applyPolicies } from "./policy.js";
import { runtime } from "./runtime.js";
import { reconcileServices } from "./services.js";
import type { BootstrapResult } from "./types.js";

async function localRepository(pi: ExtensionAPI): Promise<string | undefined> {
  const result = await pi.exec("git", ["config", "--get", "remote.origin.url"], { cwd: runtime.localCwd });
  return result.code === 0 ? result.stdout.trim() || undefined : undefined;
}

async function existingSprite(name: string): Promise<Sprite | undefined> {
  try {
    return await runtime.getClient().getSprite(name);
  } catch (error) {
    if (error instanceof APIError && error.statusCode === 404) return undefined;
    throw error;
  }
}

async function hasGitCheckout(sprite: Sprite, remoteCwd: string): Promise<boolean> {
  try {
    const result = await sprite.execFile("test", ["-d", `${remoteCwd}/.git`]);
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

export async function bootstrapSprite(
  pi: ExtensionAPI,
  requestedName?: string,
  projectTrusted = runtime.projectTrusted,
  requestedRemoteCwd = runtime.remoteCwd,
): Promise<BootstrapResult> {
  const configuredName = requestedName || runtime.selectedName || runtime.config.sprite;
  const generatedName = `pi-${sanitizeName(runtime.localCwd.split("/").pop() || "project")}`;
  const name = sanitizeName(configuredName || generatedName);
  if (!name) throw new Error("Unable to determine a valid Sprite name.");
  const remoteCwd = requestedRemoteCwd;
  const config = runtime.config.bootstrap || {};
  if ((config.commands?.length || 0) > 0 && !projectTrusted) {
    throw new Error("Refusing to run bootstrap.commands because this project is not trusted.");
  }

  const report: string[] = [];
  let sprite = await existingSprite(name);
  if (!sprite) {
    sprite = await runtime.getClient().createSprite(name, { runtime: "dev", waitForCapacity: true });
    report.push(`created ${name}`);
  } else {
    report.push(`using ${name}`);
  }

  await sprite.execFile("mkdir", ["-p", remoteCwd]);

  const repository = config.repository || await localRepository(pi);
  if (repository && !(await hasGitCheckout(sprite, remoteCwd))) {
    await sprite.execFile("mkdir", ["-p", dirname(remoteCwd)]);
    const args = ["clone"];
    if (config.branch) args.push("--branch", config.branch);
    args.push(repository, remoteCwd);
    await sprite.execFile("git", args, { maxBuffer: 8 * 1024 * 1024 });
    report.push(`cloned ${repository}`);
  } else if (!repository) {
    report.push("created workspace directory (no git remote configured)");
  } else {
    report.push("git checkout already present");
  }

  if (config.branch && await hasGitCheckout(sprite, remoteCwd)) {
    await sprite.execFile("git", ["checkout", config.branch], { cwd: remoteCwd });
    report.push(`checked out ${config.branch}`);
  }

  for (const command of config.commands || []) {
    const result = await sprite.exec(command, { cwd: remoteCwd, maxBuffer: 16 * 1024 * 1024 });
    report.push(`setup: ${command} (${result.exitCode})`);
  }

  const policies = await applyPolicies(sprite, runtime.config.policy);
  if (policies.length) report.push(`applied policies: ${policies.join(", ")}`);

  const serviceEvents = await reconcileServices(sprite, config.services || []);
  if (serviceEvents.length) report.push(...serviceEvents.map((line) => `service: ${line}`));

  if (config.checkpoint !== false) {
    const before = new Set((await sprite.listCheckpoints()).map((item) => item.id));
    await collectEvents(await sprite.createCheckpoint(`pi-sprites bootstrap: ${remoteCwd}`));
    const checkpoint = (await sprite.listCheckpoints())
      .filter((item) => !before.has(item.id))
      .sort((a, b) => b.createTime.getTime() - a.createTime.getTime())[0];
    if (checkpoint) {
      report.push(`checkpoint ${checkpoint.id}`);
    }
  }

  return { sprite, remoteCwd, report };
}
