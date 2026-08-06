import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  createBashTool,
  createEditTool,
  createFindTool,
  createGrepTool,
  createLsTool,
  createReadTool,
  createWriteTool,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { splitArgs } from "../src/args.js";
import { registerRuntimeLifecycle, syncSpriteTools } from "../src/extension.js";
import { errorMessage, textResult } from "../src/output.js";
import {
  createRemoteBashOps,
  createRemoteEditOps,
  createRemoteFindOps,
  createRemoteLsOps,
  createRemoteReadOps,
  createRemoteWriteOps,
  remoteGrep,
} from "../src/remote.js";
import { runtime } from "../src/runtime.js";

function updateStatus(ctx: ExtensionContext): void {
  ctx.ui.setStatus("pi-sprites", ctx.ui.theme.fg(runtime.remoteEnabled() ? "accent" : "muted", `Sprites: ${runtime.status()}`));
}

function describeSprite(sprite: { name: string; status?: string; url?: string; labels?: string[] }): string {
  const parts = [sprite.name, sprite.status || "unknown"];
  if (sprite.url) parts.push(sprite.url);
  if (sprite.labels?.length) parts.push(`[${sprite.labels.join(", ")}]`);
  return parts.join(" · ");
}

async function listSprites(): Promise<string> {
  const sprites = await runtime.getClient().listAllSprites();
  return sprites.length ? sprites.map(describeSprite).join("\n") : "No Sprites found.";
}

async function showStatus(ctx: ExtensionContext): Promise<void> {
  runtime.ensureConfigured(ctx.cwd, ctx.isProjectTrusted());
  if (!runtime.selectedName) {
    ctx.ui.notify(`Sprites mode: ${runtime.status()}`, "info");
    return;
  }
  const sprite = await runtime.getClient().getSprite(runtime.selectedName);
  ctx.ui.notify(`${describeSprite(sprite)}\nRemote cwd: ${runtime.remoteCwd}\nTool mode: ${runtime.remoteEnabled() ? "remote" : "local"}`, "info");
}

async function useSprite(name: string, remoteCwd: string | undefined, ctx: ExtensionContext, pi: ExtensionAPI): Promise<void> {
  if (!name) throw new Error("Usage: /sprite-use <name> [remote-cwd]");
  await runtime.getClient().getSprite(name);
  runtime.select(name, remoteCwd);
  syncSpriteTools(pi);
  updateStatus(ctx);
  ctx.ui.notify(`Pi tools now target ${runtime.status()}`, "info");
}

async function createSprite(name: string, ctx: ExtensionContext, pi: ExtensionAPI): Promise<void> {
  if (!name) throw new Error("Usage: /sprite-new <name>");
  const sprite = await runtime.create(name);
  syncSpriteTools(pi);
  updateStatus(ctx);
  ctx.ui.notify(`Created ${describeSprite(sprite)}\nPi tools now target ${runtime.status()}`, "info");
}

async function destroySprite(name: string, ctx: ExtensionCommandContext, pi: ExtensionAPI): Promise<void> {
  if (!name) throw new Error("Usage: /sprite-destroy <name>");
  const confirmed = await ctx.ui.confirm("Destroy Sprite?", `${name} and all of its data will be permanently deleted.`);
  if (!confirmed) return;
  await runtime.getClient().deleteSprite(name);
  if (runtime.selectedName === name) {
    runtime.useLocal();
    syncSpriteTools(pi);
  }
  updateStatus(ctx);
  ctx.ui.notify(`Destroyed ${name}.`, "info");
}

async function proxyPort(args: string[], ctx: ExtensionContext): Promise<void> {
  const remotePort = Number(args[0]);
  const localPort = args[1] ? Number(args[1]) : remotePort;
  if (!Number.isInteger(remotePort) || remotePort <= 0 || !Number.isInteger(localPort) || localPort < 0) {
    throw new Error("Usage: /sprite-proxy <remote-port> [local-port; 0 chooses a free port]");
  }
  const proxy = await runtime.sprite().proxyPort(localPort, remotePort);
  runtime.registerProxy(proxy);
  ctx.ui.notify(`Proxy active: ${proxy.localAddr()} → ${runtime.selectedName}:localhost:${remotePort}`, "info");
}

async function sessions(args: string[], ctx: ExtensionContext): Promise<void> {
  const sprite = runtime.sprite();
  if (args[0] === "kill") {
    if (!args[1]) throw new Error("Usage: /sprite-sessions kill <session-id>");
    const stream = await sprite.killSession(args[1]);
    for await (const _event of stream) { /* drain progress */ }
    ctx.ui.notify(`Killed exec session ${args[1]}.`, "info");
    return;
  }
  const items = await sprite.listSessions();
  const message = items.length
    ? items.map((item) => `${item.id} · ${item.isActive ? "active" : "idle"} · ${item.command} · ${item.workdir}`).join("\n")
    : "No exec sessions found.";
  ctx.ui.notify(message, "info");
}

