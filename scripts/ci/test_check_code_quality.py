import tempfile
from pathlib import Path

from check_code_quality import check_file


def check(source: str, suffix: str = '.js') -> list[str]:
    with tempfile.NamedTemporaryFile(suffix=suffix, mode='w', encoding='utf-8', delete=False) as handle:
        handle.write(source)
        path = Path(handle.name)
    try:
        return check_file(path)
    finally:
        path.unlink()


assert not check('const run = value => { return value ? value : 0; };')
assert any('PARAMETERS 4>3' in item for item in check('function run(a, b, c, d) { return d; }'))
assert any('COMPLEXITY 12>10' in item for item in check('function run() { if (a) {} if (b) {} if (c) {} if (d) {} if (e) {} if (f) {} if (g) {} if (h) {} if (i) {} if (j) {} if (k) {} }'))
assert not check('def run(value):\n    return value\n', '.py')
assert any('PARAMETERS 4>3' in item for item in check('fn run(a: i32, b: i32, c: i32, d: i32) {}', '.rs'))