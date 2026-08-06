# Retained CI

The CI extension bootstraps a dedicated branch-scoped Sprite, runs one shell command there, and retains the environment by default so failures can be inspected rather than disappearing with a transient CI runner.

## Command and model tool

```text
/sprite-ci [command]
```

With no argument, the command comes from `ci.command`, defaulting to `npm test`. The model-facing `sprite_ci` tool accepts optional `command` and `name` fields; the slash command generates the Sprite name automatically.

## Lifecycle

CI:

1. Generates `<namePrefix>-<project>-<branch>` unless the tool supplies a name.
2. Runs the same process as [bootstrap](./bootstrap.md) against that Sprite.
3. Executes the CI command in the bootstrapped remote workspace.
4. Creates an additional diagnostic checkpoint when the command fails.
5. Applies the configured cleanup policy.

The CI Sprite is an explicit target. Running CI does not select it and does not redirect concurrent reads, writes, shell commands, status rendering, or checkpoint hooks away from the user's current Sprite.

## Configuration

```json
{
  "ci": {
    "command": "npm test",
    "namePrefix": "pi-ci",
    "cleanup": "never"
  }
}
```

Cleanup modes:

- `never` (default): retain every CI Sprite.
- `on-success`: destroy successful environments and retain failures.
- `always`: destroy the environment after any completed run.

Use `never` or `on-success` when post-failure inspection matters. A failure checkpoint is deleted with the Sprite when cleanup is `always`.

## Examples

```text
/sprite-ci
/sprite-ci npm run test:integration
/sprite-use pi-ci-my-project-feature-x /workspace/my-project
```

Name components are normalized to lowercase letters, digits, and hyphens and truncated to fit Sprite naming limits. CI operates from Git state cloned by bootstrap; it does not transfer uncommitted local changes.
