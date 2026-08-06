# Worker pool

The workers extension fans independent tasks across a persistent pool of isolated Sprites. It supports direct shell commands and Pi agent prompts.

## Commands

```text
/sprite-workers status
/sprite-workers shell "npm test" "npm run lint"
/sprite-workers agent "fix the failing test" "review the API changes"
```

Quote each task when it contains spaces. `status` lists Sprites matching the configured worker prefix.

The model-facing `sprite_workers` tool accepts `mode`, a `tasks` array, and an optional `count` from 1 through 16.

## How tasks are assigned

The extension creates or reuses up to `count` worker Sprites named `<namePrefix>-<project>-<index>`, bootstraps each, then assigns tasks round-robin. All task processes run concurrently after provisioning.

In `shell` mode, each task string runs through the Sprite shell in `remoteCwd`.

In `agent` mode, the task is written to the standard input of `workers.agentCommand`. The command runs through `/bin/bash -lc` and may continue for up to ten minutes after disconnect. Model credentials and Pi configuration must already be available inside each worker Sprite.

Workers use explicit Sprite handles. Provisioning or running them does not change the user's selected Sprite or redirect unrelated concurrent tools.

## Configuration

```json
{
  "workers": {
    "count": 3,
    "namePrefix": "pi-worker",
    "agentCommand": "pi -p --no-session",
    "cleanup": "never"
  }
}
```

- `count`: pool size, default 2 and maximum 16. It is capped at the number of tasks.
- `namePrefix`: worker Sprite prefix.
- `agentCommand`: required only for `agent` mode.
- `cleanup`: `never`, `on-success`, or `always`.

`on-success` destroys all worker Sprites only when every task succeeds. `always` destroys all workers after completion. `never` keeps the pool warm for reuse.

## Isolation and source state

Each worker has an independent filesystem. Workers do not see one another's changes and do not receive uncommitted local changes. Reused workers retain prior filesystem state; bootstrap does not reset an existing checkout. Tasks that require a pristine tree should clean it explicitly or use a unique prefix and lifecycle policy.

Use workers only for genuinely independent tasks. There is no automatic merge or result reconciliation beyond collecting exit codes, stdout, and stderr.
