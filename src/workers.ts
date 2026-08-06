import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { ExecError, type Sprite } from "@fly/sprites";
import { bootstrapSprite } from "./bootstrap.js";
import { parsePositiveInteger, sanitizeName } from "./config.js";
import { runtime } from "./runtime.js";
import type { WorkerResult } from "./types.js";

async function runShell(sprite: Sprite, remoteCwd: string, task: string): Promise<WorkerResult> {
  try {
    const result = await sprite.exec(task, { cwd: remoteCwd, maxBuffer: 32 * 1024 * 1024 });
    return { sprite: sprite.name, task, exitCode: result.exitCode, stdout: String(result.stdout), stderr: String(result.stderr) };
  } catch (error) {
    if (error instanceof ExecError) {
      return { sprite: sprite.name, task, exitCode: error.exitCode, stdout: String(error.stdout), stderr: String(error.stderr) };
    }
    throw error;
  }
}

async function runAgent(sprite: Sprite, remoteCwd: string, task: string, command: string): Promise<WorkerResult> {
  const child = sprite.spawn("/bin/bash", ["-lc", command], {
    cwd: remoteCwd,
    maxRunAfterDisconnect: "10m",
  });
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
  child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
  child.stdin.end(task);
  const exitCode = await child.wait();
  return {
    sprite: sprite.name,
    task,
    exitCode,
    stdout: Buffer.concat(stdout).toString("utf8"),
    stderr: Buffer.concat(stderr).toString("utf8"),
  };
}

export async function runWorkers(
  pi: ExtensionAPI,
  tasks: string[],
  mode: "shell" | "agent",
  requestedCount?: number,
  projectTrusted = runtime.projectTrusted,
): Promise<WorkerResult[]> {
  if (!tasks.length) throw new Error("At least one worker task is required.");
  const agentCommand = runtime.config.workers?.agentCommand;
  if (mode === "agent" && !agentCommand) {
    throw new Error("workers.agentCommand must be configured in .pi/sprites.json for agent mode.");
  }
  const count = Math.min(tasks.length, Math.min(16, parsePositiveInteger(requestedCount ?? runtime.config.workers?.count, 2)));
  const remoteCwd = runtime.remoteCwd;
  const prefix = runtime.config.workers?.namePrefix || "pi-worker";
  const project = sanitizeName(runtime.localCwd.split("/").pop() || "project");
  const targets: Array<{ sprite: Sprite; remoteCwd: string }> = [];

  for (let index = 0; index < count; index++) {
    const name = sanitizeName(`${prefix}-${project}-${index + 1}`);
    const target = await bootstrapSprite(pi, name, projectTrusted, remoteCwd);
    targets.push({ sprite: target.sprite, remoteCwd: target.remoteCwd });
  }

  const results = await Promise.all(tasks.map((task, index) => {
    const target = targets[index % targets.length];
    if (!target) throw new Error("No worker Sprite was provisioned.");
    return mode === "agent"
      ? runAgent(target.sprite, target.remoteCwd, task, agentCommand as string)
      : runShell(target.sprite, target.remoteCwd, task);
  }));

  const cleanup = runtime.config.workers?.cleanup || "never";
  const allSucceeded = results.every((result) => result.exitCode === 0);
  if (cleanup === "always" || (cleanup === "on-success" && allSucceeded)) {
    await Promise.all(targets.map(({ sprite }) => runtime.getClient().deleteSprite(sprite.name)));
  }

  return results;
}
