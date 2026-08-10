# Contributing to pi-sprites

Thanks for helping improve `pi-sprites`. Bug reports, focused feature proposals, documentation fixes, and code contributions are welcome.

## Before opening an issue

- Search existing issues first.
- Use the issue form that best matches the request.
- Include your Pi, Node.js, and `pi-sprites` versions for bugs.
- Reduce configuration to the smallest reproducer and remove Sprite names, repository credentials, access tokens, RPC bearer secrets, and other private data.
- Report vulnerabilities according to [SECURITY.md](./SECURITY.md), never in a public issue.

General Sprites platform support belongs in the [Fly.io community](https://community.fly.io/). This repository's issue tracker is for the `pi-sprites` package itself.

## Development setup

Requirements:

- Node.js 24 or later
- npm
- Pi for interactive testing
- A Sprites account and token only when intentionally running live tests

Install the exact locked dependencies and run the local checks:

```bash
npm ci
npm run check
npm run pack:check
```

`npm run check` runs the TypeScript build and unit tests. The live test is gated and skips during the normal suite.

## Live testing

Live testing creates real Sprites in the account associated with your token:

```bash
SPRITES_TOKEN='...' npm run test:e2e
```

The test uses a unique `pi-e2e-*` name and a `pi-sprites-e2e` label, cleans up its own environment, and only sweeps older environments matching both markers. Even so, use a test organization when possible and verify cleanup afterward.

Contributors do not need to run live tests before opening a pull request. Maintainer CI runs them only after trusted changes reach `main`, never against unmerged pull-request code. See [docs/automated-testing.md](./docs/automated-testing.md) and [docs/manual-test-plan.md](./docs/manual-test-plan.md).

## Project structure

- `extensions/`: thin Pi command, tool, flag, and lifecycle integrations.
- `src/`: shared runtime and feature implementation.
- `skills/` and `prompts/`: resources loaded by Pi.
- `runtime/`: code installed inside a Sprite by the RPC-host extension.
- `templates/`: example project configuration.
- `test/`: deterministic unit tests and gated live coverage.
- `docs/`: user and maintainer documentation.

Keep shared behavior in `src/` so slash commands, model tools, and tests exercise the same implementation. Extensions are evaluated with separate module caches, so shared session state must continue to use the versioned runtime singleton and must reset on Pi lifecycle events.

## Security invariants

Changes must preserve these properties:

- Project configuration and bootstrap commands are honored only for trusted projects.
- The local process environment—including `SPRITES_TOKEN`—is not copied into remote shell commands.
- Bootstrap, CI, and workers use explicit Sprite handles and never repurpose the user's selected routing target.
- Destruction and restore stay behind confirmed user commands.
- Services and RPC endpoints remain private unless the user explicitly configures exposure and authentication.
- Session-scoped selection, checkpoint, and proxy state resets between Pi sessions.

Add a regression test when fixing a bug or changing one of these boundaries.

## Pull requests

Keep pull requests focused and explain user impact, behavior changes, and test coverage. Before requesting review:

```bash
npm run check
npm run pack:check
git diff --check
```

Update the relevant extension guide and `CHANGELOG.md` when behavior visible to users changes. New Pi resources must be declared in `package.json`, included in the npm tarball, and covered by package-manifest tests.

Maintainer release steps are documented in [docs/releasing.md](./docs/releasing.md).
