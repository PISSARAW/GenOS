#!/usr/bin/env python3
"""Report tracked quality debt separately from local, untracked sources."""
import json
import subprocess
from pathlib import Path

import check_code_quality as quality


def git_lines(root: Path, arguments: list[str]) -> list[str]:
    result = subprocess.run(
        ['git', *arguments], cwd=root, check=True, capture_output=True,
    )
    return [name.decode('utf-8') for name in result.stdout.split(b'\0') if name]


def source_paths(root: Path, names: list[str]) -> list[Path]:
    return [root / name for name in names if quality.is_source(Path(name))]


def inspect_sources(root: Path, names: list[str]) -> dict:
    paths = source_paths(root, names)
    available = [path for path in paths if path.is_file()]
    current = quality.collect_violations(available, root, False)
    return {
        'sourceFiles': len(paths),
        'missingFiles': [path.relative_to(root).as_posix() for path in paths if not path.is_file()],
        'violations': quality.all_violations(current),
        'outsideQualityBaseline': quality.new_violations(current, quality.load_baseline()),
    }


def audit(root: Path) -> dict:
    tracked = git_lines(root, ['ls-files', '-z', '--cached'])
    local = git_lines(root, ['ls-files', '-z', '--others', '--exclude-standard'])
    head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip()
    changed = git_lines(root, ['diff', 'HEAD', '--name-only', '-z'])
    return {
        'schema': 'genos.indicator-baseline/v1',
        'head': head,
        'scope': 'working-tree-tracked-and-local-separated',
        'changedTrackedFiles': changed,
        'tracked': inspect_sources(root, tracked),
        'local': inspect_sources(root, local),
        'limitation': 'Static quality inventory; not runtime or indicator validation.',
    }


def main() -> int:
    report = audit(Path.cwd())
    print(json.dumps(report, ensure_ascii=False, indent=2))
    tracked = report['tracked']
    return int(bool(tracked['outsideQualityBaseline'] or tracked['missingFiles']))


if __name__ == '__main__':
    raise SystemExit(main())
