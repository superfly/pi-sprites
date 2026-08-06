import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { runtime } from "../../src/runtime.js";

export default function runtimeSelectFixture(pi: ExtensionAPI): void {
  pi.registerCommand("test-sprite-select", {
    handler: async (name) => {
      runtime.select(name);
    },
  });
}
