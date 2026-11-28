import json
import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
FRONTEND = REPO_ROOT / "frontend"

# lucide-react 1.74.0 renamed the `centerline` icon to `axis` (and
# `naira` to `nigerian-naira`). The frontend must stay at or above this
# version so those icon names remain available.
MIN_LUCIDE_VERSION = (1, 74, 0)


def _parse_version(value):
    match = re.search(r"(\d+)\.(\d+)\.(\d+)", value)
    assert match, f"Could not parse a semver version from {value!r}"
    return tuple(int(part) for part in match.groups())


def test_lucide_react_pin_includes_axis_icon_rename():
    package = json.loads((FRONTEND / "package.json").read_text())
    spec = package["dependencies"]["lucide-react"]
    assert _parse_version(spec) >= MIN_LUCIDE_VERSION

    lockfile = json.loads((FRONTEND / "package-lock.json").read_text())
    assert lockfile["packages"][""]["dependencies"]["lucide-react"] == spec

    resolved = lockfile["packages"]["node_modules/lucide-react"]["version"]
    assert _parse_version(resolved) >= MIN_LUCIDE_VERSION
