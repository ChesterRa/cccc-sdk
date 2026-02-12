# Releasing `cccc-sdk`

This repo is a monorepo with two deliverables:
- Python package: `python/` (PyPI name: `cccc-sdk`)
- TypeScript package: `ts/` (npm name: `cccc-sdk`)

## Versioning policy

- SDK major/minor tracks CCCC: `0.4.0`.
- RC sequence is SDK-owned (`0.4.0rcN` for Python, `0.4.0-rc.N` for npm).
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
```

### Publish RC to TestPyPI

```bash
git tag v0.4.0rcN
git push origin v0.4.0rcN
```

This triggers `.github/workflows/python-publish-testpypi.yml`.

Install check:

```bash
python -m pip install --index-url https://pypi.org/simple \
  --extra-index-url https://test.pypi.org/simple \
  cccc-sdk==0.4.0rcN
```

### Publish stable to PyPI

```bash
git tag v0.4.0
git push origin v0.4.0
```

This triggers `.github/workflows/python-publish.yml`.

## 2) TypeScript release (npm)

### Bump version

Edit `ts/package.json` (`version`).

Examples:
- RC: `0.4.0-rc.N`
- Stable: `0.4.0`

### Local checks

```bash
cd ts
npm ci
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

## 3) Post-release sanity

- Run Python compat check against a running daemon:

```bash
python python/examples/compat_check.py
```

- Verify npm package installs and can `import { CCCCClient } from 'cccc-sdk'`.
