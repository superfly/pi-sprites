import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { splitArgs } from "../src/args.js";
import { registerRuntimeLifecycle } from "../src/extension.js";
import { errorMessage, textResult } from "../src/output.js";
import { runtime } from "../src/runtime.js";
import { runWorkers } from "../src/workers.js";
import type { WorkerResult } from "../src/types.js";

function formatResults(results: WorkerResult[]): string {
  return results.map((result) => {
    const sections = [`${result.exitCode === 0 ? "PASS" : "FAIL"} · ${result.sprite} · ${result.task}`];
    if (result.stdout.trim()) sections.push(result.stdout.trim());
    if (result.stderr.trim()) sections.push(`stderr:\n${result.stderr.trim()}`);
    return sections.join("\n");
  }).join("\n\n");
}

export default function workersExtension(pi: ExtensionAPI): void {
  registerRuntimeLifecycle(pi);
  pi.registerCommand("sprite-workers", {
    description: "Run shell tasks or Pi agents across a persistent Sprite worker pool",
    handler: async (input, ctx) => {
      try {
        runtime.ensureConfigured(ctx.cwd, ctx.isProjectTrusted());
        const [mode = "status", ...tasks] = splitArgs(input);
        if (mode === "status") {
          const prefix = runtime.config.workers?.namePrefix || "pi-worker";
          const sprites = await runtime.getClient().listAllSprites(prefix);
          ctx.ui.notify(sprites.length ? sprites.map((sprite) => `${sprite.name} · ${sprite.status}`).join("\n") : "No worker Sprites found.", "info");
          return;
        }
        if (mode !== "shell" && mode !== "agent") throw new Error('Usage: /sprite-workers [status|shell "task"...|agent "prompt"...]');
        ctx.ui.setWorkingMessage(`Running ${tasks.length} Sprite workers…`);
        const results = await runWorkers(pi, tasks, mode, undefined, ctx.isProjectTrusted());
        ctx.ui.notify(formatResults(results), results.every((item) => item.exitCode === 0) ? "info" : "error");
      } catch (error) { ctx.ui.notify(errorMessage(error), "error"); }
      finally { ctx.ui.setWorkingMessage(); }
    },
  });

  pi.registerTool({
    name: "sprite_workers",
    label: "Sprite workers",
    description: "Run independent shell tasks or configured Pi agent prompts concurrently across persistent, isolated Sprite workers.",
    promptSnippet: "Fan independent work out across isolated Sprite workers",
    parameters: Type.Object({
      mode: Type.Union([Type.Literal("shell"), Type.Literal("agent")]),
      tasks: Type.Array(Type.String(), { minItems: 1, maxItems: 16 }),
      count: Type.Optional(Type.Number({ minimum: 1, maximum: 16 })),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      runtime.ensureConfigured(ctx.cwd, ctx.isProjectTrusted());
      const results = await runWorkers(pi, params.tasks, params.mode, params.count, ctx.isProjectTrusted());
      return textResult(formatResults(results), { results });
    },
  });
}
