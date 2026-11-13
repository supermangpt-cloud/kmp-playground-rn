#!/usr/bin/env python3
"""Inject the machine's HarmonyOS signing material into harmony/build-profile.json5.

The signing material (certificate, provisioning profile, keystore and their
encrypted passwords) is deliberately kept out of git: it is bound to this
machine and to the app's bundle name. The committed build-profile.json5 keeps
`"signingConfigs": []`; this script replaces that placeholder for the duration
of a build. Run it on a fresh checkout too, then revert the file before
committing (the HarmonyOS job is not wired in CI yet).

Prerequisite, generated once with DevEco Studio or:

    cd harmony && devecocli signature generate

Then save the generated block as ~/.ohos/dsh-signing-rn.json5, for example:

    python3 -c "import re,pathlib; \
s=pathlib.Path('harmony/build-profile.json5').read_text(); \
b=re.search(r'(    signingConfigs: \\[.*?\\n    \\],)', s, re.S).group(1); \
pathlib.Path.home().joinpath('.ohos/dsh-signing-rn.json5').write_text(b + '\\n')"

Usage, from the repository root:

    python3 scripts/inject-signing.py

Set DSH_SIGNING_PROFILE to use a different local file.
"""
from __future__ import annotations

import os
import pathlib
import sys

REPO = pathlib.Path(__file__).resolve().parent.parent
PROFILE = REPO / "harmony" / "build-profile.json5"
DEFAULT_LOCAL = pathlib.Path.home() / ".ohos" / "dsh-signing-rn.json5"
EMPTY = '    "signingConfigs": [],'


def main() -> int:
    local = pathlib.Path(os.environ.get("DSH_SIGNING_PROFILE", DEFAULT_LOCAL))
    if not local.is_file():
        print(
            f"error: {local} is missing.\n"
            "Generate signing once with `cd harmony && devecocli signature generate`, "
            "then save its signingConfigs block there.",
            file=sys.stderr,
        )
        return 1

    block = local.read_text().rstrip("\n")
    text = PROFILE.read_text()
    if EMPTY not in text:
        print(
            f"error: {PROFILE} has no '{EMPTY}' placeholder to replace",
            file=sys.stderr,
        )
        return 1

    PROFILE.write_text(text.replace(EMPTY, block, 1))
    print(f"injected signing material from {local}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
