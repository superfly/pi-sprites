import assert from "node:assert/strict";
import { test } from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { Sprite, SpritesClient } from "@fly/sprites";
import { bootstrapSprite } from "../src/bootstrap.js";
import { runCi } from "../src/ci.js";
import { SPRITE_TOOL_NAMES, syncSpriteTools } from "../src/extension.js";
import { runtime } from "../src/runtime.js";
import { runWorkers } from "../src/workers.js";

test("session shutdown and replacement clear session-scoped routing state", async () => {
  runtime.beginSession("session-a", process.cwd(), false);
  runtime.select("session-a-sprite", "/workspace/a");
  runtime.lastCheckpoint = "v7";
  await runtime.endSession("session-a");
  assert.equal(runtime.selectedName, undefined);
  assert.equal(runtime.lastCheckpoint, undefined);

  runtime.beginSession("session-b", process.cwd(), false);
  assert.equal(runtime.selectedName, runtime.config.sprite);
  assert.equal(runtime.lastCheckpoint, undefined);
  await runtime.endSession("session-b");
});

test("Sprite tools activate only for remote routing in auto mode", async () => {
  runtime.beginSession("tool-activation", process.cwd(), false);
  runtime.config.toolActivation = "auto";
  let active = ["read", ...SPRITE_TOOL_NAMES];
  const pi = {
    getActiveTools: () => [...active],
    setActiveTools: (names: string[]) => { active = names; },
  } as unknown as ExtensionAPI;

  syncSpriteTools(pi);
  assert.deepEqual(active, ["read"]);
  runtime.select("selected-sprite");
  syncSpriteTools(pi);
  assert.deepEqual(new Set(active), new Set(["read", ...SPRITE_TOOL_NAMES]));
  runtime.useLocal();
  syncSpriteTools(pi);
  assert.deepEqual(active, ["read"]);
  await runtime.endSession("tool-activation");
});

test("bootstrap uses an explicit target without changing user routing", async () => {
  runtime.beginSession("bootstrap-target", process.cwd(), false);
  runtime.select("user-sprite", "/workspace/user");
  runtime.config.bootstrap = { checkpoint: false };
  const target = {
    name: "ci-sprite",
    execFile: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
  } as unknown as Sprite;
  const client = {
    getSprite: async () => target,
  } as unknown as SpritesClient;
  const originalGetClient = runtime.getClient;
  runtime.getClient = () => client;
  const pi = {
    exec: async () => ({ code: 1, stdout: "", stderr: "", killed: false }),
  } as unknown as ExtensionAPI;

  try {
    const result = await bootstrapSprite(pi, "ci-sprite", false);
    assert.equal(result.sprite, target);
    assert.equal(runtime.selectedName, "user-sprite");
    assert.equal(runtime.remoteCwd, "/workspace/user");
  } finally {
    runtime.getClient = originalGetClient;
    await runtime.endSession("bootstrap-target");
  }
});

test("bootstrap refuses configured shell commands for untrusted projects before side effects", async () => {
  runtime.beginSession("bootstrap-trust", process.cwd(), false);
  runtime.config.bootstrap = { commands: ["npm ci"] };
  let requestedClient = false;
  const originalGetClient = runtime.getClient;
  runtime.getClient = () => {
    requestedClient = true;
    throw new Error("must not be called");
  };
  const pi = {} as ExtensionAPI;
  try {
    await assert.rejects(() => bootstrapSprite(pi, "untrusted", false), /not trusted/);
    assert.equal(requestedClient, false);
  } finally {
    runtime.getClient = originalGetClient;
    await runtime.endSession("bootstrap-trust");
  }
});

test("CI and workers keep user routing stable throughout internal operations", async () => {
  runtime.beginSession("orchestration-targets", process.cwd(), false);
  runtime.select("user-sprite", "/workspace/user");
  runtime.config.bootstrap = { checkpoint: false };
  runtime.config.ci = { command: "npm test", namePrefix: "ci", cleanup: "never" };
  runtime.config.workers = { count: 2, namePrefix: "worker", cleanup: "never" };

  const sprites = new Map<string, Sprite>();
  const getTarget = (name: string): Sprite => {
    let target = sprites.get(name);
    if (!target) {
      target = {
        name,
        execFile: async () => {
          assert.equal(runtime.selectedName, "user-sprite");
          return { exitCode: 0, stdout: "", stderr: "" };
        },
        exec: async () => {
          assert.equal(runtime.selectedName, "user-sprite");
          assert.equal(runtime.remoteCwd, "/workspace/user");
          return { exitCode: 0, stdout: "ok", stderr: "" };
        },
      } as unknown as Sprite;
      sprites.set(name, target);
    }
    return target;
  };
  const client = {
    getSprite: async (name: string) => getTarget(name),
    deleteSprite: async () => {},
  } as unknown as SpritesClient;
  const originalGetClient = runtime.getClient;
  runtime.getClient = () => client;
  const pi = {
    exec: async (_file: string, args: string[]) => args[0] === "branch"
      ? { code: 0, stdout: "main\n", stderr: "", killed: false }
      : { code: 1, stdout: "", stderr: "", killed: false },
  } as unknown as ExtensionAPI;

  try {
    const ci = await runCi(pi, undefined, undefined, false);
    const workers = await runWorkers(pi, ["npm test", "npm run lint"], "shell", 2, false);
    assert.equal(ci.exitCode, 0);
    assert.equal(workers.length, 2);
    assert.equal(runtime.selectedName, "user-sprite");
    assert.equal(runtime.remoteCwd, "/workspace/user");
  } finally {
    runtime.getClient = originalGetClient;
    await runtime.endSession("orchestration-targets");
  }
});
