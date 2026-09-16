import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { ExtensionAPI, ExtensionContext, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { getShellConfig } from "@earendil-works/pi-coding-agent";
import type { Sprite } from "@fly/sprites";
import core from "../extensions/core.js";
import { runtime } from "../src/runtime.js";

test("core bash preserves local shell settings and remote isolation", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "pi-sprites-bash-"));
  const cwd = join(root, "project");
  const agentDir = join(root, "agent");
  mkdirSync(join(cwd, ".pi"), { recursive: true });
  mkdirSync(agentDir);
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = agentDir;
  t.after(() => {
    if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
    rmSync(root, { recursive: true, force: true });
  });

  let bash: ToolDefinition | undefined;
  core({
    registerTool: (tool: ToolDefinition) => { if (tool.name === "bash") bash = tool; },
    registerFlag: () => undefined,
    registerCommand: () => undefined,
    on: () => undefined,
  } as unknown as ExtensionAPI);
  assert.ok(bash);
  const bashTool = bash;
  const context = (trusted: boolean) => ({
    cwd,
    isProjectTrusted: () => trusted,
    sessionManager: {
      getSessionId: () => "shell-settings-test",
      getSessionFile: () => undefined,
    },
  }) as unknown as ExtensionContext;
  const execute = (command: string, trusted = true) =>
    bashTool.execute("bash-test", { command }, undefined, undefined, context(trusted));
  const globalSettings = join(agentDir, "settings.json");
  const projectSettings = join(cwd, ".pi", "settings.json");
  const missingShell = join(root, "missing-shell");
  const shellPath = getShellConfig().shell;
  const routing = t.mock.method(runtime, "remoteEnabled", () => false);

  await t.test("global shell prefix is applied in the context working directory", async () => {
    writeFileSync(globalSettings, JSON.stringify({ shellCommandPrefix: "export PI_SPRITES_TEST_PREFIX=global" }));
    writeFileSync(join(cwd, "marker.txt"), "context-cwd");
    const result = await execute('printf "%s/" "$PI_SPRITES_TEST_PREFIX"; cat marker.txt');
    assert.deepEqual(result.content, [{ type: "text", text: "global/context-cwd" }]);
  });

  await t.test("configured global shell path is honored", async () => {
    writeFileSync(globalSettings, JSON.stringify({ shellPath: missingShell }));
    await assert.rejects(execute("printf unexpected"), /Custom shell path not found/);
  });

  await t.test("trusted project settings override the global prefix and shell path", async () => {
    writeFileSync(globalSettings, JSON.stringify({ shellPath: missingShell, shellCommandPrefix: "exit 71" }));
    writeFileSync(projectSettings, JSON.stringify({ shellPath, shellCommandPrefix: "export PI_SPRITES_TEST_PREFIX=project" }));
    const result = await execute('printf "%s" "$PI_SPRITES_TEST_PREFIX"');
    assert.deepEqual(result.content, [{ type: "text", text: "project" }]);
  });

  await t.test("untrusted project settings cannot override the global prefix or shell path", async () => {
    writeFileSync(globalSettings, JSON.stringify({ shellPath, shellCommandPrefix: "export PI_SPRITES_TEST_PREFIX=global" }));
    writeFileSync(projectSettings, JSON.stringify({ shellPath: missingShell, shellCommandPrefix: "exit 72" }));
    const result = await execute('printf "%s" "$PI_SPRITES_TEST_PREFIX"', false);
    assert.deepEqual(result.content, [{ type: "text", text: "global" }]);
  });

  await t.test("remote bash ignores local shell settings and does not forward the local environment", async () => {
    writeFileSync(globalSettings, JSON.stringify({ shellPath: missingShell, shellCommandPrefix: "exit 73" }));
    routing.mock.mockImplementation(() => true);
    const calls: unknown[][] = [];
    const sprite = {
      spawn: (command: string, args: string[], options: Record<string, unknown>) => {
        calls.push([command, args, options]);
        return {
          stdout: { on: () => undefined },
          stderr: { on: () => undefined },
          on: () => undefined,
          wait: async () => 0,
          kill: () => undefined,
        };
      },
    } as unknown as Sprite;
    t.mock.method(runtime, "sprite", () => sprite);
    await execute("printf remote");
    assert.deepEqual(calls, [["/bin/bash", ["-lc", "printf remote"], { cwd: runtime.remoteCwd }]]);
  });
});
