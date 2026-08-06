import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { splitArgs } from "../src/args.js";
import { registerRuntimeLifecycle } from "../src/extension.js";
import { collectEvents, errorMessage, textResult } from "../src/output.js";
import { runtime } from "../src/runtime.js";
import { formatService, reconcileServices } from "../src/services.js";

async function listServices(): Promise<string> {
  const services = await runtime.sprite().listServices();
  return services.length ? services.map(formatService).join("\n") : "No services configured.";
}

async function serviceAction(action: string, args: string[], ctx: ExtensionContext): Promise<string> {
  const sprite = runtime.sprite();
  const name = args[0];
  switch (action) {
    case "list": return listServices();
    case "get":
      if (!name) throw new Error("Usage: /sprite-service get <name>");
      return formatService(await sprite.getService(name));
    case "create": {
      if (!name || !args[1]) throw new Error("Usage: /sprite-service create <name> <command> [args...]");
      const lines = await collectEvents(await sprite.createService(name, {
        cmd: args[1],
        args: args.slice(2),
        dir: runtime.remoteCwd,
      }, "5s"));
      return lines.join("\n") || `Created ${name}.`;
    }
    case "start":
    case "stop":
    case "restart": {
      if (!name) throw new Error(`Usage: /sprite-service ${action} <name>`);
      const stream = action === "start"
        ? await sprite.startService(name, "5s")
        : action === "stop"
          ? await sprite.stopService(name)
          : await sprite.restartService(name, "5s");
      const lines = await collectEvents(stream);
      return lines.join("\n") || `${action} requested for ${name}.`;
    }
    case "logs": {
      if (!name) throw new Error("Usage: /sprite-service logs <name> [lines]");
      const lines = await collectEvents(await sprite.getServiceLogs(name, { lines: Number(args[1]) || 100 }));
      return lines.join("\n") || `No logs for ${name}.`;
    }
    case "delete": {
      if (!name) throw new Error("Usage: /sprite-service delete <name>");
      const confirmed = await ctx.ui.confirm("Delete service?", `Delete the ${name} service definition? Logs remain on disk.`);
      if (!confirmed) return "Cancelled.";
      await sprite.deleteService(name);
      return `Deleted ${name}.`;
    }
    case "reconcile": {
      const configured = runtime.config.bootstrap?.services || [];
      if (!configured.length) return "No services are declared in .pi/sprites.json.";
      const lines = await reconcileServices(sprite, configured);
      return lines.join("\n") || "Services reconciled.";
    }
    default: throw new Error("Usage: /sprite-service [list|get|create|start|stop|restart|logs|delete|reconcile] ...");
  }
}

export default function servicesExtension(pi: ExtensionAPI): void {
  registerRuntimeLifecycle(pi);
  pi.registerCommand("sprite-services", {
    description: "List services in the selected Sprite",
    handler: async (_input, ctx) => {
      try { runtime.ensureConfigured(ctx.cwd, ctx.isProjectTrusted()); ctx.ui.notify(await listServices(), "info"); }
      catch (error) { ctx.ui.notify(errorMessage(error), "error"); }
    },
  });

  pi.registerCommand("sprite-service", {
    description: "Create, inspect, operate, or reconcile a Sprite service",
    handler: async (input, ctx) => {
      try {
        runtime.ensureConfigured(ctx.cwd, ctx.isProjectTrusted());
        const [action = "list", ...args] = splitArgs(input);
        ctx.ui.notify(await serviceAction(action, args, ctx), "info");
      } catch (error) { ctx.ui.notify(errorMessage(error), "error"); }
    },
  });

  pi.registerTool({
    name: "sprite_service",
    label: "Sprite service",
    description: "List, inspect, create, start, stop, restart, or read logs for services in the selected Sprite.",
    promptSnippet: "Manage persistent services in a Sprite",
    parameters: Type.Object({
      action: Type.Union([
        Type.Literal("list"), Type.Literal("get"), Type.Literal("create"), Type.Literal("start"),
        Type.Literal("stop"), Type.Literal("restart"), Type.Literal("logs"), Type.Literal("reconcile"),
      ]),
      name: Type.Optional(Type.String()),
      command: Type.Optional(Type.String()),
      args: Type.Optional(Type.Array(Type.String())),
      dir: Type.Optional(Type.String()),
      env: Type.Optional(Type.Record(Type.String(), Type.String())),
      needs: Type.Optional(Type.Array(Type.String())),
      httpPort: Type.Optional(Type.Number()),
      lines: Type.Optional(Type.Number()),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      runtime.ensureConfigured(ctx.cwd, ctx.isProjectTrusted());
      const sprite = runtime.sprite();
      if (params.action === "list") return textResult(await listServices());
      if (params.action === "reconcile") {
        const lines = await reconcileServices(sprite, runtime.config.bootstrap?.services || []);
        return textResult(lines.join("\n") || "Services reconciled.");
      }
      if (!params.name) throw new Error("name is required");
      if (params.action === "get") return textResult(formatService(await sprite.getService(params.name)));
      if (params.action === "create") {
        if (!params.command) throw new Error("command is required for create");
        const stream = await sprite.createService(params.name, {
          cmd: params.command,
          ...(params.args && { args: params.args }),
          dir: params.dir || runtime.remoteCwd,
          ...(params.env && { env: params.env }),
          ...(params.needs && { needs: params.needs }),
          ...(params.httpPort !== undefined && { httpPort: params.httpPort }),
        }, "5s");
        return textResult((await collectEvents(stream)).join("\n") || `Created ${params.name}.`);
      }
      if (params.action === "logs") {
        return textResult((await collectEvents(await sprite.getServiceLogs(params.name, { lines: params.lines || 100 }))).join("\n"));
      }
      const stream = params.action === "start"
        ? await sprite.startService(params.name, "5s")
        : params.action === "stop"
          ? await sprite.stopService(params.name)
          : await sprite.restartService(params.name, "5s");
      return textResult((await collectEvents(stream)).join("\n") || `${params.action} requested for ${params.name}.`);
    },
  });
}
