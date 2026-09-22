#!/usr/bin/env python3
"""Synchronise les comptes de roles dans docs/08-philosophie.md depuis le runtime."""

import os
import re
import json

DOC_PATH = os.path.join(os.path.dirname(__file__), '..', 'docs', '08-philosophie.md')
BACKEND_DIR = os.path.join(os.path.dirname(__file__), '..', 'backend')

def get_counts_from_runtime():
    """Lit les comptes depuis conceptDefinitions.js via un import Node minimal."""
    import subprocess
    script = (
        "const { CONCEPT_DEFINITIONS } = require('./src/philosophy/conceptDefinitions');"
        "const c = { core:0, operational:0, analogy:0, lens:0, speculative:0 };"
        "CONCEPT_DEFINITIONS.forEach(x => c[x.role]++);"
        "process.stdout.write(JSON.stringify(c) + '|' + CONCEPT_DEFINITIONS.length);"
    )
    result = subprocess.run(
        ['node', '-e', script],
        capture_output=True, text=True, check=True,
        cwd=BACKEND_DIR,
    )
    parts = result.stdout.strip().split('|')
    return json.loads(parts[0]), int(parts[1])


def main():
    counts, total = get_counts_from_runtime()
    new_str = f"core ({counts['core']}), operational ({counts['operational']}), analogy ({counts['analogy']}), lens ({counts['lens']}), speculative ({counts['speculative']})"

    with open(DOC_PATH, 'r', encoding='utf-8') as f:
        content = f.read()

    # Pattern: **core** (7), **operational** (13), ...
    pattern = r'\*\*core\*\* \(\d+\), \*\*operational\*\* \(\d+\), \*\*analogy\*\* \(\d+\), \*\*lens\*\* \(\d+\), \*\*speculative\*\* \(\d+\)'
    replacement = (
        f"**core** ({counts['core']}), **operational** ({counts['operational']}), "
        f"**analogy** ({counts['analogy']}), **lens** ({counts['lens']}), "
        f"**speculative** ({counts['speculative']})"
    )
    new_content, num = re.subn(pattern, replacement, content)

    if num == 0:
        # Try alternate pattern without bold
        pattern2 = r'core \((\d+)\), operational \((\d+)\), analogy \((\d+)\), lens \((\d+)\), speculative \((\d+)\)'
        new_content, num = re.subn(pattern2, replacement, content)

    if num > 0:
        with open(DOC_PATH, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"Sync OK: {new_str} total={total}")
    else:
        print("Pattern not found in doc.")
        sys.exit(1)


if __name__ == '__main__':
    import sys
    main()
