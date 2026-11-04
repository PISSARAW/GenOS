"""Independent mathematical audit for typed-plan competence experiments."""

import importlib.util
import json
import math
import re
import sys
from pathlib import Path

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location('original_audit', ROOT / 'benchmarks/competence-five-arms/crosscheck.py')
LEGACY = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(LEGACY)


def integer(value):
    return type(value) in (int, float) and math.isfinite(value) and int(value) == value


def program_valid(program):
    if not isinstance(program, dict):
        return False
    if program.get('kind') not in ('affine', 'quadratic', 'hinge'):
        return False
    if not re.fullmatch(r'op_[a-f0-9]{8}', str(program.get('op', ''))):
        return False
    if not integer(program.get('epoch')) or program['epoch'] not in (0, 1):
        return False
    coefficients = [program.get(key) for key in ('a', 'b', 'c')]
    if not all(integer(x) and abs(x) <= 3 for x in coefficients):
        return False
    return program['kind'] != 'affine' or program['c'] == 0


def plan_valid(value):
    if not isinstance(value, dict) or not isinstance(value.get('programs'), list):
        return False
    if not all(program_valid(program) for program in value['programs']):
        return False
    confidence = value.get('confidence')
    if type(confidence) not in (int, float) or not math.isfinite(confidence):
        return False
    if not 0 <= confidence <= 1 or type(value.get('abstain')) is not bool:
        return False
    if value.get('reason') not in ('answerable', 'missing', 'ambiguous'):
        return False
    return isinstance(value.get('missing'), list) and all(isinstance(x, str) for x in value['missing'])


def evaluate(node, programs):
    if isinstance(node, int):
        return node
    rule = programs[node['op']]
    coefficients = (rule['kind'], rule['a'], rule['b'], rule['c'])
    return LEGACY.value(coefficients, evaluate(node['value'], programs))


def audit_attempt(attempt, protocol):
    try:
        value = json.loads(attempt.get('raw'))
    except (ValueError, TypeError):
        value = None
    assert value == attempt['value']
    assert attempt['valid'] == plan_valid(value)
    return (attempt.get('model') == protocol['model']
            and integer(attempt.get('inputTokens')) and 0 < attempt['inputTokens'] <= protocol['maximumInputTokens']
            and integer(attempt.get('outputTokens')) and 0 <= attempt['outputTokens'] <= protocol['maximumOutputTokens'])


def audit_native(rows, context):
    protocol, report = context
    calls = 0
    queries = 0
    for row in rows:
        assert row['payload']['providedRules'] == []
        if row['model'] is None:
            continue
        queries += 1
        attempts = row['model']['attempts']
        assert 1 <= len(attempts) <= 2
        calls += len(attempts)
        budgets = [audit_attempt(attempt, protocol) for attempt in attempts]
        assert row['budgetVerified'] == all(budgets)
        assert row['model']['value'] == attempts[-1]['value']
        assert row['model']['valid'] == attempts[-1]['valid']
        assert row['model']['inputTokens'] == sum(x.get('inputTokens') or 0 for x in attempts)
        assert row['model']['outputTokens'] == sum(x.get('outputTokens') or 0 for x in attempts)
    assert calls == report['modelCalls']
    assert queries == protocol['nativeQueries']
    return queries, calls


def audit_execution(row):
    if row['response']['source'] != 'validated_model_program':
        return False
    programs = row['model']['value']['programs']
    mapping = {rule['op']: rule for rule in programs}
    query = row['query']
    ops = set(LEGACY.operators(query['expression']))
    assert set(mapping) == ops and len(mapping) == len(programs)
    for op in ops:
        assert mapping[op]['epoch'] == query['epochs'].get(op, 0)
        samples = [s for s in row['payload']['observations'] if s['op'] == op and s['epoch'] == mapping[op]['epoch']]
        assert len({s['x'] for s in samples}) >= 3
        assert all(evaluate({'op': op, 'value': s['x']}, mapping) == s['y'] for s in samples)
    assert evaluate(query['expression'], mapping) == row['response']['answer']
    return True


def audit_positive(directory):
    rows = [json.loads(line) for line in (directory / 'responses.jsonl').read_text(encoding='utf-8').splitlines()]
    assert len(rows) == 16
    for row in rows:
        item = row['item']
        truth = {rule['op']: rule for rule in item['truthPrograms']}
        model = {rule['op']: rule for rule in row['model']['value']['programs']}
        assert evaluate(item['payload']['query']['expression'], truth) == item['expected']
        assert evaluate(item['payload']['query']['expression'], model) == item['expected']
        assert row['correct']
    return len(rows)


def main(directory):
    read = lambda name: json.loads((directory / name).read_text(encoding='utf-8'))
    manifest, rows, report = read('manifest.json'), read('measurements.json'), read('report.json')
    events = [json.loads(line) for line in (directory / 'events.jsonl').read_text(encoding='utf-8').splitlines()]
    oracles = LEGACY.verify_oracles(rows, events, manifest['worlds'])
    LEGACY.verify_scores(rows, report)
    queries, calls = audit_native(rows, (manifest['protocol'], report))
    executed = sum(audit_execution(row) for row in rows)
    controls = audit_positive(Path(manifest['positiveControl']['directory']))
    result = {'verified': True, 'predictions': len(rows), 'uniqueOracles': oracles,
              'nativeQueries': queries, 'actualNativeCalls': calls, 'typedExecutionsChecked': executed,
              'positiveControlsChecked': controls,
              'limitation': 'Independent implementation by the same experimenter, not an independent laboratory.'}
    (directory / 'python-crosscheck-v2.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main(Path(sys.argv[1]))
