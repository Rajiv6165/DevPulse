import json
import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
FRONTEND = REPO_ROOT / "frontend"
SRC = FRONTEND / "src"

# lucide-react 1.83.0 removed five lab icons. Any import of these names
# would fail at build time, so the frontend must be on 1.83.0 or newer
# and must not reference the removed icons.
MIN_LUCIDE_VERSION = (1, 83, 0)
REMOVED_ICONS = {
    "BowlChopsticks",
    "Burger",
    "CardCredit",
    "Football",
    "PacManGhost",
}


def _parse_version(value):
    match = re.search(r"(\d+)\.(\d+)\.(\d+)", value)
    assert match, f"Could not parse a semver version from {value!r}"
    return tuple(int(part) for part in match.groups())


def _imported_icon_names(source):
    names = set()
    for match in re.finditer(
        r"import\s*\{([^}]*)\}\s*from\s*['\"]lucide-react['\"]", source
    ):
        for part in match.group(1).split(","):
            name = part.strip().split(" as ")[0].strip()
            if name:
                names.add(name)
    return names


def test_lucide_react_pin_is_at_least_1_83_0():
    package = json.loads((FRONTEND / "package.json").read_text())
    spec = package["dependencies"]["lucide-react"]
    assert _parse_version(spec) >= MIN_LUCIDE_VERSION

    lockfile = json.loads((FRONTEND / "package-lock.json").read_text())
    assert lockfile["packages"][""]["dependencies"]["lucide-react"] == spec

    resolved = lockfile["packages"]["node_modules/lucide-react"]["version"]
    assert _parse_version(resolved) >= MIN_LUCIDE_VERSION


def test_frontend_does_not_import_icons_removed_in_1_83_0():
    imported = set()
    for path in SRC.rglob("*.jsx"):
        imported |= _imported_icon_names(path.read_text())

    assert not (imported & REMOVED_ICONS), (
        "frontend imports icons removed in lucide-react 1.83.0: "
        f"{sorted(imported & REMOVED_ICONS)}"
    )
