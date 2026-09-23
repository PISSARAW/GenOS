#!/usr/bin/env python3
"""GenOS Commit Receipt — verify that files listed in the commit message
are present in the staged diff (local hook) or in the committed diff (CI).

A commit message MAY declare a receipt block:
  [FIX] Example change
  ...
  Receipt:
    backend/src/foo.js
    backend/src/bar.js

If present, every file in Receipt: must appear in the diff and vice versa.
If no Receipt: block exists, the check passes, unless --require-receipt
is given (used by the commit-msg hook for code tags).

Modes:
  commit_receipt.py <commit-msg-file> [--require-receipt]
  commit_receipt.py --sha <commit-sha> [--require-receipt]
"""

import re
import subprocess
import sys


RECEIPT_REQUIRED_TAGS = {"FEAT", "FIX", "EVOLUTION", "REFACTOR"}


def staged_files():
    result = subprocess.run(
        ["git", "diff", "--cached", "--name-only"],
        capture_output=True, text=True, check=True,
    )
    return set(line for line in result.stdout.splitlines() if line)


def committed_files(sha):
    result = subprocess.run(
        ["git", "diff-tree", "--no-commit-id", "--name-only", "-r", sha],
        capture_output=True, text=True, check=True,
    )
    return set(line for line in result.stdout.splitlines() if line)


def committed_message(sha):
    result = subprocess.run(
        ["git", "log", "--format=%B", "-n", "1", sha],
        capture_output=True, text=True, check=True,
    )
    return result.stdout


def parse_receipt(commit_msg):
    """Return list of files declared in a 'Receipt:' block, or None if absent."""
    in_receipt = False
    files = []
    for line in commit_msg.splitlines():
        stripped = line.strip()
        if stripped.lower().startswith("receipt:"):
            in_receipt = True
            continue
        if in_receipt:
            # End block on blank line or new section (non-indented, non-comment)
            if not stripped:
                break
            # Accept "- path", "* path", or bare path
            if stripped.startswith("- ") or stripped.startswith("* "):
                files.append(stripped[2:].strip())
            elif stripped.startswith("#"):
                continue  # comment line
            else:
                files.append(stripped)
    return files if in_receipt else None


def first_tag(commit_msg):
    first = (commit_msg.splitlines() or [""])[0]
    match = re.match(r"^\[([A-Z]+)\]", first.strip())
    return match.group(1) if match else None


def check_receipt(commit_msg, changed, require_receipt):
    declared = parse_receipt(commit_msg)
    if declared is None:
        if require_receipt or first_tag(commit_msg) in RECEIPT_REQUIRED_TAGS:
            tag = first_tag(commit_msg)
            print(
                "❌ [Commit Receipt] Bloc Receipt: manquant. "
                f"Les commits [{tag}] doivent lister exactement les fichiers modifies.",
                file=sys.stderr,
            )
            print("Ajoutez a la fin du message :", file=sys.stderr)
            print("  Receipt:", file=sys.stderr)
            for path in sorted(changed):
                print(f"    {path}", file=sys.stderr)
            return 1
        return 0

    declared_set = set(declared)
    changed_set = set(changed)

    missing = declared_set - changed_set
    extra = changed_set - declared_set

    if missing:
        print("❌ [Commit Receipt] Fichier(s) declare(s) absent(s) du diff:", file=sys.stderr)
        for f in sorted(missing):
            print(f"  - {f}", file=sys.stderr)
    if extra:
        print("❌ [Commit Receipt] Fichier(s) stage(s) non declare(s):", file=sys.stderr)
        for f in sorted(extra):
            print(f"  - {f}", file=sys.stderr)

    if missing or extra:
        print("", file=sys.stderr)
        print("Le message de commit doit lister exactement les fichiers modifies.", file=sys.stderr)
        return 1
    return 0


def main():
    args = sys.argv[1:]
    require_receipt = "--require-receipt" in args
    args = [a for a in args if a != "--require-receipt"]

    if "--sha" in args:
        idx = args.index("--sha")
        try:
            sha = args[idx + 1]
        except IndexError:
            print("Usage: commit_receipt.py --sha <sha> [--require-receipt]", file=sys.stderr)
            return 1
        commit_msg = committed_message(sha)
        changed = committed_files(sha)
        # Merge commits touch many files legitimately: only enforce when
        # the message carries an explicit Receipt: block or a code tag.
        return check_receipt(commit_msg, changed, require_receipt)

    if len(args) < 1:
        print("Usage: commit_receipt.py <commit-msg-file> [--require-receipt]", file=sys.stderr)
        return 1

    with open(args[0], "r", encoding="utf-8") as f:
        commit_msg = f.read()
    return check_receipt(commit_msg, staged_files(), require_receipt)


if __name__ == "__main__":
    sys.exit(main())
