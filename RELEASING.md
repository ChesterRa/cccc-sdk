# Releasing `cccc-sdk`

This repo is a monorepo with three deliverables:
- Python package: `python/` (PyPI name: `cccc-sdk`)
- TypeScript package: `ts/` (npm name: `cccc-sdk`)
- Rust crate: `rust/` (crates.io name: `cccc-sdk`)

## Versioning policy

- SDK version tracks the supported CCCC line: next release `0.4.34`.
- RC sequence is SDK-owned (`0.4.34rcN` for Python, `0.4.34-rc.N` for npm).
- Rust 0.0.1 is published; the next source release is 0.0.2 while its public API settles.
- Compatibility is enforced by contracts/capabilities/op-probing, not by matching RC numbers.

## 0) Sync specs (recommended)

```bash
./scripts/sync_specs_from_cccc.sh ../cccc
./scripts/check_specs_against_cccc.sh ../cccc
# Reproducible audit against a committed core revision:
./scripts/check_specs_against_cccc.sh ../cccc <git-ref>
python3 scripts/check_sdk_hardening.py
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
git tag v0.4.34rcN
git push origin v0.4.34rcN
```

This triggers `.github/workflows/python-publish-testpypi.yml`.

Install check:

```bash
python -m pip install --index-url https://pypi.org/simple \
  --extra-index-url https://test.pypi.org/simple \
  cccc-sdk==0.4.34rcN
```

### Publish stable to PyPI

```bash
git tag v0.4.34
git push origin v0.4.34
```

This triggers `.github/workflows/python-publish.yml`.

## 2) TypeScript release (npm)

### Bump version

Edit `ts/package.json` (`version`).

Examples:
- RC: `0.4.34-rc.N`
- Stable: `0.4.34`

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
cargo clippy --locked --all-targets --all-features -- -D warnings
cargo test --locked --all-targets
cargo +1.74.0 check --locked
cargo package --locked
```

The Rust CI matrix also runs the full suite on Windows and the opt-in reliable
messaging test against the exact native CCCC 0.4.33 daemon.

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
