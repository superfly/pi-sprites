# Releasing pi-sprites

Releases are published from GitHub Actions with npm trusted publishing. The workflow uses short-lived OIDC credentials and stores no long-lived npm write token in GitHub.

## One-time setup

The `pi-sprites` npm name is not yet published. A package owner must claim it with the initial public publish, then configure trusted publishing for subsequent releases:

1. Make this GitHub repository public.
2. From a clean, reviewed `main` checkout, run `npm ci`, `npm run check`, and `npm run pack:check`.
3. Authenticate to the intended Fly.io npm owner account and publish `0.1.0` with `npm publish`. The package's `publishConfig` makes it public.
4. In the npm package settings, configure a GitHub Actions trusted publisher with:
   - organization: `superfly`
   - repository: `pi-sprites`
   - workflow filename: `publish.yml`
   - allowed action: `npm publish`
5. Remove or restrict traditional npm automation tokens after the trusted publisher succeeds.

Do not add an `NPM_TOKEN` secret to this repository. Trusted publishing automatically attaches npm provenance when both the repository and package are public.

## Cutting later releases

1. Update `version` in `package.json` and `package-lock.json`.
2. Move the relevant entries from `Unreleased` in `CHANGELOG.md` into a versioned section with the release date.
3. Open and merge a pull request after CI passes.
4. Publish a GitHub release whose tag is exactly `v<package-version>`.

The [publish workflow](../.github/workflows/publish.yml) verifies that the release tag matches `package.json`, installs the locked dependencies, runs the full local check and package dry run, then calls `npm publish`. npm trusted publishing supplies the short-lived credential and provenance.

The gated live Sprites test runs on the trusted `main` push before release. It is not rerun by the publish workflow so the npm release path needs no Sprites credential.
