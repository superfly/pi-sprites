---
name: sprite-workers
description: Fan independent shell tasks or Pi agent prompts across persistent isolated Sprite workers. Use for parallel tests, independent investigations, reviews, or multi-agent work.
---

# Sprite Workers

Use `sprite_workers` only for tasks that can run independently. Keep one task per worker input and make expected output explicit.

- `mode: "shell"` runs each task as a shell command.
- `mode: "agent"` sends each task to the configured `workers.agentCommand` over stdin.

Agent mode requires Pi and its model authentication to be available inside each worker. Prefer a Sprite Connector or another policy-controlled provider configuration over copying long-lived model keys into worker environments.

Workers are persistent and retained by default. Summarize results by worker and call out failures. Do not assume workers share uncommitted filesystem changes with one another.
