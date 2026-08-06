import type { ExtensionAPI, ExtensionContext, ToolCallEvent } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { shellQuote, splitArgs } from "../src/args.js";
import { listUnfilteredCheckpoints } from "../src/checkpoints.js";
import { parsePositiveInteger } from "../src/config.js";
import { collectEvents, errorMessage, textResult } from "../src/output.js";
import { runtime } from "../src/runtime.js";

function checkpointTargetAvailable(): boolean {
  return Boolean(runtime.selectedName) || runtime.insideSprite;
}

async function createCheckpoint(pi: ExtensionAPI, comment: string): Promise<string> {
  if (runtime.selectedName) {
    const sprite = runtime.sprite();
    const before = new Set((await listUnfilteredCheckpoints(sprite)).map((item) => item.id));
    await collectEvents(await sprite.createCheckpoint(comment));
    const created = (await listUnfilteredCheckpoints(sprite))
      .filter((item) => !before.has(item.id))
      .sort((a, b) => b.createTime.getTime() - a.createTime.getTime())[0];
    if (!created) throw new Error("Checkpoint completed but its id was not returned by the API.");
    runtime.lastCheckpoint = created.id;
    return created.id;
  }
  if (runtime.insideSprite) {
    const result = await pi.exec("sprite-env", ["checkpoints", "create", "--comment", comment]);
    if (result.code !== 0) throw new Error(result.stderr || result.stdout || "Checkpoint creation failed");
    const id = result.stdout.match(/\b(?:v\d+|auto-[A-Za-z0-9_-]+)\b/)?.[0] || "created";
    runtime.lastCheckpoint = id;
    return id;
  }
  throw new Error("Select a Sprite first with /sprite-use <name>.");
}

async function listCheckpoints(pi: ExtensionAPI): Promise<string> {
  if (runtime.selectedName) {
    const checkpoints = await listUnfilteredCheckpoints(runtime.sprite());
    return checkpoints.length
      ? checkpoints
        .sort((a, b) => b.createTime.getTime() - a.createTime.getTime())
        .map((item) => `${item.id} · ${item.createTime.toISOString()}${item.isAuto ? " · automatic" : ""}${item.comment ? ` · ${item.comment}` : ""}`)
        .join("\n")
      : "No checkpoints found.";
  }
  if (runtime.insideSprite) {
    const result = await pi.exec("sprite-env", ["checkpoints", "list"]);
    if (result.code !== 0) throw new Error(result.stderr || "Unable to list checkpoints");
    return result.stdout.trim() || "No checkpoints found.";
  }
  throw new Error("Select a Sprite first with /sprite-use <name>.");
}

async function restoreCheckpoint(pi: ExtensionAPI, id: string): Promise<void> {
  if (!id) throw new Error("A checkpoint id is required.");
  if (runtime.selectedName) {
    await collectEvents(await runtime.sprite().restoreCheckpoint(id));
    return;
  }
  if (runtime.insideSprite) {
    const result = await pi.exec("sprite-env", ["checkpoints", "restore", id]);
    if (result.code !== 0) throw new Error(result.stderr || result.stdout || "Restore failed");
    return;
  }
  throw new Error("Select a Sprite first with /sprite-use <name>.");
}

async function pruneCheckpoints(): Promise<void> {
  if (!runtime.selectedName) return;
  const retention = parsePositiveInteger(runtime.config.checkpoint?.retention, 10);
  const sprite = runtime.sprite();
  const checkpoints = (await listUnfilteredCheckpoints(sprite))
    .filter((item) => !item.isAuto)
    .sort((a, b) => b.createTime.getTime() - a.createTime.getTime());
  const stale = checkpoints.slice(retention);
  for (const checkpoint of stale) {
    const client = sprite.client;
    const response = await fetch(`${client.baseURL}/v1/sprites/${encodeURIComponent(sprite.name)}/checkpoints/${encodeURIComponent(checkpoint.id)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${client.token}` },
    });
    if (!response.ok && response.status !== 409) {
      throw new Error(`Failed to prune checkpoint ${checkpoint.id}: ${response.status} ${await response.text()}`);
    }
  }
}

function mutatesState(event: ToolCallEvent): boolean {
  if (event.toolName === "write" || event.toolName === "edit") return true;
  if (event.toolName !== "bash") {
    return ["sprite_service", "sprite_policy", "sprite_bootstrap", "sprite_ci", "sprite_workers", "sprite_rpc_host"].includes(event.toolName);
  }
  const command = "command" in event.input ? String(event.input.command) : "";
  return /(?:\brm\b|\bmv\b|\bcp\b|\bsed\s+-i\b|\binstall\b|\bupdate\b|\bupgrade\b|\bmigrate\b|\bdeploy\b|\bgit\s+(?:reset|clean|checkout|rebase)\b|\b(?:npm|pnpm|yarn|pip|apt|apk|brew)\s+(?:install|update|upgrade)\b)/i.test(command);
}

