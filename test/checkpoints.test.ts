import assert from "node:assert/strict";
import { test } from "node:test";
import type { Sprite } from "@fly/sprites";
import { listUnfilteredCheckpoints } from "../src/checkpoints.js";

test("listing all checkpoints does not send a history filter", async () => {
  const calls: unknown[][] = [];
  const sprite = {
    listCheckpoints: async (...args: unknown[]) => {
      calls.push(args);
      return [];
    },
  } as unknown as Sprite;

  assert.deepEqual(await listUnfilteredCheckpoints(sprite), []);
  assert.deepEqual(calls, [[]]);
});
