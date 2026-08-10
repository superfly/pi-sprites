# Manual end-to-end test plan

This is a user-facing acceptance walkthrough for `pi-sprites`. It exercises every
extension the way a person actually would inside a running Pi session, in a
natural order: select an environment, work in it, snapshot it, run services,
tighten policy, bootstrap reproducibly, run CI and workers, and stand up the RPC
host. Each step lists the action, what you should see, and how it maps to a
feature.

The automated `npm test` suite covers config parsing, tool wiring, and RPC-host
logic. This plan covers the interactive experience those tests cannot.

> **Automating this for an agent or CI?** See
> [Automated end-to-end testing](./automated-testing.md). Most of what follows can
> run headlessly against a real Sprite via `npm run test:e2e`.

## 0. Prerequisites

- Node.js 24+ (`node --version`).
- A Sprites access token exported locally:
  ```bash
  export SPRITES_TOKEN='...'
  ```
- This checkout with `npm ci` completed, and a scratch Git project whose
  `origin` is reachable from a Sprite without copying local credentials. Its
  configured CI commands should be safe to run.
- A throwaway Sprite name to avoid touching real work, e.g. `pi-sprites-test`.

From the scratch project, set the checkout path and launch Pi with all
extensions:

```bash
PI_SPRITES_CHECKOUT=/absolute/path/to/pi-sprites
pi -e "$PI_SPRITES_CHECKOUT/extensions/core.ts" \
   -e "$PI_SPRITES_CHECKOUT/extensions/checkpoints.ts" \
   -e "$PI_SPRITES_CHECKOUT/extensions/services.ts" \
   -e "$PI_SPRITES_CHECKOUT/extensions/policy.ts" \
   -e "$PI_SPRITES_CHECKOUT/extensions/bootstrap.ts" \
   -e "$PI_SPRITES_CHECKOUT/extensions/ci.ts" \
   -e "$PI_SPRITES_CHECKOUT/extensions/workers.ts" \
   -e "$PI_SPRITES_CHECKOUT/extensions/rpc-host.ts"
```

Cleanup is at the end. Nothing here enables public URLs or copies credentials.

---

## 1. Core: selection and native tool routing

| Step | Action | Expect |
|---|---|---|
| 1.1 | `/sprite status` | Reports the current mode. With no global `sprite` configured, this is local mode with no selection. |
| 1.2 | `/sprite list` | Lists your Sprites (or empty). Confirms auth works. |
| 1.3 | `/sprite new pi-sprites-test` | Creates and selects the Sprite. Its initial `remoteCwd` is derived from the local project unless configured. |
| 1.4 | `/sprite-use pi-sprites-test /workspace/pi-sprites-test` | Selects an explicit test working directory. |
| 1.5 | `!mkdir -p /workspace/pi-sprites-test` then `!pwd` | Creates the workspace and prints `/workspace/pi-sprites-test` from the **remote** Sprite. |
| 1.6 | Ask Pi to write a file `hello.txt` with some text | The `write` tool creates the file remotely. |
| 1.7 | Ask Pi to read `hello.txt` and list the directory | The `read` and `ls` tools show the remote file. |
| 1.8 | `/sprite-local` then `!pwd` | Returns to your **local** machine's cwd. |
| 1.9 | `/sprite-use pi-sprites-test /workspace/pi-sprites-test` then ask Pi to list the directory | Back in the remote workspace, the file is still present. |

**Pass criteria:** native tools transparently switch between local and remote,
and selection survives within the session.

---

## 2. Checkpoints: transactional safety

| Step | Action | Expect |
|---|---|---|
| 2.1 | `/sprite-checkpoint before-edits` | Creates a named checkpoint; ID remembered for the session. |
| 2.2 | `/sprite-checkpoints` | Lists checkpoints, newest first. |
| 2.3 | `edit hello.txt` to change contents (this is the first mutation of the turn) | An automatic `risky` safety checkpoint is created before the edit. |
| 2.4 | `read hello.txt` | Shows your change. |
| 2.5 | `/sprite-undo` and confirm | Restores the latest session checkpoint; file reverts. |
| 2.6 | `/sprite-restore <id>` with an ID from 2.2, confirm | Restores that specific checkpoint. |

**Pass criteria:** manual, automatic, undo, and restore all work; restore always
asks for confirmation; the model cannot restore.

---

## 3. Services: long-running processes

| Step | Action | Expect |
|---|---|---|
| 3.1 | `/sprite-service create web python3 -m http.server 3000` | Creates a long-running service in `remoteCwd` without relying on project-specific scripts. |
| 3.2 | `/sprite-services` | Lists services with status. |
| 3.3 | `/sprite-service logs web 200` | Streams recent logs. |
| 3.4 | `/sprite-service restart web` | Restarts cleanly. |
| 3.5 | `/sprite-proxy 3000 3000` | Opens a local TCP proxy; hitting `localhost:3000` reaches the service. |
| 3.6 | `/sprite-service stop web` then `/sprite-service delete web`, confirm | Stops and removes the definition (logs remain). |

**Pass criteria:** service lifecycle + local proxy work; delete confirms.

---

## 4. Policy: network / privilege / resources

| Step | Action | Expect |
|---|---|---|
| 4.1 | `/sprite-policy show` | Prints network, privilege, resource groups. |
| 4.2 | `/sprite-policy defaults` | Adds the development-default rule set. |
| 4.3 | `/sprite-policy allow api.github.com` | Appends an allow rule (no duplicate if repeated). |
| 4.4 | `/sprite-policy deny telemetry.example.com` | Appends a deny rule. |
| 4.5 | `!curl -sI https://api.github.com` | Verify connectivity still works after tightening. |
| 4.6 | `/sprite-policy unrestricted`, confirm | Clears all network rules (confirmed action). |

