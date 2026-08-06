import { dirname } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { APIError, type Sprite } from "@fly/sprites";
import { listUnfilteredCheckpoints } from "./checkpoints.js";
import { sanitizeName } from "./config.js";
import { collectEvents } from "./output.js";
import { applyPolicies } from "./policy.js";
import { runtime } from "./runtime.js";
import { reconcileServices } from "./services.js";

async function localRepository(pi: ExtensionAPI): Promise<string | undefined> {
  const result = await pi.exec("git", ["config", "--get", "remote.origin.url"], { cwd: runtime.localCwd });
  return result.code === 0 ? result.stdout.trim() || undefined : undefined;
}

async function spriteExists(name: string): Promise<boolean> {
  try {
    await runtime.getClient().getSprite(name);
    return true;
  } catch (error) {
    if (error instanceof APIError && error.statusCode === 404) return false;
    throw error;
  }
}

async function hasGitCheckout(sprite: Sprite): Promise<boolean> {
  try {
    const result = await sprite.execFile("test", ["-d", `${runtime.remoteCwd}/.git`]);
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

export async function bootstrapSprite(pi: ExtensionAPI, requestedName?: string): Promise<string[]> {
  const configuredName = requestedName || runtime.selectedName || runtime.config.sprite;
  const generatedName = `pi-${sanitizeName(runtime.localCwd.split("/").pop() || "project")}`;
  const name = sanitizeName(configuredName || generatedName);
  if (!name) throw new Error("Unable to determine a valid Sprite name.");

  const report: string[] = [];
  if (!(await spriteExists(name))) {
    await runtime.create(name);
    report.push(`created ${name}`);
  } else {
    runtime.select(name);
    report.push(`using ${name}`);
  }

  const sprite = runtime.sprite();
  await sprite.execFile("mkdir", ["-p", runtime.remoteCwd]);

  const config = runtime.config.bootstrap || {};
  const repository = config.repository || await localRepository(pi);
  if (repository && !(await hasGitCheckout(sprite))) {
    await sprite.execFile("mkdir", ["-p", dirname(runtime.remoteCwd)]);
    const args = ["clone"];
    if (config.branch) args.push("--branch", config.branch);
    args.push(repository, runtime.remoteCwd);
    await sprite.execFile("git", args, { maxBuffer: 8 * 1024 * 1024 });
    report.push(`cloned ${repository}`);
  } else if (!repository) {
    report.push("created workspace directory (no git remote configured)");
  } else {
    report.push("git checkout already present");
  }

  if (config.branch && await hasGitCheckout(sprite)) {
    await sprite.execFile("git", ["checkout", config.branch], { cwd: runtime.remoteCwd });
    report.push(`checked out ${config.branch}`);
  }

  for (const command of config.commands || []) {
    const result = await sprite.exec(command, { cwd: runtime.remoteCwd, maxBuffer: 16 * 1024 * 1024 });
    report.push(`setup: ${command} (${result.exitCode})`);
  }

  const policies = await applyPolicies(sprite, runtime.config.policy);
  if (policies.length) report.push(`applied policies: ${policies.join(", ")}`);

  const serviceEvents = await reconcileServices(sprite, config.services || []);
  if (serviceEvents.length) report.push(...serviceEvents.map((line) => `service: ${line}`));

  if (config.checkpoint !== false) {
    const before = new Set((await listUnfilteredCheckpoints(sprite)).map((item) => item.id));
    await collectEvents(await sprite.createCheckpoint(`pi-sprites bootstrap: ${runtime.remoteCwd}`));
    const checkpoint = (await listUnfilteredCheckpoints(sprite))
      .filter((item) => !before.has(item.id))
      .sort((a, b) => b.createTime.getTime() - a.createTime.getTime())[0];
    if (checkpoint) {
      runtime.lastCheckpoint = checkpoint.id;
      report.push(`checkpoint ${checkpoint.id}`);
    }
  }

  return report;
}
