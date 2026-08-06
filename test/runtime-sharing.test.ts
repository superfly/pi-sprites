import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  discoverAndLoadExtensions,
  type ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

test("separately evaluated extensions share the selected Sprite", async () => {
  const loaded = await discoverAndLoadExtensions([
    join(root, "test", "fixtures", "runtime-select.ts"),
    join(root, "test", "fixtures", "runtime-read.ts"),
  ], root, join(root, "test", "fixtures", "empty-agent-dir"));
  assert.deepEqual(loaded.errors, []);

  const select = loaded.extensions[0]?.commands.get("test-sprite-select");
  const read = loaded.extensions[1]?.commands.get("test-sprite-read");
  assert.ok(select);
  assert.ok(read);

  const notifications: string[] = [];
  const context = {
    ui: { notify: (message: string) => notifications.push(message) },
  } as unknown as ExtensionCommandContext;

  await select.handler("pi-test-alex", context);
  await read.handler("", context);

  assert.deepEqual(notifications, ["pi-test-alex"]);
});
