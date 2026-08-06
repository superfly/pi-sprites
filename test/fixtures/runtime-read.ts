import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { runtime } from "../../src/runtime.js";

export default function runtimeReadFixture(pi: ExtensionAPI): void {
  pi.registerCommand("test-sprite-read", {
    handler: async (_input, ctx) => {
      ctx.ui.notify(runtime.selectedName || "none");
    },
  });
}
