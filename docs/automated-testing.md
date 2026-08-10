# Automated end-to-end testing

The [manual test plan](./manual-test-plan.md) is written for a human in a Pi
session. This document explains how an **agent or CI** can exercise the same
features without a TUI.

The key fact that makes this possible: all feature logic lives in the `src/`
modules (`runtime.ts`, `bootstrap.ts`, `services.ts`, `policy.ts`, `remote.ts`,
`ci.ts`, `workers.ts`, `rpc-host.ts`). The interactive slash commands and the
`sprite_*` model tools are thin wrappers around those modules, so driving the
modules or the tools tests the real behavior.

## Approach A — Live integration test (recommended for CI)

A gated Node test drives the `src/` modules and the `@fly/sprites` SDK against a
real Sprite. It is the automated counterpart to the manual plan.

```bash
export SPRITES_TOKEN='...'
npm run test:e2e            # sets PI_SPRITES_E2E=1 for you
```

Without `PI_SPRITES_E2E=1` (or without a token) the test self-skips, so it is
safe to leave in the default `npm test` run — it appears as `skipped`.

**Cleanup:** the test destroys its own Sprite in an `after` hook regardless of
outcome, and additionally sweeps any stale `pi-e2e-*` Sprites older than an hour
left behind by interrupted runs. Creating Sprites is cheap — they sleep when
idle — but the suite still removes everything it makes so CI never accumulates
environments.

What it covers, mirroring the manual sections:

| Stage | Manual section | Modules exercised |
|---|---|---|
| Create Sprite | §1 | `SpritesClient` |
| Remote filesystem tools | §1 | `src/remote.ts` |
| Checkpoint create/list | §2 | SDK checkpoints |
| Service reconcile/inspect | §3 | `src/services.ts` |
| Apply network policy | §4 | `src/policy.ts` |
| Idempotent bootstrap | §5 | `src/bootstrap.ts` |
| RPC host install | §8 | `src/rpc-host.ts` |

Each stage is an isolated subtest: a single failing feature is reported without
blocking the others, and the Sprite is destroyed in an `after` hook regardless
of outcome. The test is hermetic — bootstrap runs with no repository so it never
clones, and it uses a unique per-run Sprite name (`pi-e2e-<timestamp>`).

Source: [`test/e2e.live.test.ts`](../test/e2e.live.test.ts).

### CI wiring

The repository ships [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)
with two jobs:

- **`check`** — `npm run check` (build + unit tests). Always runs, needs no
  secrets, so it works on forked pull requests.
- **`e2e`** — `npm run test:e2e` against real Sprites. It runs whenever the
  `SPRITES_TOKEN` secret is available, and self-skips cleanly when it is not.

The `e2e` job reads its token from a GitHub **Environment** named `pi` (see
below), so no token is needed for the live test to be a no-op on untrusted runs.

CI and workers (`runCi`, `runWorkers`) provision *additional* Sprites named from
the project and branch/index. They are omitted from the default live test to keep
resource use predictable; add them deliberately when your cleanup budget allows.

### Providing the token via a GitHub Environment

The workflow's `e2e` job declares `environment: pi`, so the secret lives on that
environment rather than at the repository level. To set it up:

1. In the repo on GitHub, go to **Settings → Environments → New environment** and
   name it **`pi`**.
2. Open the `pi` environment and, under **Environment secrets**, click **Add
   secret**. Name it `SPRITES_TOKEN` and paste your Sprites access token.
3. (Optional) Add **Deployment branches / protection rules** on the `pi`
   environment — for example, restrict it to `main` — so the token is only
   exposed to trusted runs and never to forked-PR builds.

Because environment secrets are not exposed to workflows triggered from forks,
fork pull requests run `check` normally while the live `e2e` job simply
self-skips. Push and same-repo pull-request runs on the allowed branches get the
token and execute the full live suite.

## Approach B — Headless Pi driving the model tools

To test the full stack including the `sprite_*` tools and prompt wiring, run Pi
in print mode with tools always active and let a model call them:

```bash
export SPRITES_TOKEN='...'
# In trusted .pi/sprites.json: { "toolActivation": "always" }
pi -p --no-session \
   -e ./extensions/core.ts -e ./extensions/checkpoints.ts \
   -e ./extensions/services.ts -e ./extensions/policy.ts \
   "Create a Sprite named agent-smoke, write /workspace/agent-smoke/ok.txt, \
    read it back, create a checkpoint, then destroy the Sprite."
```

This is the closest match to "an agent does the testing," but it is
non-deterministic (results depend on the model). Use it for exploratory or
acceptance-style checks, and Approach A for deterministic regression gating.

## Approach C — Drive a durable Pi over RPC

For an external agent or service to drive a long-lived remote Pi, install the RPC
host and talk to it over HTTP:

```text
/sprite-rpc install
/sprite-rpc proxy
```

Then `POST /rpc` with JSON-line requests, subscribe to `GET /events`, and poll
`GET /health`. See [rpc-host.md](./rpc-host.md). This is useful when the tester is
itself an autonomous agent that needs a persistent session rather than one-shot
prompts.

## Choosing an approach

- **Regression gate in CI:** Approach A.
- **Verifying the model can actually use the tools/prompts:** Approach B.
- **An autonomous agent running an extended session:** Approach C.
