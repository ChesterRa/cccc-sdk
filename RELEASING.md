# Releasing `cccc-sdk`

This repo is a monorepo with three deliverables:
- Python package: `python/` (PyPI name: `cccc-sdk`)
- TypeScript package: `ts/` (npm name: `cccc-sdk`)
- Rust crate: `rust/` (crates.io name: `cccc-sdk`)

## Versioning policy

- SDK version tracks the supported CCCC line: currently `0.4.33`.
- RC sequence is SDK-owned (`0.4.33rcN` for Python, `0.4.33-rc.N` for npm).
- The Rust crate begins at `0.0.1` while its public API settles.
- Compatibility is enforced by contracts/capabilities/op-probing, not by matching RC numbers.

## 0) Sync specs (recommended)

```bash
./scripts/sync_specs_from_cccc.sh ../cccc
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

```bash
git tag v0.4.33rcN
git push origin v0.4.33rcN
```

This triggers `.github/workflows/python-publish-testpypi.yml`.

Install check:

```bash
python -m pip install --index-url https://pypi.org/simple \
  --extra-index-url https://test.pypi.org/simple \
  cccc-sdk==0.4.33rcN
```

### Publish stable to PyPI

```bash
git tag v0.4.33
git push origin v0.4.33
```

This triggers `.github/workflows/python-publish.yml`.

## 2) TypeScript release (npm)

### Bump version

Edit `ts/package.json` (`version`).

Examples:
- RC: `0.4.33-rc.N`
- Stable: `0.4.33`

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
