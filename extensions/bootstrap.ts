import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { splitArgs } from "../src/args.js";
import { bootstrapSprite } from "../src/bootstrap.js";
import { registerRuntimeLifecycle } from "../src/extension.js";
import { errorMessage, textResult } from "../src/output.js";
import { runtime } from "../src/runtime.js";

export default function bootstrapExtension(pi: ExtensionAPI): void {
  registerRuntimeLifecycle(pi);
  pi.registerCommand("sprite-bootstrap", {
    description: "Create or converge a Sprite from .pi/sprites.json",
    handler: async (input, ctx) => {
      try {
        runtime.ensureConfigured(ctx.cwd, ctx.isProjectTrusted());
        const name = splitArgs(input)[0];
        ctx.ui.setWorkingMessage("Bootstrapping Sprite…");
        const result = await bootstrapSprite(pi, name, ctx.isProjectTrusted());
        ctx.ui.notify(result.report.join("\n"), "info");
      } catch (error) {
        ctx.ui.notify(errorMessage(error), "error");
      } finally {
        ctx.ui.setWorkingMessage();
      }
    },
  });

  pi.registerTool({
    name: "sprite_bootstrap",
    label: "Bootstrap Sprite",
    description: "Create or converge a Sprite using the trusted project's .pi/sprites.json manifest.",
    promptSnippet: "Bootstrap a reproducible Sprite development environment",
    parameters: Type.Object({ name: Type.Optional(Type.String()) }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      runtime.ensureConfigured(ctx.cwd, ctx.isProjectTrusted());
      const result = await bootstrapSprite(pi, params.name, ctx.isProjectTrusted());
      return textResult(result.report.join("\n"), { sprite: result.sprite.name, cwd: result.remoteCwd });
    },
  });
}
