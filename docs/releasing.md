# Future npm releases

`pi-sprites` is not currently published to npm, and this repository does not contain an active npm publishing workflow. Users should install directly from GitHub until maintainers announce otherwise.

```bash
pi install git:github.com/superfly/pi-sprites
```

## Deferred setup checklist

When npm publishing becomes available, a package owner should:

1. Make this GitHub repository public.
2. From a clean, reviewed `main` checkout, run `npm ci`, `npm run check`, and `npm run pack:check`.
3. Confirm ownership of the intended unscoped `pi-sprites` npm name and perform the initial public publish through the approved Fly.io npm account.
4. Add a reviewed `.github/workflows/publish.yml` that validates the release tag, runs checks, and invokes `npm publish` with OIDC permissions.
5. In the npm package settings, configure a GitHub Actions trusted publisher with:
   - organization: `superfly`
   - repository: `pi-sprites`
   - workflow filename: `publish.yml`
   - allowed action: `npm publish`
6. Remove or restrict traditional npm automation tokens after the trusted publisher succeeds.

Do not add an `NPM_TOKEN` secret to this repository. Trusted publishing automatically attaches npm provenance when both the repository and package are public.

## Cutting later releases

1. Update `version` in `package.json` and `package-lock.json`.
2. Move the relevant entries from `Unreleased` in `CHANGELOG.md` into a versioned section with the release date.
3. Open and merge a pull request after CI passes.
4. Publish a GitHub release whose tag is exactly `v<package-version>` after the trusted-publishing workflow is configured.

The gated live Sprites test already runs on trusted `main` pushes. A future publish workflow should rely on that result rather than requiring a Sprites credential in the npm release path.
