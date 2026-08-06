---
name: sprite-ci
description: Run tests, builds, and CI checks in isolated retained Sprites. Use when validation should not mutate the developer's machine or when failed environments should remain available for diagnosis.
---

# Sprite CI

Use `sprite_ci` or `/sprite-ci`. The workflow creates or reuses a branch-scoped CI Sprite, bootstraps it from `.pi/sprites.json`, runs the requested command, and retains the environment by default.

On failure, report:

- Sprite name.
- Command and exit code.
- Concise stdout and stderr evidence.
- That a failure checkpoint was captured.
- The command needed to select the retained Sprite for investigation.

Do not destroy a failed CI Sprite unless the user asks or `ci.cleanup` explicitly says `always`. Prefer one focused CI command per call; use Sprite workers for independent parallel checks.
