# Reproducible bootstrap

`/sprite-bootstrap` creates or converges a Sprite into the development environment declared by the project. It is idempotent where practical: it reuses an existing Sprite and checkout, creates only missing services, reapplies configured policies, and can leave a known-good checkpoint.

## What it does

In order, bootstrap:

1. Chooses a Sprite name from the command argument, current user selection, configured `sprite`, or `pi-<project-name>`.
2. Creates that Sprite when it does not exist, otherwise reuses it.
3. Creates `remoteCwd`.
4. Clones `bootstrap.repository` when the directory has no `.git`. If omitted, it uses the local checkout's `origin` URL when available.
5. Checks out `bootstrap.branch` when configured.
6. Runs each trusted `bootstrap.commands` shell string in `remoteCwd`.
7. Applies configured network, privilege, and resource policies.
8. Creates any missing configured services.
9. Creates a checkpoint unless `bootstrap.checkpoint` is `false`.

## Command and model tool

```text
/sprite-bootstrap [name]
```

The equivalent model tool is `sprite_bootstrap`, with an optional `name` argument.

Bootstrap returns an explicit Sprite handle internally. It does not change the user's selected routing target. Run `/sprite-use <name>` afterward when normal Pi tools should target the bootstrapped environment.

## Configuration

```json
{
  "sprite": "pi-my-project",
  "remoteCwd": "/workspace/my-project",
  "bootstrap": {
    "repository": "git@github.com:example/my-project.git",
    "branch": "main",
    "commands": ["npm ci", "npm run build"],
    "services": [
      {
        "name": "web",
        "cmd": "npm",
        "args": ["run", "dev"],
        "dir": "/workspace/my-project",
        "httpPort": 3000
      }
    ],
    "checkpoint": true
  }
}
```

Policies are configured in the top-level `policy` section; see [Policies](./policy.md). Service fields are covered in [Services](./services.md).

## Trust and source behavior

Project configuration is ignored until Pi trusts the project. Bootstrap also checks trust immediately before honoring `bootstrap.commands` and refuses to run them otherwise.

Bootstrap clones a Git repository; it does not upload local files or uncommitted changes. If the destination already contains a `.git` directory, it does not fetch, pull, reset, or replace the checkout. A configured branch is checked out, but convergence intentionally avoids destructive synchronization.

Setup commands run every time bootstrap runs. Make them safe to repeat.

## Example

```text
/sprite-bootstrap pi-my-project
/sprite-use pi-my-project /workspace/my-project
/sprite-services
/sprite-checkpoints
```
