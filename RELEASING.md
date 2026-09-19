# Releasing `cccc-sdk`

The coordinated stable release has three deliverables: Python (`python/`, PyPI),
TypeScript (`ts/`, npm), and Rust (`rust/`, crates.io). All are named `cccc-sdk`.

## Version and contract policy

All three packages use the supported CCCC release number: **0.4.40** for this
candidate, including Rust's move from 0.0.1. Equal versions do not imply equal
helper coverage; runtime compatibility uses IPC version, capabilities and safe
operation probes, not an exact daemon-version requirement.

Update the three manifests, both lockfiles, and `spec/core.json` together. The
latter records the reviewed core release and immutable revision used by CI.
Review contract changes before copying the standards:

```sh
./scripts/sync_specs_from_cccc.sh ../cccc
./scripts/check_specs_against_cccc.sh ../cccc
python3 scripts/check_release_versions.py
```

The adjacent checkout must match the intended core revision. The version checker
also compares a stable `vX.Y.Z` tag when `GITHUB_REF` is set. Supported-release CI
fails on a mismatch with the pinned standards; nightly upstream-main drift is a
separate maintenance warning and downloadable diff.

## Candidate checks

From the repository root:

```sh
./.venv/bin/python -m unittest discover -s python/tests -p 'test_*.py' -v
./.venv/bin/python -m build python
npm --prefix ts ci
npm --prefix ts test
npm --prefix ts run typecheck
npm --prefix ts run build
(cd ts && npm pack)
cargo fmt --manifest-path rust/Cargo.toml --check
cargo clippy --manifest-path rust/Cargo.toml --all-targets --all-features -- -D warnings
cargo test --manifest-path rust/Cargo.toml --all-targets
cargo package --manifest-path rust/Cargo.toml --locked
```

Inspect the wheel, npm tarball and crate file lists. In a disposable `CCCC_HOME`,
install the candidate wheel and npm tarball into clean consumers, then run
`python/examples/compat_check.py`, `python/examples/release_smoke.py` and
`ts/release-smoke.mjs`. Run the Rust `compat_check` example from the extracted
crate. The integration workflows perform these checks against the pinned core.
They must not run against a user's working daemon.

Before release, verify local Mail/read/reply and file delivery, Connect catalog
and approved remote delivery, duplicate retry keys, context version conflicts,
and compatibility probes that leave configuration unchanged. Linux fixtures do
not establish Windows/macOS or hosted-service acceptance.

## Publish after explicit approval

A commit is not permission to push a tag or publish. Confirm the matching CCCC
release exists, candidate checks pass, and publication is authorized.

- A stable `vX.Y.Z` tag triggers the Python and npm publishing workflows. They
  check coordinated versions and run package tests before publishing. The
  Python workflow requires the `PYPI_API_TOKEN` repository secret.
- npm publishes through npm Trusted Publishing (OIDC): on npmjs.com, package
  `cccc-sdk` → Settings → Trusted Publisher → GitHub Actions with owner
  `ChesterRa`, repository `cccc-sdk`, workflow `ts-publish-npm.yml`, no
  environment. This needs no secret and never expires. The `NPM_TOKEN` secret
  is only a fallback while that publisher is not configured; npm granular
  tokens expire after at most 90 days, so remove the secret once Trusted
  Publishing works rather than rotating it.
- Publish the same Rust version with `cargo publish --manifest-path rust/Cargo.toml
  --locked --registry crates-io`, using the maintainer's crates.io credentials.
- Do not also publish Python/npm manually while their workflows are running.
  Registry versions are immutable; check individual workflow outcomes before
  retrying a partially completed release.

This procedure covers coordinated stable releases. The existing TestPyPI
workflow is separate prerelease tooling, not a required step for 0.4.40.

## Confirm completion

Check all three registries report the approved version. Install that exact
version into clean Python/npm/Rust consumers and repeat the isolated smoke
checks. Update release notes with the publication date only after all three
packages are available. Partial publication is not a completed coordinated
release.
