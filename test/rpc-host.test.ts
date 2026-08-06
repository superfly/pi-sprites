import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

test("RPC host runtime is valid JavaScript", () => {
  const root = dirname(dirname(fileURLToPath(import.meta.url)));
  const result = spawnSync(process.execPath, ["--check", join(root, "runtime", "pi-rpc-host.mjs")], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
});
