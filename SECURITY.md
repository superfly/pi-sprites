# Security policy

`pi-sprites` routes coding-agent operations into remote environments and can create services, run trusted project setup commands, and manage checkpoints. Please treat potential trust-boundary or credential-handling bugs as security issues.

## Supported versions

Before the first stable release, security fixes are made on `main` and included in the next published `0.x` version. After npm publication begins, only the latest published minor release will receive security fixes unless a release note says otherwise.

## Reporting a vulnerability

Do not open a public issue, discussion, or pull request for a suspected vulnerability. Email [`security@fly.io`](mailto:security@fly.io) with `pi-sprites` in the subject.

Include, when possible:

- the affected version or commit;
- the security boundary you expected;
- a minimal reproducer;
- impact and realistic attack conditions; and
- whether the problem also affects the Sprites API or SDK.

Remove all live access tokens and unrelated customer data. Use a dedicated test Sprite and do not access or modify environments you do not own.

Examples worth reporting privately include local credential leakage into a Sprite, execution of untrusted project configuration, cross-session or cross-Sprite routing, an unexpectedly public RPC or service endpoint, or a confirmation bypass for destructive operations.

We will acknowledge the report, investigate it, and coordinate disclosure appropriate to its severity. This policy does not create a bug-bounty commitment.

For Fly.io infrastructure vulnerabilities outside this package, use the same security contact and see [Fly.io's security guidance](https://fly.io/docs/security/security-at-fly-io/).
