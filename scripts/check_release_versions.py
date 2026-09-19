#!/usr/bin/env python3
"""Keep the three distributed SDKs on the reviewed core release number."""
import json
import os
import re
from pathlib import Path

root = Path(__file__).resolve().parents[1]
expected = json.loads((root / 'spec/core.json').read_text())['version']
versions = {}
for name in ['python/pyproject.toml', 'rust/Cargo.toml']:
    versions[name] = re.search(r'^version = "([^"]+)"', (root / name).read_text(), re.M).group(1)
versions['ts/package.json'] = json.loads((root / 'ts/package.json').read_text())['version']
lock = json.loads((root / 'ts/package-lock.json').read_text())
versions['ts/package-lock.json'] = lock['version']
versions['ts/package-lock.json root package'] = lock['packages']['']['version']
versions['rust/Cargo.lock'] = re.search(r'name = "cccc-sdk"\nversion = "([^"]+)"', (root / 'rust/Cargo.lock').read_text()).group(1)
tag = os.environ.get('GITHUB_REF', '')
if tag.startswith('refs/tags/v'):
    versions['release tag'] = tag.removeprefix('refs/tags/v')
errors = [f'{name}: {value} != {expected}' for name, value in versions.items() if value != expected]
if errors:
    raise SystemExit('\n'.join(errors))
print(f'Python, npm and Rust SDK versions match core {expected}.')
