"""Guard: frontend lockfile must pin the CVE-fixed zod version (GHSA-mrhx-c7xc-m3w5).

zod is resolved as a transitive peer dependency of eslint-plugin-react-hooks in the
frontend's package-lock.json. The advisory is fixed in zod 4.6.6, so the lockfile
must resolve ``node_modules/zod`` to at least that version.
"""

import json
import os


def _lockfile_path():
    test_dir = os.path.dirname(os.path.abspath(__file__))
    repo_root = os.path.dirname(os.path.dirname(test_dir))
    return os.path.join(repo_root, "frontend", "package-lock.json")


def test_frontend_lockfile_resolves_fixed_zod_version():
    with open(_lockfile_path(), encoding="utf-8") as fh:
        lockfile = json.load(fh)

    zod = lockfile["packages"]["node_modules/zod"]
    # Fail on any zod older than the fixed 4.6.6 release.
    assert zod["version"] >= "4.6.6"
