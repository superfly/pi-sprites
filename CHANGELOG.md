# Changelog

Notable user-visible changes to `pi-sprites` are recorded here. The project follows [Semantic Versioning](https://semver.org/) after publication, with the usual allowance for breaking changes during the initial `0.x` series.

## Unreleased

### Added

- Core Sprite selection and native Pi tool routing.
- Checkpoints, services, policies, reproducible bootstrap, retained CI, worker pools, and a durable Pi RPC host.
- Package skills, prompt templates, extension guides, unit coverage, and gated live end-to-end tests.

### Security

- Project configuration and setup commands require Pi project trust.
- CI and worker orchestration use explicit Sprite handles instead of mutating user selection.
- Remote shell execution does not copy the local Pi process environment into a Sprite.
