import assert from "node:assert/strict";
import { test } from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import bootstrap from "../extensions/bootstrap.js";
import checkpoints from "../extensions/checkpoints.js";
import ci from "../extensions/ci.js";
import core from "../extensions/core.js";
import policy from "../extensions/policy.js";
import rpcHost from "../extensions/rpc-host.js";
import services from "../extensions/services.js";
import workers from "../extensions/workers.js";

test("every extension registers without performing startup work", () => {
  const commands: string[] = [];
  const tools: string[] = [];
  const flags: string[] = [];
  const events: string[] = [];
  const fakePi = {
    registerCommand: (name: string) => commands.push(name),
    registerTool: (tool: { name: string }) => tools.push(tool.name),
    registerFlag: (name: string) => flags.push(name),
    on: (event: string) => events.push(event),
  } as unknown as ExtensionAPI;

  for (const extension of [core, checkpoints, services, policy, bootstrap, ci, workers, rpcHost]) {
    extension(fakePi);
  }

  assert.equal(new Set(commands).size, commands.length);
  assert.equal(new Set(tools).size, tools.length);
  assert.ok(commands.includes("sprite"));
  assert.ok(commands.includes("sprite-rpc"));
  assert.ok(tools.includes("sprite_manage"));
  assert.ok(tools.includes("sprite_workers"));
  assert.deepEqual(flags.sort(), ["sprite", "sprite-cwd", "sprite-local"]);
  assert.ok(events.includes("tool_call"));
  assert.ok(events.includes("session_shutdown"));
});
