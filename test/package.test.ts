import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

test("package manifest exposes only resources that exist", () => {
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
    name: string;
    keywords: string[];
    pi: { extensions: string[]; skills: string[]; prompts: string[] };
  };
  assert.equal(manifest.name, "pi-sprites");
  assert.ok(manifest.keywords.includes("pi-package"));
  for (const extension of manifest.pi.extensions) assert.ok(existsSync(join(root, extension)), extension);
  for (const directory of [...manifest.pi.skills, ...manifest.pi.prompts]) assert.ok(existsSync(join(root, directory)), directory);
});

test("all skills have valid required frontmatter", () => {
  const skills = ["sprites", "sprite-api-gateway", "sprite-ci", "sprite-workers", "sprite-rpc-host"];
  for (const skill of skills) {
    const content = readFileSync(join(root, "skills", skill, "SKILL.md"), "utf8");
    assert.match(content, /^---\nname: [a-z0-9-]+\ndescription: .+\n---/);
  }
});
