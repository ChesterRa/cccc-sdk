# Releasing `cccc-sdk`

This repo is a monorepo with three deliverables:
- Python package: `python/` (PyPI name: `cccc-sdk`)
- TypeScript package: `ts/` (npm name: `cccc-sdk`)
- Rust crate: `rust/` (crates.io name: `cccc-sdk`)

## Versioning policy

- SDK version tracks the supported CCCC line, but contract synchronization does
  not choose or modify the next package version.
- RC sequence is SDK-owned (PEP 440 `X.Y.ZrcN` for Python and SemVer
  `X.Y.Z-rc.N` for npm).
- The Rust crate begins at `0.0.1` while its public API settles.
- Compatibility is enforced by contracts/capabilities/op-probing, not by matching RC numbers.

## 0) Sync specs (recommended)

```bash
./scripts/sync_specs_from_cccc.sh ../cccc
./scripts/check_specs_against_cccc.sh ../cccc
```

## 1) Python release (PyPI/TestPyPI)

### Prerequisites

- TestPyPI and PyPI accounts
- Repository secrets in `ChesterRa/cccc-sdk`:
  - `TEST_PYPI_API_TOKEN`
  - `PYPI_API_TOKEN`

### Bump version

Edit `python/pyproject.toml` (`project.version`).

### Local checks

```bash
./.venv/bin/python -m unittest discover -s python/tests -p "test_*.py" -v
./.venv/bin/python -m build python
```

### Publish RC to TestPyPI

Create and push the Python RC tag only after the release version is approved.

This triggers `.github/workflows/python-publish-testpypi.yml`.

Install check:

```bash
python -m pip install --index-url https://pypi.org/simple \
  --extra-index-url https://test.pypi.org/simple \
  cccc-sdk==X.Y.ZrcN
```

### Publish stable to PyPI

Create and push the stable tag only after all three deliverables and the target
CCCC release have passed their release gates.

This triggers `.github/workflows/python-publish.yml`.

## 2) TypeScript release (npm)

### Bump version

Edit `ts/package.json` (`version`).

Examples:
- RC: `X.Y.Z-rc.N`
- Stable: `X.Y.Z`

### Local checks

```bash
cd ts
npm ci
npm test
npm run typecheck
npm run build
```

### Publish RC

```bash
cd ts
npm publish --tag rc --access public
```

### Publish stable

```bash
cd ts
npm publish --access public
```

## 3) Rust release (crates.io)

### Local checks

```bash
cd rust
cargo fmt --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test --all-targets
cargo package --locked
```

### Publish

```bash
cd rust
cargo publish --locked --registry crates-io
```

Published crate versions are immutable. Confirm the package file list and
metadata before running `cargo publish`.

## 4) Post-release sanity

- Run Python compat check against a running daemon:

```bash
python python/examples/compat_check.py
```

- Verify npm package installs and can `import { CCCCClient } from 'cccc-sdk'`.
- Verify `cargo info cccc-sdk --registry crates-io` reports the expected Rust
  crate version and repository.
