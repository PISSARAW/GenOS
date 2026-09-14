#!/usr/bin/env python3
"""Enforce GenOS source-file size, parameter-count and complexity limits."""
import ast
import json
import re
import subprocess
import sys
from pathlib import Path

MAX_LINES = 400
MAX_PARAMETERS = 3
MAX_COMPLEXITY = 10
DECISION_PATTERN = r'\b(?:if|for|while|case|catch)\b|&&|\|\||\?(?!=)'
SOURCE_EXTENSIONS = {'.cjs', '.js', '.mjs', '.py', '.rs', '.ts', '.tsx'}
EXCLUDED_PARTS = {
    '.genos', '.git', 'build', 'dist', 'node_modules', 'target', 'vendor',
}
BASELINE_PATH = Path(__file__).with_name('quality_baseline.json')


def is_source(path: Path) -> bool:
    return path.suffix.lower() in SOURCE_EXTENSIONS and not any(
        part in EXCLUDED_PARTS or part.startswith('.genos-') or part.startswith('worker-') or part.startswith('worker_') for part in path.parts
    )


def mask_javascript(source: str) -> str:
    pattern = re.compile(r'//[^\n]*|/\*.*?\*/|"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'|`(?:\\.|[^`\\])*`', re.DOTALL)
    return pattern.sub(lambda match: ''.join('\n' if char == '\n' else ' ' for char in match.group()), source)


def matching(text: str, start: int, pair: tuple[str, str]) -> int:
    opening, closing = pair
    depth = 0
    for index in range(start, len(text)):
        if text[index] == opening:
            depth += 1
        elif text[index] == closing:
            depth -= 1
            if depth == 0:
                return index
    return -1


def top_level_count(text: str, separator: str = ',') -> int:
    if not text.strip():
        return 0
    depths = {'(': 0, '[': 0, '{': 0}
    closing = {')': '(', ']': '[', '}': '{'}
    count = 1
    for char in text:
        if char in depths:
            depths[char] += 1
        elif char in closing:
            depths[closing[char]] -= 1
        elif char == separator and not any(depths.values()):
            count += 1
    return count


def line_number(source: str, index: int) -> int:
    return source.count('\n', 0, index) + 1


def function_record(source: str, item: tuple[int, str, str]) -> tuple[int, int, str]:
    start, params, body = item
    return line_number(source, start), top_level_count(params), body


def arrow_functions(source: str, masked: str) -> list[tuple[int, int, str]]:
    records = []
    for match in re.finditer(r'=>', masked):
        end = match.start()
        while end > 0 and masked[end - 1].isspace():
            end -= 1
        open_paren = masked.rfind('(', 0, end) if end and masked[end - 1] == ')' else -1
        params = masked[open_paren + 1:end - 1] if open_paren >= 0 else masked.rsplit('\n', 1)[-1][:end].split(';')[-1].strip()
        body_start = masked.find('{', match.end())
        body_end = matching(masked, body_start, ('{', '}')) if body_start >= 0 else -1
        if body_end >= 0:
            records.append(function_record(source, (match.start(), params, masked[body_start:body_end + 1])))
    return records


def named_functions(source: str, masked: str) -> list[tuple[int, int, str]]:
    records = []
    for match in re.finditer(r'\bfunction\s*[\w$]*\s*\(', masked):
        open_paren = masked.find('(', match.start())
        params_end = matching(masked, open_paren, ('(', ')'))
        body_start = masked.find('{', params_end)
        body_end = matching(masked, body_start, ('{', '}')) if body_start >= 0 else -1
        if params_end >= 0 and body_end >= 0:
            item = (match.start(), masked[open_paren + 1:params_end], masked[body_start:body_end + 1])
            records.append(function_record(source, item))
    return records


def javascript_functions(source: str) -> list[tuple[int, int, str]]:
    masked = mask_javascript(source)
    return named_functions(source, masked) + arrow_functions(source, masked)


def complexity(body: str) -> int:
    decisions = len(re.findall(DECISION_PATTERN, body))
    return 1 + decisions


def python_functions(source: str) -> list[tuple[int, int, str]]:
    tree = ast.parse(source)
    functions = []
    for node in ast.walk(tree):
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        arguments = node.args
        count = len(arguments.posonlyargs) + len(arguments.args) + len(arguments.kwonlyargs)
        if arguments.vararg:
            count += 1
        if arguments.kwarg:
            count += 1
        end_line = max(getattr(child, 'end_lineno', node.lineno) for child in ast.walk(node))
        body = '\n'.join(source.splitlines()[node.lineno - 1:end_line])
        functions.append((node.lineno, count, body))
    return functions


def rust_functions(source: str) -> list[tuple[int, int, str]]:
    masked = re.sub(r'//.*|/\*.*?\*/', '', source, flags=re.DOTALL)
    functions = []
    for match in re.finditer(r'\bfn\s+\w+\s*\(', masked):
        open_paren = masked.find('(', match.start())
        end = matching(masked, open_paren, ('(', ')'))
        body_start = masked.find('{', end)
        body_end = matching(masked, body_start, ('{', '}')) if body_start >= 0 else -1
        if end >= 0 and body_end >= 0:
            functions.append((line_number(source, match.start()), top_level_count(masked[open_paren + 1:end]), masked[body_start:body_end + 1]))
    return functions


def check_file(path: Path, lines_only: bool = False) -> list[str]:
    try:
        source = path.read_text(encoding='utf-8')
        violations = []
        if len(source.splitlines()) > MAX_LINES:
            violations.append(f'LINES {len(source.splitlines())}>{MAX_LINES}')
        if lines_only:
            return violations
        try:
            functions = python_functions(source) if path.suffix == '.py' else rust_functions(source) if path.suffix == '.rs' else javascript_functions(source)
        except (SyntaxError, UnicodeDecodeError) as error:
            return [f'PARSE {error}']
        for line, parameters, body in functions:
            if parameters > MAX_PARAMETERS:
                violations.append(f'PARAMETERS {parameters}>{MAX_PARAMETERS} at line {line}')
            score = complexity(body)
            if score > MAX_COMPLEXITY:
                violations.append(f'COMPLEXITY {score}>{MAX_COMPLEXITY} at line {line}')
        return violations
    except (OSError, UnicodeDecodeError) as error:
        return [f'READ {error}']


def staged_paths(root: Path) -> list[Path]:
    result = subprocess.run(
        ['git', 'diff', '--cached', '--name-only', '--diff-filter=ACMR'],
        cwd=root, check=True, capture_output=True, text=True,
    )
    return [root / line for line in result.stdout.splitlines() if line]


def all_paths(root: Path) -> list[Path]:
    import os
    paths = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in EXCLUDED_PARTS and not d.startswith('.genos-')]
        for filename in filenames:
            p = Path(dirpath) / filename
            if is_source(p):
                paths.append(p)
    return paths


def commit_paths(root: Path) -> list[Path]:
    staged = staged_paths(root)
    return all_paths(root) if any(is_source(path) for path in staged) else []


def load_baseline() -> dict:
    if not BASELINE_PATH.exists():
        return {}
    try:
        return json.loads(BASELINE_PATH.read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return {}


def collect_violations(paths: list[Path], root: Path, lines_only: bool) -> dict:
    current = {}
    for path in sorted(paths):
        violations = check_file(path, lines_only=lines_only)
        if violations:
            key = str(path.relative_to(root)).replace('\\', '/')
            current[key] = violations
    return current


def rule_counts(violations: list[str]) -> dict:
    counts = {}
    for violation in violations:
        rule = violation.split(' ', 1)[0]
        counts[rule] = counts.get(rule, 0) + 1
    return counts


def baseline_snapshot(current: dict) -> dict:
    return {path: rule_counts(violations) for path, violations in current.items()}


def new_violations(current: dict, baseline: dict) -> list[str]:
    reported = []
    for path, violations in current.items():
        allowed = baseline.get(path, {})
        seen = {}
        for violation in violations:
            rule = violation.split(' ', 1)[0]
            seen[rule] = seen.get(rule, 0) + 1
            if seen[rule] > allowed.get(rule, 0):
                reported.append(f'{path}: {violation}')
    return reported


def select_paths(root: Path) -> list[Path]:
    if '--commit' in sys.argv:
        return commit_paths(root)
    if '--staged' in sys.argv:
        return staged_paths(root)
    return all_paths(root)


def main() -> int:
    root = Path.cwd()
    lines_only = '--lines-only' in sys.argv or '--size-only' in sys.argv
    paths = [path for path in select_paths(root) if is_source(path) and path.exists()]
    current = collect_violations(paths, root, lines_only)
    if '--update-baseline' in sys.argv:
        BASELINE_PATH.write_text(json.dumps(baseline_snapshot(current), indent=2, sort_keys=True) + '\n', encoding='utf-8')
        print(f'Quality baseline updated: {sum(len(v) for v in current.values())} violations in {len(current)} files.')
        return 0
    reported = new_violations(current, load_baseline())
    for line in reported:
        print(f'REJECT {line}')
    total = sum(len(violations) for violations in current.values())
    print(f'Quality gate: {len(paths)} source files checked, {total} violations ({len(reported)} new).')
    return 1 if reported else 0


if __name__ == '__main__':
    raise SystemExit(main())