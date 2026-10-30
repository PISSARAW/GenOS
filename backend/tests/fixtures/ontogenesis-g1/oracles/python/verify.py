"""Independent, quiet acceptance oracle for one Python G1 mission."""

import importlib.util
import pathlib
import re
import sys


def function_body(source, name):
    lines = source.splitlines()
    start = next((index for index, line in enumerate(lines) if re.match(rf"^def\s+{name}\s*\(", line)), None)
    if start is None:
        return ""
    end = next((index for index in range(start + 1, len(lines))
                if lines[index] and not lines[index][0].isspace()), len(lines))
    return "\n".join(lines[start:end])


def main():
    case_id = sys.argv[1]
    root = pathlib.Path.cwd().resolve()
    source_path = root / "metrics.py"
    source = source_path.read_text(encoding="utf-8")
    spec = importlib.util.spec_from_file_location("g1_metrics_candidate", source_path)
    api = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(api)

    if case_id == "average-empty":
        assert api.average([]) is None
        assert api.average([2, 4]) == 3
    elif case_id == "percentile-boundary":
        values = [4, 1, 3, 2]
        assert api.percentile(values, 0) == 1
        assert api.percentile(values, 50) == 3
        assert api.percentile(values, 100) == 4
        assert values == [4, 1, 3, 2]
    elif case_id == "median":
        values = [4, 1, 3, 2]
        assert api.median([3, 1, 2]) == 2
        assert api.median(values) == 2.5
        assert api.median([]) is None
        assert values == [4, 1, 3, 2]
    elif case_id == "filter-above":
        values = [3, 1, 4, 2, 4]
        assert api.filter_above(values, 3) == [4, 4]
        assert values == [3, 1, 4, 2, 4]
    elif case_id == "api-reference":
        readme = (root / "README.md").read_text(encoding="utf-8").lower()
        assert all(term in readme for term in ("average", "percentile", "summary", "median", "filter_above", "empty"))
    elif case_id == "boundary-examples":
        readme = re.sub(r"\s+", " ", (root / "README.md").read_text(encoding="utf-8"))
        assert re.search(r"percentile\s*\(\s*\[\s*1\s*,\s*2\s*,\s*3\s*,\s*4\s*\]\s*,\s*0\s*\)", readme, re.I)
        assert re.search(r"percentile\s*\(\s*\[\s*1\s*,\s*2\s*,\s*3\s*,\s*4\s*\]\s*,\s*100\s*\)", readme, re.I)
        assert re.search(r"median\s*\(\s*\[\s*1\s*,\s*2\s*,\s*3\s*\]\s*\)", readme, re.I)
        assert re.search(r"median\s*\(\s*\[\s*1\s*,\s*2\s*,\s*3\s*,\s*4\s*\]\s*\)", readme, re.I)
    elif case_id == "shared-validation":
        helper_names = re.findall(r"^def\s+(_\w+)\s*\(", source, re.M)
        assert any(name + "(" in function_body(source, "average") and name + "(" in function_body(source, "percentile")
                   for name in helper_names)
        for operation in (api.average, api.percentile):
            try:
                operation([1, float("inf")]) if operation is api.average else operation([1, float("inf")], 50)
            except TypeError:
                pass
            else:
                raise AssertionError("non-finite input accepted")
    elif case_id == "summary-helper":
        helper_names = re.findall(r"^def\s+(_\w+)\s*\(", source, re.M)
        assert any(name + "(" in function_body(source, "summary") for name in helper_names)
        assert api.summary([2, 4]) == {"count": 2, "sum": 6, "average": 3, "min": 2, "max": 4}
    else:
        raise ValueError("unknown oracle")
    print("G1 oracle passed")


try:
    main()
except Exception:
    print("G1 oracle failed", file=sys.stderr)
    sys.exit(1)
