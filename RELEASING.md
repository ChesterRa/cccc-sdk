# Releasing `cccc-sdk` (Python)

This repo is a monorepo. The Python package lives under `python/`.

## Prerequisites (one-time)

### 1) Create accounts

- Create a TestPyPI account (for RC dry-runs).
- Create a PyPI account (for real releases).
- Enable 2FA on both accounts (recommended).

### 2) Create API tokens

You’ll need **two** tokens:
- one for TestPyPI
- one for PyPI

For the **very first upload** (when the project does not exist yet), TestPyPI/PyPI may only allow an
**account-scoped** token. After the project exists, prefer a **project-scoped** token and revoke the
account-scoped one.

### 3) Configure GitHub Actions secrets

In the GitHub repo `ChesterRa/cccc-sdk`:

`Settings → Secrets and variables → Actions → New repository secret`

Add:
- `TEST_PYPI_API_TOKEN` (from TestPyPI)
- `PYPI_API_TOKEN` (from PyPI)

## Versioning policy

- The SDK version matches **CCCC major/minor**: `0.4.0`.
- Pre-releases use PEP 440: `0.4.0rc1`, `0.4.0rc2`, ...
- RC numbers are **SDK-owned** and do not need to match the daemon’s RC sequence.
- Compatibility is enforced via:
  - `ipc_v` (ping)
  - `capabilities` (ping)
  - op probing (`unknown_op`)

## 0) Sync specs (recommended)

```bash
./scripts/sync_specs_from_cccc.sh ../cccc
```

## 1) Bump version

Edit:
- `python/pyproject.toml` (`project.version`)

## 2) Run local checks

```bash
PYTHONPATH=python/src python -m unittest discover -s python/tests -p "test_*.py" -v
```

Optional build check (requires a venv because many systems are PEP 668 locked):

```bash
python -m venv .venv
. .venv/bin/activate
python -m pip install -U pip build
python -m build python
```

## 3) Publish to TestPyPI (recommended for RCs)

1) Confirm `python/pyproject.toml` version is the one you want to publish.
2) Tag and push (auto publishes to TestPyPI):

```bash
git tag v0.4.0rc1
git push origin v0.4.0rc1
```

This triggers `python-publish-testpypi.yml`.

Install:

```bash
python -m pip install --index-url https://pypi.org/simple \
  --extra-index-url https://test.pypi.org/simple \
  cccc-sdk==0.4.0rc1
```

## 4) Publish to PyPI

1) Confirm `python/pyproject.toml` version is the one you want to publish.
2) Tag and push (recommended):

```bash
git tag v0.4.0
git push origin v0.4.0
```

This triggers `python-publish.yml`.
