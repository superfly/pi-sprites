# pi-sprites

[![CI](https://github.com/superfly/pi-sprites/actions/workflows/ci.yml/badge.svg)](https://github.com/superfly/pi-sprites/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

First-class [Sprites](https://sprites.dev) environments for the [Pi coding agent](https://pi.dev).

`pi-sprites` can route Pi's native filesystem and shell tools into a persistent, isolated Sprite, then add checkpointing, services, policy management, reproducible bootstrap, retained CI, worker pools, and a durable Pi RPC host. One Pi package installs the extensions, skills, and prompt templates together.

## Install

`pi-sprites` is not published to npm. Until the first npm release, install it
directly from GitHub (the repository must be public or your Git client must
already have access):

```bash
pi install git:github.com/superfly/pi-sprites
```

After `pi-sprites` is published to npm:

```bash
pi install npm:pi-sprites
```

For development from this checkout:

```bash
npm ci
pi -e ./extensions/core.ts \
  -e ./extensions/checkpoints.ts \
  -e ./extensions/services.ts \
  -e ./extensions/policy.ts \
  -e ./extensions/bootstrap.ts \
  -e ./extensions/ci.ts \
  -e ./extensions/workers.ts \
  -e ./extensions/rpc-host.ts
```

Node.js 24 or later is required by the Sprites SDK.

## Authentication

Set a Sprites access token in the local environment running Pi:

```bash
export SPRITES_TOKEN='...'
```

`SPRITE_TOKEN` is also accepted. Change `tokenEnv` in configuration when a different environment variable should be used. The token stays in the local Pi process; it is not copied into remote commands or the Sprite.

## Quick start

```text
/sprite list
/sprite new pi-my-project
/sprite-bootstrap
```

Once selected, Pi's normal `read`, `write`, `edit`, `bash`, `grep`, `find`, `ls`, and `!` commands operate in the remote workspace. Return to local tools with:

```text
/sprite-local
```

You can also select a Sprite at startup:

```bash
pi --sprite pi-my-project --sprite-cwd /workspace/my-project
```

## Included extensions

| Extension | Main commands and tools |
|---|---|
| [Core remote environment](./docs/core.md) | `/sprite`, `/sprite-use`, `/sprite-new`, `/sprite-local`, `/sprite-proxy`, `sprite_manage` |
| [Transactional checkpoints](./docs/checkpoints.md) | `/sprite-checkpoint`, `/sprite-checkpoints`, `/sprite-restore`, `/sprite-undo`, `sprite_checkpoint` |
| [Services](./docs/services.md) | `/sprite-services`, `/sprite-service`, `sprite_service` |
| [Policies](./docs/policy.md) | `/sprite-policy`, `sprite_policy` |
| [Reproducible bootstrap](./docs/bootstrap.md) | `/sprite-bootstrap`, `sprite_bootstrap` |
| [Retained CI](./docs/ci.md) | `/sprite-ci`, `sprite_ci` |
| [Worker pool](./docs/workers.md) | `/sprite-workers`, `sprite_workers` |
| [Durable Pi RPC host](./docs/rpc-host.md) | `/sprite-rpc`, `sprite_rpc_host` |

The extensions are separate manifest resources. Each feature module initializes configuration and session cleanup independently, so package filters can disable modules that a project does not need. Keep `core.ts` enabled for native tool routing and interactive Sprite selection; the other modules can target a Sprite declared in configuration without loading core. Checkpoints additionally support Pi running inside a Sprite through `sprite-env`.

See the [extension guide](./docs/README.md) for prerequisites, configuration, command syntax, model-tool behavior, examples, and safety notes for every module. These are ordinary package documentation files rather than Pi prompt or skill resources, so reading them does not add them to model context.

## Project configuration

Copy [`templates/sprites.json`](./templates/sprites.json) to `.pi/sprites.json` and adjust it for the project. Project configuration overrides `~/.pi/agent/sprites.json`; a machine-local `.pi/sprites.local.json` overrides both. Add the local file to the project's `.gitignore` before putting machine-specific or sensitive values in it.

The major sections are:

- `sprite`, `remoteCwd`, `mode`, `baseURL`, and `tokenEnv` — core selection and authentication.
- `toolActivation` — `auto` (default), `always`, or `off` for LLM-callable `sprite_*` tools.
- `checkpoint` — `off`, `risky`, or once-per-mutating-`turn` checkpointing.
- `bootstrap` — repository, branch, trusted setup commands, services, and a known-good checkpoint.
- `policy` — network, privilege, and memory resource policies.
- `ci` — command, name prefix, and `never`, `on-success`, or `always` cleanup.
- `workers` — pool size, name prefix, optional Pi agent command, and cleanup.
- `rpcHost` — internal port, optional HTTP service port, Pi binary, and bearer-secret environment variable.

Project configuration is ignored until Pi trusts the project, and its shape is validated before use. Bootstrap additionally refuses to execute configured shell commands without active project trust. It uses the project's existing `origin` URL when `bootstrap.repository` is omitted and never uploads an uncommitted local working tree implicitly.

With the default `toolActivation: "auto"`, commands remain available but the eight `sprite_*` LLM tools are inactive while Pi is using local tools. Selecting a Sprite activates the package tools; `/sprite-local` deactivates them again. Set `toolActivation` to `"always"` in trusted configuration when the model should be able to provision CI or workers before a Sprite is selected.

## Checkpoints

The default `risky` mode creates one safety checkpoint before the first write, edit, recognized destructive shell command, or service, policy, or RPC-host model tool in a Pi turn. Those three model tools are conservatively treated as risky even for read-only actions. `turn` applies the same once-per-turn checkpoint before any tool call; `off` disables automatic checkpoints.

Restore remains command-only and requires confirmation. Checkpoints contain the filesystem, installed packages, configuration, and on-disk databases. They do not contain running processes, memory, or open connections.

Checkpoint deletion and filesystem diffs are intentionally not implemented because the installed public JavaScript SDK does not expose stable APIs for them. The package does not reach through SDK internals or assume a private checkpoint mount layout.

## Services and networking

Use Sprite services for dev servers, databases, agents, and daemons that should restart after a crash or cold wake. Use `/sprite-proxy <remote-port> [local-port]` for local-only TCP access.

Network policy is unrestricted when it has no rules. A good development baseline is:

```json
{ "rules": [{ "include": "defaults" }] }
```

Use the bundled `sprite-api-gateway` skill for credential-brokered calls to GitHub, OpenRouter, and custom APIs. Gateway calls must execute inside a Sprite.

## CI and workers

`/sprite-ci` provisions a branch-scoped environment, bootstraps it, runs the configured command, and retains it by default. A failed run captures a diagnostic checkpoint. CI and bootstrap use explicit Sprite handles and never change the user's selected routing target.

`/sprite-workers shell "npm test" "npm run lint"` runs independent commands concurrently. Agent mode sends each task over stdin to `workers.agentCommand`:

```json
{
  "workers": {
    "count": 3,
    "agentCommand": "pi -p --no-session",
    "cleanup": "never"
  }
}
```

Model access must already be configured inside worker Sprites. Workers do not share uncommitted filesystem changes. Worker orchestration keeps an explicit handle and working directory for each worker, so concurrent Pi tools continue targeting the user's selected Sprite.

## Durable Pi RPC host

```text
/sprite-rpc install
/sprite-rpc proxy
```

This installs Pi as a Sprite service and exposes it locally through a TCP proxy. The host provides:

- `GET /health`
- `POST /rpc`
- `GET /events` as server-sent events

The service is not routed through the Sprite URL by default. When `rpcHost.httpPort` is configured, the secret named by `rpcHost.secretEnv` must be present and requests must send it as `Authorization: Bearer ...`. Configuring the service port does not change the Sprite URL's own `sprite` (authenticated) or `public` access setting.

## Safety defaults

- Sprite destruction and checkpoint restore are command-only and confirmed.
- CI and workers are retained unless cleanup is explicitly configured.
- The RPC host is local-proxy-only unless configured otherwise.
- Public URL access is never enabled automatically.
- Local provider credentials are not copied into Sprites automatically.
- Project setup commands run only from a trusted project's configuration.
- New, resumed, and forked Pi sessions reset transient selection to configured defaults and clear proxies and last-checkpoint state.

Pi packages execute with the user's full permissions. Review package source before installation, just as you would any other Pi extension.

## Development

```bash
npm ci
npm run check
npm run pack:check
```

The package depends on [`@fly/sprites`](https://www.npmjs.com/package/@fly/sprites) for all Sprites transport and API operations, and uses Pi's public extension operation interfaces for native tool routing.

Live tests create real Sprites and require an explicit token:

```bash
SPRITES_TOKEN='...' npm run test:e2e
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the development workflow and [docs/automated-testing.md](./docs/automated-testing.md) for test isolation and cleanup details.

## Community and security

- Use [GitHub Issues](https://github.com/superfly/pi-sprites/issues) for reproducible bugs and focused feature requests.
- Read [SECURITY.md](./SECURITY.md) and report vulnerabilities privately to `security@fly.io`; do not open a public issue.
- Participation is governed by our [Code of Conduct](./CODE_OF_CONDUCT.md).

`pi-sprites` is available under the [MIT License](./LICENSE).
