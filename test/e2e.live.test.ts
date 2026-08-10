// Live end-to-end integration test.
//
// This is the CI/agent-runnable counterpart to docs/manual-test-plan.md. It
// drives the real src/ feature modules and the @fly/sprites SDK against a real
// Sprite, so it exercises the same logic the interactive slash commands and
// sprite_* model tools use — without a TUI.
//
// It is skipped unless you opt in, because it creates and destroys real Sprites
// and consumes account resources:
//
//   PI_SPRITES_E2E=1 SPRITES_TOKEN=... npm run test:e2e
//
// Every stage is best-effort and isolated: one failing feature is reported but
// does not prevent the others (or cleanup) from running.

import assert from "node:assert/strict";
import { after, test } from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { SpritesClient, type Sprite } from "@fly/sprites";
import { bootstrapSprite } from "../src/bootstrap.js";
import { collectEvents } from "../src/output.js";
import { applyPolicies } from "../src/policy.js";
import {
  createRemoteEditOps,
  createRemoteLsOps,
  createRemoteReadOps,
  createRemoteWriteOps,
} from "../src/remote.js";
import { installRpcHost, rpcHostStatus } from "../src/rpc-host.js";
import { runtime } from "../src/runtime.js";
import { reconcileServices } from "../src/services.js";

const enabled = process.env.PI_SPRITES_E2E === "1" || process.env.npm_lifecycle_event === "test:e2e";
const token = process.env.SPRITES_TOKEN || process.env.SPRITE_TOKEN;
const runId = `pi-e2e-${Date.now().toString(36)}`;
const REMOTE_CWD = `/workspace/${runId}`;
const E2E_LABEL = "pi-sprites-e2e";

// Minimal ExtensionAPI stand-in. bootstrap/ci/workers only call pi.exec for git
// (`git config --get remote.origin.url`, `git branch --show-current`). Returning
// a non-zero code keeps bootstrap from resolving a repository and cloning it,
// so the test stays hermetic and provisions nothing outside this Sprite.
const pi = {
  exec: async () => ({ code: 1, stdout: "", stderr: "" }),
} as unknown as ExtensionAPI;

let client: SpritesClient;
let sprite: Sprite;

test("live e2e", { skip: !enabled || !token ? "set PI_SPRITES_E2E=1 and SPRITES_TOKEN" : false }, async (t) => {
  client = new SpritesClient(token as string);

  // Point the shared runtime at this test's Sprite so src/ modules resolve it.
  runtime.beginSession(runId, process.cwd(), true, { sprite: runId, remoteCwd: REMOTE_CWD, mode: "remote" });
  runtime.config.bootstrap = { checkpoint: false }; // hermetic: no repo, no auto-clone
  runtime.config.rpcHost = { port: 43120, localPort: 0, piCommand: "pi", secretEnv: "PI_SPRITES_RPC_SECRET" };

  after(async () => {
    // Destroy this run's Sprite, then sweep any stale pi-e2e-* Sprites left by
    // earlier interrupted runs so CI never accumulates test environments.
    try {
      await client.deleteSprite(runId);
    } catch {
      /* best effort */
    }
    try {
      const all = await client.listAllSprites();
      const cutoff = Date.now() - 60 * 60 * 1000; // older than 1h
      for (const s of all) {
        const match = /^pi-e2e-([0-9a-z]+)$/.exec(s.name);
        if (!match || s.name === runId || !s.labels.includes(E2E_LABEL)) continue;
        const created = Number.parseInt(match[1] ?? "", 36);
        if (Number.isFinite(created) && created < cutoff) {
          await client.deleteSprite(s.name).catch(() => {});
        }
      }
    } catch {
      /* best effort */
    }
    await runtime.endSession(runId);
  });

  await t.test("core: create Sprite", async () => {
    sprite = await client.createSprite(runId, {
      runtime: "dev",
      waitForCapacity: true,
      labels: [E2E_LABEL],
    });
    await sprite.execFile("mkdir", ["-p", REMOTE_CWD]);
    const found = await client.getSprite(runId);
    assert.equal(found.name, runId);
  });

  await t.test("core: remote filesystem tools", async () => {
    await createRemoteWriteOps(sprite).writeFile(`${REMOTE_CWD}/hello.txt`, "hello from e2e");
    const body = (await createRemoteReadOps(sprite).readFile(`${REMOTE_CWD}/hello.txt`)).toString();
    assert.equal(body, "hello from e2e");
    await createRemoteEditOps(sprite).access(`${REMOTE_CWD}/hello.txt`);
    const entries = await createRemoteLsOps(sprite).readdir(REMOTE_CWD);
    assert.ok(entries.includes("hello.txt"));
  });

  await t.test("checkpoints: create and list", async () => {
    const before = new Set((await sprite.listCheckpoints()).map((c) => c.id));
    await collectEvents(await sprite.createCheckpoint("e2e checkpoint"));
    const after = await sprite.listCheckpoints();
    assert.ok(after.some((c) => !before.has(c.id)), "a new checkpoint should appear");
  });

  await t.test("services: reconcile and inspect", async () => {
    await reconcileServices(sprite, [
      { name: "sleeper", cmd: "sleep", args: ["3600"], dir: REMOTE_CWD },
    ]);
    const services = await sprite.listServices();
    assert.ok(services.some((s) => s.name === "sleeper"));
    await sprite.deleteService("sleeper").catch(() => {});
  });

  await t.test("policy: apply defaults", async () => {
    const applied = await applyPolicies(sprite, {
      network: { rules: [{ include: "defaults" }] },
    });
    assert.ok(Array.isArray(applied));
  });

  await t.test("bootstrap: idempotent converge (hermetic)", async () => {
    const result = await bootstrapSprite(pi, runId, true, REMOTE_CWD);
    assert.equal(result.remoteCwd, REMOTE_CWD);
    assert.ok(result.report.some((line) => line.includes(runId)));
  });

  await t.test("rpc-host: install as service", async () => {
    await installRpcHost(sprite);
    const status = await rpcHostStatus(sprite);
    assert.match(status, /pi-rpc-host/);
  });

  // Note: CI (runCi) and workers (runWorkers) provision *additional* Sprites
  // named from the project + branch/index. Enable them with PI_SPRITES_E2E_HEAVY=1
  // and ensure your cleanup budget can afford the extra environments.
});