export default function coreExtension(pi: ExtensionAPI): void {
  pi.registerFlag("sprite", { description: "Route Pi tools to this Sprite", type: "string" });
  pi.registerFlag("sprite-cwd", { description: "Working directory inside the selected Sprite", type: "string" });
  pi.registerFlag("sprite-local", { description: "Keep Pi tools local even when a Sprite is configured", type: "boolean", default: false });
  registerRuntimeLifecycle(pi, () => {
    const flagSprite = pi.getFlag("sprite");
    const flagCwd = pi.getFlag("sprite-cwd");
    const local = pi.getFlag("sprite-local") === true;
    return {
      ...(typeof flagSprite === "string" && { sprite: flagSprite }),
      ...(typeof flagCwd === "string" && { remoteCwd: flagCwd }),
      ...(local && { mode: "local" as const }),
    };
  }, true);

  const localCwd = process.cwd();
  const localRead = createReadTool(localCwd);
  const localWrite = createWriteTool(localCwd);
  const localEdit = createEditTool(localCwd);
  const localBash = createBashTool(localCwd);
  const localGrep = createGrepTool(localCwd);
  const localFind = createFindTool(localCwd);
  const localLs = createLsTool(localCwd);

  pi.registerTool({
    ...localRead,
    async execute(id, params, signal, onUpdate, ctx) {
      if (!runtime.remoteEnabled()) return localRead.execute(id, params, signal, onUpdate);
      return createReadTool(runtime.remoteCwd, { operations: createRemoteReadOps(runtime.sprite()) }).execute(id, params, signal, onUpdate);
    },
  });

  pi.registerTool({
    ...localWrite,
    async execute(id, params, signal, onUpdate, ctx) {
      if (!runtime.remoteEnabled()) return localWrite.execute(id, params, signal, onUpdate);
      return createWriteTool(runtime.remoteCwd, { operations: createRemoteWriteOps(runtime.sprite()) }).execute(id, params, signal, onUpdate);
    },
  });

  pi.registerTool({
    ...localEdit,
    async execute(id, params, signal, onUpdate, ctx) {
      if (!runtime.remoteEnabled()) return localEdit.execute(id, params, signal, onUpdate);
      return createEditTool(runtime.remoteCwd, { operations: createRemoteEditOps(runtime.sprite()) }).execute(id, params, signal, onUpdate);
    },
  });

  pi.registerTool({
    ...localBash,
    async execute(id, params, signal, onUpdate, ctx) {
      if (!runtime.remoteEnabled()) return localBash.execute(id, params, signal, onUpdate);
      return createBashTool(runtime.remoteCwd, { operations: createRemoteBashOps(runtime.sprite()) }).execute(id, params, signal, onUpdate);
    },
  });

  pi.registerTool({
    ...localLs,
    async execute(id, params, signal, onUpdate, ctx) {
      if (!runtime.remoteEnabled()) return localLs.execute(id, params, signal, onUpdate);
      return createLsTool(runtime.remoteCwd, { operations: createRemoteLsOps(runtime.sprite()) }).execute(id, params, signal, onUpdate);
    },
  });

  pi.registerTool({
    ...localFind,
    async execute(id, params, signal, onUpdate, ctx) {
      if (!runtime.remoteEnabled()) return localFind.execute(id, params, signal, onUpdate);
      return createFindTool(runtime.remoteCwd, { operations: createRemoteFindOps(runtime.sprite()) }).execute(id, params, signal, onUpdate);
    },
  });

  pi.registerTool({
    ...localGrep,
    async execute(id, params, signal, onUpdate, ctx) {
      if (!runtime.remoteEnabled()) return localGrep.execute(id, params, signal, onUpdate);
      const output = await remoteGrep(runtime.sprite(), params, signal);
      return textResult(output);
    },
  });

  pi.registerTool({
    name: "sprite_manage",
    label: "Sprite",
    description: "List, inspect, create, or select Sprites and manage remote exec sessions. Destruction is intentionally command-only.",
    promptSnippet: "Manage and select Sprites remote environments",
    parameters: Type.Object({
      action: Type.Union([
        Type.Literal("status"), Type.Literal("list"), Type.Literal("create"), Type.Literal("select"),
        Type.Literal("local"), Type.Literal("sessions"), Type.Literal("kill_session"),
      ]),
      name: Type.Optional(Type.String({ description: "Sprite name for create/select" })),
      cwd: Type.Optional(Type.String({ description: "Remote working directory for select" })),
      sessionId: Type.Optional(Type.String({ description: "Exec session id for kill_session" })),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      runtime.ensureConfigured(ctx.cwd, ctx.isProjectTrusted());
      switch (params.action) {
        case "status": return textResult(runtime.status(), { sprite: runtime.selectedName, cwd: runtime.remoteCwd });
        case "list": return textResult(await listSprites());
        case "create": {
          if (!params.name) throw new Error("name is required for create");
          await runtime.create(params.name);
          syncSpriteTools(pi);
          updateStatus(ctx);
          return textResult(`Created and selected ${runtime.status()}`);
        }
        case "select": {
          if (!params.name) throw new Error("name is required for select");
          await runtime.getClient().getSprite(params.name);
          runtime.select(params.name, params.cwd);
          syncSpriteTools(pi);
          updateStatus(ctx);
          return textResult(`Selected ${runtime.status()}`);
        }
        case "local":
          runtime.useLocal();
          syncSpriteTools(pi);
          updateStatus(ctx);
          return textResult("Pi tools now run locally.");
        case "sessions": {
          const items = await runtime.sprite().listSessions();
          return textResult(JSON.stringify(items, null, 2));
        }
        case "kill_session": {
          if (!params.sessionId) throw new Error("sessionId is required for kill_session");
          const stream = await runtime.sprite().killSession(params.sessionId);
          for await (const _event of stream) { /* drain */ }
          return textResult(`Killed ${params.sessionId}`);
        }
      }
    },
  });

  pi.registerCommand("sprite", {
    description: "Manage Sprites: list, status, use, new, local, sessions, proxy, destroy",
    handler: async (input, ctx) => {
      try {
        runtime.ensureConfigured(ctx.cwd, ctx.isProjectTrusted());
        const [action = "status", ...args] = splitArgs(input);
        switch (action) {
          case "status": await showStatus(ctx); break;
          case "list": ctx.ui.notify(await listSprites(), "info"); break;
          case "use": await useSprite(args[0] || "", args[1], ctx, pi); break;
          case "new": await createSprite(args[0] || "", ctx, pi); break;
          case "local": runtime.useLocal(); syncSpriteTools(pi); updateStatus(ctx); ctx.ui.notify("Pi tools now run locally.", "info"); break;
          case "sessions": await sessions(args, ctx); break;
          case "proxy": await proxyPort(args, ctx); break;
          case "destroy": await destroySprite(args[0] || "", ctx, pi); break;
          default: throw new Error("Usage: /sprite [status|list|use|new|local|sessions|proxy|destroy] ...");
        }
      } catch (error) {
        ctx.ui.notify(errorMessage(error), "error");
      }
    },
  });

  pi.registerCommand("sprite-use", { description: "Select a Sprite and optional remote cwd", handler: async (input, ctx) => {
    try { const args = splitArgs(input); await useSprite(args[0] || "", args[1], ctx, pi); } catch (error) { ctx.ui.notify(errorMessage(error), "error"); }
  }});
  pi.registerCommand("sprite-new", { description: "Create and select a Sprite", handler: async (input, ctx) => {
    try { await createSprite(splitArgs(input)[0] || "", ctx, pi); } catch (error) { ctx.ui.notify(errorMessage(error), "error"); }
  }});
  pi.registerCommand("sprite-local", { description: "Return Pi tools to the local machine", handler: async (_input, ctx) => {
    runtime.useLocal(); syncSpriteTools(pi); updateStatus(ctx); ctx.ui.notify("Pi tools now run locally.", "info");
  }});
  pi.registerCommand("sprite-proxy", { description: "Proxy a Sprite TCP port locally", handler: async (input, ctx) => {
    try { await proxyPort(splitArgs(input), ctx); } catch (error) { ctx.ui.notify(errorMessage(error), "error"); }
  }});
  pi.registerCommand("sprite-destroy", { description: "Permanently destroy a Sprite with confirmation", handler: async (input, ctx) => {
    try { await destroySprite(splitArgs(input)[0] || "", ctx, pi); } catch (error) { ctx.ui.notify(errorMessage(error), "error"); }
  }});

  pi.on("session_start", (_event, ctx) => {
    updateStatus(ctx);
  });

  pi.on("user_bash", (_event) => {
    if (!runtime.remoteEnabled()) return;
    return { operations: createRemoteBashOps(runtime.sprite()) };
  });

  pi.on("before_agent_start", (event) => {
    if (!runtime.remoteEnabled()) return;
    const localLine = `Current working directory: ${runtime.localCwd}`;
    const remoteLine = `Current working directory: ${runtime.remoteCwd} (Sprite: ${runtime.selectedName}; tools execute remotely)`;
    return { systemPrompt: event.systemPrompt.includes(localLine) ? event.systemPrompt.replace(localLine, remoteLine) : `${event.systemPrompt}\n\n${remoteLine}` };
  });

}
