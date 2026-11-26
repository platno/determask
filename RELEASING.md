# Releasing

Only CI publishes, and only from a version tag whose commit is already on
`main`. `.github/workflows/release.yml` checks the tag against every
package's version, runs `pnpm check` and `pnpm verify:pack`, packs with
pnpm and publishes the tarballs with npm and
[provenance](https://docs.npmjs.com/generating-provenance-statements).
`publishConfig.provenance` is on in every package, so a publish from a
laptop fails instead of shipping a tarball nobody can trace.

All five packages share one version and are released together.

## One-time setup (the owner)

1. **npm organisation.** On npmjs.com, create the organisation `determask`
   (free for public packages); it owns the `@determask` scope. Use an npm
   account with two-factor authentication on.
2. **A GitHub environment.** Repository *Settings → Environments → New
   environment* named `npm`. Add yourself as a required reviewer, so each
   publish waits for your approval. Under *Deployment branches and tags*,
   allow tags matching `v*` only.
3. **Protect the tags.** *Settings → Rules → Rulesets → New tag ruleset*
   for `v*`: restrict creation, update and deletion to yourself, so nobody
   else can trigger a release.

## The first release (0.1.0-alpha.0): a temporary token

npm's trusted publishing cannot create a package; a package must exist
before a trusted publisher can be attached to it. The first release
therefore uses a short-lived token, deleted right after.

1. On npmjs.com: *Access Tokens → Generate New Token → Granular Access
   Token*. Permissions: *Read and write* on packages, scoped to the
   `determask` organisation; expiry 7 days. It must be allowed to publish
   without a 2FA prompt, which CI cannot answer. npm is retiring tokens that
   bypass 2FA (they lose publish rights around January 2027), so check
   [npm's token docs](https://docs.npmjs.com/about-access-tokens) for the
   current rules before creating it.
2. Add it to the `npm` environment (not the repository) as the secret
   `NPM_TOKEN`.
3. Release as described under *Every release* below.
4. Then move to trusted publishing: for **each** of the five packages, on
   npmjs.com open *Settings → Trusted publisher → GitHub Actions* and
   enter organisation `platno`, repository `determask`, workflow
   `release.yml`, environment `npm`.
5. Delete the token on npmjs.com and the `NPM_TOKEN` secret on GitHub.
   Later releases authenticate with the workflow's OIDC identity; the
   workflow needs no change.

## Every release

1. Open a PR that sets the new version in all five
   `packages/*/package.json` files and moves the `CHANGELOG.md` entry from
   "unreleased" to today's date, listing what merged since the last
   release. Merge it once CI is green.
2. Tag that commit on `main` and push the tag:

   ```sh
   git fetch origin
   git tag -a v0.1.0-alpha.0 -m "v0.1.0-alpha.0" origin/main
   git push origin v0.1.0-alpha.0
   ```

3. In *Actions → Release*, check the run and approve the `npm`
   deployment.
4. Verify:

   ```sh
   npm view @determask/core@alpha version
   mkdir /tmp/dm && cd /tmp/dm && npm init -y >/dev/null
   npm install @determask/core@alpha @determask/pack-core@alpha
   npm audit signatures   # provenance and registry signatures
   ```

   Each package page on npmjs.com shows a provenance section that links
   the commit and the workflow run.
5. Create a GitHub release from the tag, with the changelog entry as its
   text.

A pre-release version (`0.1.0-alpha.0`, `0.2.0-rc.1`) is published under
its identifier as the dist-tag (`alpha`, `rc`), so a plain
`npm install @determask/core` never installs it. A version without a
pre-release part is published as `latest`.

## When something goes wrong

- **A publish failed half-way.** Re-run the workflow. Versions already on
  npm are skipped.
- **A bad version is out.** Do not unpublish. Publish a fixed version and
  deprecate the bad one:
  `npm deprecate @determask/core@0.1.0-alpha.0 "use 0.1.0-alpha.1"`.
- **The tag points at the wrong commit.** The workflow refuses a commit
  that is not on `main`. If the commit is on `main` but wrong, and nothing
  has been published yet, delete the tag (`git push origin :refs/tags/v…`)
  and tag again.
