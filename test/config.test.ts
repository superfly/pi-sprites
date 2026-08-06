import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { splitArgs, shellQuote } from "../src/args.js";
import { defaultRemoteCwd, loadConfig, parsePositiveInteger, sanitizeName } from "../src/config.js";

test("sanitizes Sprite names and derives a remote cwd", () => {
  assert.equal(sanitizeName("Feature/One_With Spaces!!!"), "feature-one-with-spaces");
  assert.equal(sanitizeName("---"), "");
  assert.equal(defaultRemoteCwd("/work/My Project"), "/workspace/my-project");
});

test("parses quoted command arguments", () => {
  assert.deepEqual(splitArgs(`create web npm "run dev" 'two words'`), ["create", "web", "npm", "run dev", "two words"]);
  assert.throws(() => splitArgs(`"unclosed`), /Unclosed quote/);
  assert.equal(shellQuote("it's safe"), `'it'"'"'s safe'`);
});

test("accepts only positive integer configuration values", () => {
  assert.equal(parsePositiveInteger(3, 1), 3);
  assert.equal(parsePositiveInteger(0, 2), 2);
  assert.equal(parsePositiveInteger(2.5, 4), 4);
});

test("project configuration is validated and loaded only for trusted projects", () => {
  const cwd = mkdtempSync(join(tmpdir(), "pi-sprites-config-"));
  try {
    mkdirSync(join(cwd, ".pi"));
    writeFileSync(join(cwd, ".pi", "sprites.json"), JSON.stringify({
      sprite: "trusted-project",
      bootstrap: { commands: ["npm ci"] },
    }));
    assert.notEqual(loadConfig(cwd, {}, false).sprite, "trusted-project");
    assert.equal(loadConfig(cwd, {}, true).sprite, "trusted-project");

    writeFileSync(join(cwd, ".pi", "sprites.json"), JSON.stringify({ workers: { count: "many" } }));
    assert.throws(() => loadConfig(cwd, {}, true), /workers\.count/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
