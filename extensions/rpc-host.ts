import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { splitArgs } from "../src/args.js";
import { errorMessage, textResult } from "../src/output.js";
import { installRpcHost, proxyRpcHost, removeRpcHost, rpcHostStatus } from "../src/rpc-host.js";
import { runtime } from "../src/runtime.js";

export default function rpcHostExtension(pi: ExtensionAPI): void {
  pi.registerCommand("sprite-rpc", {
    description: "Install, inspect, proxy, or remove a durable Pi RPC host service",
    handler: async (input, ctx) => {
      try {
        runtime.ensureConfigured(ctx.cwd);
        const [action = "status", ...args] = splitArgs(input);
        const sprite = runtime.sprite();
        if (action === "install") {
          ctx.ui.setWorkingMessage("Installing Pi RPC host…");
          ctx.ui.notify((await installRpcHost(sprite)).join("\n") || "Pi RPC host installed.", "info");
        } else if (action === "proxy") {
          const port = args[0] ? Number(args[0]) : undefined;
          ctx.ui.notify(`Pi RPC host available at http://${await proxyRpcHost(sprite, port)}`, "info");
        } else if (action === "remove") {
          const confirmed = await ctx.ui.confirm("Remove Pi RPC host?", "This deletes the service definition but leaves Pi sessions on disk.");
          if (confirmed) { await removeRpcHost(sprite); ctx.ui.notify("Pi RPC host service removed.", "info"); }
        } else if (action === "status") {
          ctx.ui.notify(await rpcHostStatus(sprite), "info");
        } else {
          throw new Error("Usage: /sprite-rpc [status|install|proxy|remove] [local-port]");
        }
      } catch (error) { ctx.ui.notify(errorMessage(error), "error"); }
      finally { ctx.ui.setWorkingMessage(); }
    },
  });

  pi.registerTool({
    name: "sprite_rpc_host",
    label: "Pi RPC host",
    description: "Inspect, install, or locally proxy a durable Pi RPC-mode service in the selected Sprite.",
    promptSnippet: "Host a durable Pi RPC session in a Sprite",
    parameters: Type.Object({
      action: Type.Union([Type.Literal("status"), Type.Literal("install"), Type.Literal("proxy")]),
      localPort: Type.Optional(Type.Number()),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      runtime.ensureConfigured(ctx.cwd);
      const sprite = runtime.sprite();
      if (params.action === "status") return textResult(await rpcHostStatus(sprite));
      if (params.action === "install") return textResult((await installRpcHost(sprite)).join("\n") || "Pi RPC host installed.");
      return textResult(`Pi RPC host available at http://${await proxyRpcHost(sprite, params.localPort)}`);
    },
  });
}
