---
name: sprites
description: Create, select, inspect, operate, and clean up persistent isolated Sprites from Pi. Use for remote development, sandboxed execution, services, checkpoints, policies, proxies, or Sprite lifecycle work.
---

# Sprites

Use the native `sprite_*` tools and `/sprite-*` commands provided by this package. Do not replace them with hand-written `curl` calls or a second MCP integration.

## Contexts

- **Pi outside a Sprite:** after `sprite_manage` selects a Sprite, Pi's `read`, `write`, `edit`, `bash`, `grep`, `find`, `ls`, and `!` commands operate in the remote workspace.
- **Pi inside a Sprite:** normal tools are already local to the Sprite. Use checkpoint, service, policy, and connector workflows without selecting the same Sprite remotely.

Always state which context is active before assuming a filesystem is local or remote. Use `sprite_manage` with `action: "status"` when uncertain.

## Golden path

1. List Sprites with `sprite_manage` when the user has not named one.
2. Select an obvious existing environment, or create a task-scoped one.
3. Run `sprite_bootstrap` when the project has `.pi/sprites.json`.
4. Use native Pi tools for normal work; they route automatically.
5. Create a checkpoint before broad, risky, or difficult-to-reverse changes.
6. Use `sprite_service` for daemons and servers, not a long-running foreground shell.
7. Inspect network policy before widening egress.
8. Retain environments by default. Destroy only on explicit user request or configured cleanup policy.

## Safety

- Checkpoint restore replaces the writable filesystem and terminates active sessions. It does not restore memory or running processes.
- Sprite destruction is permanent. Only `/sprite-destroy` exposes it, with confirmation.
- Sprite URLs may be public. Never expose environment variables, arbitrary filesystem access, debug dumps, or unprotected admin endpoints.
- Keep provider credentials out of Sprite environment variables when a Sprite Connector can broker them.
- An empty network-policy rule list is unrestricted. Prefer the `defaults` preset plus narrow domain rules.
- Project bootstrap commands are executable code. Use them only after Pi has trusted the project.

## Long-running work

Use services for servers, databases, and daemons that must return after a cold boot. Use exec sessions for builds and interactive work. Use `/sprite-proxy` for local-only TCP access.

## Failure recovery

On a risky failure:

1. Inspect current state and logs.
2. Use `/sprite-diff <checkpoint>` if a checkpoint exists.
3. Preserve useful diagnostics.
4. Ask before `/sprite-restore` or `/sprite-undo`.