**Pass criteria:** show/allow/deny/defaults/apply/unrestricted behave; clearing
confirms; empty rules == unrestricted (not deny-all).

---

## 5. Bootstrap: reproducible environment

Point config at the scratch repo first. Create `.pi/sprites.json` (see
`templates/sprites.json`), set `remoteCwd` to `/workspace/pi-sprites-test`, and
set `bootstrap.repository`, `branch`, and safe, repeatable `commands`.
**Trust the project** in Pi so config is honored.

| Step | Action | Expect |
|---|---|---|
| 5.1 | `/sprite-bootstrap pi-sprites-test` | Reuses the Sprite, clones repo if no `.git`, checks out branch, runs trusted commands, applies policy, creates services, checkpoints. |
| 5.2 | Re-run `/sprite-bootstrap pi-sprites-test` | Idempotent: reuses checkout, only creates missing services, reapplies policy. |
| 5.3 | `/sprite-use pi-sprites-test /workspace/pi-sprites-test` | Point native tools at the configured bootstrapped tree. |
| 5.4 | `/sprite-services` and `/sprite-checkpoints` | Show the reconciled services and known-good checkpoint. |

**Pass criteria:** bootstrap converges, is safe to repeat, refuses commands
without project trust, and does not change your active selection by itself.

---

## 6. CI: retained, branch-scoped runs

| Step | Action | Expect |
|---|---|---|
| 6.1 | `/sprite-ci` | Provisions `pi-ci-<project>-<branch>`, bootstraps it, runs `ci.command` (default `npm test`). |
| 6.2 | Observe result | Output shows exit status. On failure, a diagnostic checkpoint is created. |
| 6.3 | `/sprite-ci npm run lint` (or a passing command) | Runs a custom command. |
| 6.4 | `/sprite status` | Confirms your **active** Sprite is unchanged — CI used a separate handle. |
| 6.5 | `/sprite-use pi-ci-<project>-<branch>` | Optionally inspect the retained CI environment. |

**Pass criteria:** CI runs against its own Sprite, retains by default, keeps a
failure checkpoint, and never redirects your current routing target.

---

## 7. Workers: concurrent fan-out

| Step | Action | Expect |
|---|---|---|
| 7.1 | `/sprite-workers shell "npm test" "npm run lint"` | Provisions/reuses a worker pool, runs tasks concurrently, reports per-task exit code/stdout/stderr. |
| 7.2 | `/sprite-workers status` | Lists worker Sprites by prefix. |
| 7.3 | (agent mode) set `workers.agentCommand`, then `/sprite-workers agent "summarize the README"` | Each task is piped to the agent command inside its worker. Requires model creds configured inside workers. |
| 7.4 | `/sprite status` | Your active Sprite is still unchanged. |

**Pass criteria:** tasks run in isolation and concurrently; workers don't share
uncommitted changes; your selection is untouched.

---

## 8. RPC host: durable remote Pi

| Step | Action | Expect |
|---|---|---|
| 8.1 | `/sprite-rpc install` | Ensures Pi is present, uploads host script, creates `pi-rpc-host` service. |
| 8.2 | `/sprite-rpc status` | Reports service state and internal port. |
| 8.3 | `/sprite-rpc proxy` | Session-scoped local TCP proxy. |
| 8.4 | `curl localhost:43120/health` | Returns healthy. |
| 8.5 | `curl -sS -H 'Content-Type: application/json' -d '{"type":"get_state"}' http://localhost:43120/rpc` | Sends one JSON command over HTTP and returns its correlated Pi RPC response. |
| 8.6 | `/sprite-rpc remove`, confirm | Deletes the service (session data remains). |

**Pass criteria:** host installs as a service, is reachable only via local proxy
by default, and removal confirms. (Only test `httpPort` + bearer secret if you
explicitly want routing through the Sprite URL. Making that URL public is a
separate platform setting and is not part of this plan.)

---

## 9. Model-tool activation (optional)

With `toolActivation: "auto"` (default): ask the model to do something requiring
a `sprite_*` tool while in local mode — it should **not** have them. Select a
Sprite, ask again — the eight `sprite_*` tools become available. `/sprite-local`
deactivates them. Set `"always"` in trusted config to expose them before
selection.

---

## 10. Session reset behavior

Select a Sprite other than the one declared in configuration, then start a new,
resumed, or forked Pi session and run `/sprite status`. The transient selection
must reset to the newly loaded configuration (or to no selection if none is
configured), rather than carrying over the prior session's choice. Proxies are
closed, and `/sprite-undo` must report that Pi has not created a checkpoint in
the new session. This guards against stale state silently targeting the wrong
environment.

---

## 11. Cleanup

```text
/sprite destroy pi-sprites-test        # confirm
/sprite destroy pi-ci-<project>-<branch>
/sprite-workers status                 # note worker names, destroy each
```

Then remove any test `.pi/sprites.json` and scratch files. Confirm `/sprite list`
no longer shows the test Sprites.

---

## Coverage matrix

| Extension | Covered by |
|---|---|
| Core | §1, §9, §10 |
| Checkpoints | §2, plus bootstrap and CI failure checkpoints in §5/§6 |
| Services | §3, §5.4 |
| Policy | §4, §5.1 |
| Bootstrap | §5, and reused by §6/§7 |
| CI | §6 |
| Workers | §7 |
| RPC host | §8 |