export default function checkpointExtension(pi: ExtensionAPI): void {
  let checkpointedThisTurn = false;
  let pending: Promise<string> | undefined;
  let turnIndex = 0;

  pi.registerCommand("sprite-checkpoint", {
    description: "Create a named filesystem checkpoint",
    handler: async (input, ctx) => {
      try {
        runtime.ensureConfigured(ctx.cwd);
        const comment = input.trim() || `Pi session checkpoint ${new Date().toISOString()}`;
        const id = await createCheckpoint(pi, comment);
        await pruneCheckpoints();
        ctx.ui.notify(`Created checkpoint ${id}: ${comment}`, "info");
      } catch (error) { ctx.ui.notify(errorMessage(error), "error"); }
    },
  });

  pi.registerCommand("sprite-checkpoints", {
    description: "List filesystem checkpoints",
    handler: async (_input, ctx) => {
      try { runtime.ensureConfigured(ctx.cwd); ctx.ui.notify(await listCheckpoints(pi), "info"); }
      catch (error) { ctx.ui.notify(errorMessage(error), "error"); }
    },
  });

  pi.registerCommand("sprite-restore", {
    description: "Restore a checkpoint after confirmation",
    handler: async (input, ctx) => {
      try {
        runtime.ensureConfigured(ctx.cwd);
        const id = splitArgs(input)[0] || "";
        if (!id) throw new Error("Usage: /sprite-restore <checkpoint-id>");
        const confirmed = await ctx.ui.confirm("Restore checkpoint?", `This replaces the current filesystem with ${id} and restarts the environment.`);
        if (!confirmed) return;
        await restoreCheckpoint(pi, id);
        ctx.ui.notify(`Restore of ${id} started. Active processes and sessions may be terminated.`, "warning");
      } catch (error) { ctx.ui.notify(errorMessage(error), "error"); }
    },
  });

  pi.registerCommand("sprite-undo", {
    description: "Restore the last checkpoint created by Pi",
    handler: async (_input, ctx) => {
      try {
        runtime.ensureConfigured(ctx.cwd);
        if (!runtime.lastCheckpoint) throw new Error("Pi has not created a checkpoint in this session.");
        const confirmed = await ctx.ui.confirm("Undo to last checkpoint?", `Restore ${runtime.lastCheckpoint}? Current filesystem changes will be replaced.`);
        if (!confirmed) return;
        await restoreCheckpoint(pi, runtime.lastCheckpoint);
        ctx.ui.notify(`Restore of ${runtime.lastCheckpoint} started.`, "warning");
      } catch (error) { ctx.ui.notify(errorMessage(error), "error"); }
    },
  });

  pi.registerCommand("sprite-diff", {
    description: "Diff the current remote workspace against a checkpoint",
    handler: async (input, ctx) => {
      try {
        runtime.ensureConfigured(ctx.cwd);
        if (!runtime.selectedName) throw new Error("/sprite-diff requires a remotely selected Sprite.");
        const id = splitArgs(input)[0] || runtime.lastCheckpoint;
        if (!id) throw new Error("Usage: /sprite-diff <checkpoint-id>");
        const checkpointPath = `/.sprite/checkpoints/${id}${runtime.remoteCwd}`;
        const result = await runtime.sprite().exec(`/usr/bin/diff -ruN ${shellQuote(checkpointPath)} ${shellQuote(runtime.remoteCwd)} || true`, { maxBuffer: 8 * 1024 * 1024 });
        ctx.ui.notify(String(result.stdout).trim() || `No filesystem differences from ${id}.`, "info");
      } catch (error) { ctx.ui.notify(errorMessage(error), "error"); }
    },
  });

  pi.registerTool({
    name: "sprite_checkpoint",
    label: "Sprite checkpoint",
    description: "Create, list, or inspect Sprite checkpoints. Restore is intentionally available only through a user command.",
    promptSnippet: "Create and inspect Sprite filesystem checkpoints",
    parameters: Type.Object({
      action: Type.Union([Type.Literal("create"), Type.Literal("list"), Type.Literal("get")]),
      comment: Type.Optional(Type.String()),
      id: Type.Optional(Type.String()),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      runtime.ensureConfigured(ctx.cwd);
      if (params.action === "create") {
        const id = await createCheckpoint(pi, params.comment || "Pi checkpoint");
        await pruneCheckpoints();
        return textResult(`Created checkpoint ${id}`, { id });
      }
      if (params.action === "list") return textResult(await listCheckpoints(pi));
      if (!params.id) throw new Error("id is required for get");
      if (!runtime.selectedName) throw new Error("get requires a remotely selected Sprite");
      return textResult(JSON.stringify(await runtime.sprite().getCheckpoint(params.id), null, 2));
    },
  });

  pi.on("turn_start", (event) => {
    turnIndex = event.turnIndex;
    checkpointedThisTurn = false;
    pending = undefined;
  });

  pi.on("tool_call", async (event, ctx) => {
    runtime.ensureConfigured(ctx.cwd);
    const mode = runtime.config.checkpoint?.mode || "risky";
    if (mode === "off" || checkpointedThisTurn || !checkpointTargetAvailable()) return;
    if (mode === "risky" && !mutatesState(event)) return;
    pending ??= createCheckpoint(pi, `Pi turn ${turnIndex}: before ${event.toolName}`);
    try {
      await pending;
      checkpointedThisTurn = true;
      await pruneCheckpoints();
    } catch (error) {
      return { block: true, reason: `Could not create safety checkpoint: ${errorMessage(error)}` };
    } finally {
      pending = undefined;
    }
  });
}
