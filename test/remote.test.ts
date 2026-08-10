import assert from "node:assert/strict";
import { test } from "node:test";
import type { Sprite } from "@fly/sprites";
import {
  createRemoteBashOps,
  createRemoteEditOps,
  createRemoteLsOps,
  createRemoteReadOps,
  createRemoteWriteOps,
} from "../src/remote.js";

test("remote filesystem operations delegate to the Sprites SDK", async () => {
  const calls: unknown[][] = [];
  const filesystem = {
    readFile: async (...args: unknown[]) => { calls.push(["read", ...args]); return Buffer.from("hello"); },
    writeFile: async (...args: unknown[]) => { calls.push(["write", ...args]); },
    mkdir: async (...args: unknown[]) => { calls.push(["mkdir", ...args]); },
    stat: async (...args: unknown[]) => { calls.push(["stat", ...args]); return { isDirectory: () => true }; },
    exists: async (...args: unknown[]) => { calls.push(["exists", ...args]); return true; },
    readdir: async (...args: unknown[]) => { calls.push(["readdir", ...args]); return ["a.ts"]; },
  };
  const sprite = { filesystem: () => filesystem } as unknown as Sprite;

  assert.equal((await createRemoteReadOps(sprite).readFile("/a")).toString(), "hello");
  await createRemoteWriteOps(sprite).writeFile("/b", "world");
  await createRemoteEditOps(sprite).access("/b");
  assert.deepEqual(await createRemoteLsOps(sprite).readdir("/"), ["a.ts"]);
  assert.deepEqual(calls.map((call) => call[0]), ["read", "write", "stat", "readdir"]);
});

test("remote bash does not copy the local process environment into a Sprite", async () => {
  let spawnOptions: Record<string, unknown> | undefined;
  const child = {
    stdout: { on: () => undefined },
    stderr: { on: () => undefined },
    on: () => undefined,
    wait: async () => 0,
    kill: () => undefined,
  };
  const sprite = {
    spawn: (_command: string, _args: string[], options: Record<string, unknown>) => {
      spawnOptions = options;
      return child;
    },
  } as unknown as Sprite;

  await createRemoteBashOps(sprite).exec("env", process.cwd(), {
    onData: () => undefined,
    env: {
      PATH: process.env.PATH,
      SPRITES_TOKEN: "must-not-leave-the-local-process",
      GITHUB_TOKEN: "must-not-leave-the-local-process",
    },
  });

  assert.ok(spawnOptions);
  assert.equal("env" in spawnOptions, false);
});
