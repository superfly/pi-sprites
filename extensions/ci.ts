import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { runCi } from "../src/ci.js";
import { registerRuntimeLifecycle } from "../src/extension.js";
import { errorMessage, textResult } from "../src/output.js";
import { runtime } from "../src/runtime.js";

function formatCi(result: Awaited<ReturnType<typeof runCi>>): string {
  const sections = [
    `${result.exitCode === 0 ? "PASS" : "FAIL"} · ${result.sprite} · ${result.command}`,
    ...result.report,
  ];
  if (result.stdout.trim()) sections.push(`stdout:\n${result.stdout.trim()}`);
  if (result.stderr.trim()) sections.push(`stderr:\n${result.stderr.trim()}`);
  return sections.join("\n");
}

export default function ciExtension(pi: ExtensionAPI): void {
  registerRuntimeLifecycle(pi);
  pi.registerCommand("sprite-ci", {
    description: "Run CI in an isolated, retained-by-default Sprite",
    handler: async (input, ctx) => {
      try {
        runtime.ensureConfigured(ctx.cwd, ctx.isProjectTrusted());
        ctx.ui.setWorkingMessage("Running CI in a Sprite…");
        const result = await runCi(pi, input.trim() || undefined, undefined, ctx.isProjectTrusted());
        ctx.ui.notify(formatCi(result), result.exitCode === 0 ? "info" : "error");
      } catch (error) { ctx.ui.notify(errorMessage(error), "error"); }
      finally { ctx.ui.setWorkingMessage(); }
    },
  });

  pi.registerTool({
    name: "sprite_ci",
    label: "Sprite CI",
    description: "Bootstrap an isolated CI Sprite, run a command, and retain failures for diagnosis unless project cleanup policy says otherwise.",
    promptSnippet: "Run tests and CI in an isolated Sprite",
    parameters: Type.Object({
      command: Type.Optional(Type.String()),
      name: Type.Optional(Type.String()),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      runtime.ensureConfigured(ctx.cwd, ctx.isProjectTrusted());
      const result = await runCi(pi, params.command, params.name, ctx.isProjectTrusted());
      return textResult(formatCi(result), { exitCode: result.exitCode, sprite: result.sprite, cleanedUp: result.cleanedUp });
    },
  });
}
