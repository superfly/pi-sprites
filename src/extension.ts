import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { runtime } from "./runtime.js";
import type { RuntimeOverrides } from "./types.js";

export const SPRITE_TOOL_NAMES = new Set([
  "sprite_manage",
  "sprite_checkpoint",
  "sprite_service",
  "sprite_policy",
  "sprite_bootstrap",
  "sprite_ci",
  "sprite_workers",
  "sprite_rpc_host",
]);

export function syncSpriteTools(pi: ExtensionAPI): void {
  const active = pi.getActiveTools();
  runtime.captureSpriteToolBaseline(active, SPRITE_TOOL_NAMES);
  const desired = runtime.desiredSpriteTools();
  const next = active.filter((name) => !SPRITE_TOOL_NAMES.has(name));
  for (const name of desired) next.push(name);
  const unique = [...new Set(next)];
  if (unique.length !== active.length || unique.some((name, index) => name !== active[index])) {
    pi.setActiveTools(unique);
  }
}

export function registerRuntimeLifecycle(
  pi: ExtensionAPI,
  getOverrides: (() => RuntimeOverrides) | undefined = undefined,
  providesCore = false,
): void {
  pi.on("session_start", (_event, ctx) => {
    runtime.beginSession(
      ctx.sessionManager.getSessionId(),
      ctx.cwd,
      ctx.isProjectTrusted(),
      getOverrides?.() || {},
    );
    if (providesCore) runtime.markCoreAvailable();
    syncSpriteTools(pi);
  });
  pi.on("session_shutdown", async (_event, ctx) => {
    await runtime.endSession(ctx.sessionManager.getSessionId());
  });
}
