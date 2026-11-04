"""Independent arithmetic and accounting audit of native competence experiments."""
import hashlib
import importlib.util
import json
import shutil
import sys
from pathlib import Path

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location('public_oracle', ROOT / 'benchmarks/competence-five-arms/crosscheck.py')
LEGACY = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(LEGACY)


def read(directory, name):
    return json.loads((directory / name).read_text(encoding='utf-8'))


def digest(value):
    raw = json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode()
    return hashlib.sha256(raw).hexdigest()


def fingerprint(value):
    raw = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()
    return hashlib.sha256(raw).hexdigest()


def audit_runtime(runtime):
    manifest = read(runtime, 'runtime-source-manifest.json')
    assert fingerprint(manifest['sources']) == manifest['sourcesHash']
    binding = {key: manifest[key] for key in ['sourcesHash', 'binaries', 'nodeHash']}
    assert fingerprint(binding) == manifest['runtimeHash']
    for name, expected in {**manifest['sources'], **manifest['binaries']}.items():
        assert hashlib.file_digest((runtime / name).open('rb'), 'sha256').hexdigest() == expected, name
    assert hashlib.file_digest(Path(shutil.which('node')).open('rb'), 'sha256').hexdigest() == manifest['nodeHash']
    return manifest['runtimeHash']


def evaluate(expression, rules):
    if type(expression) is int:
        return expression
    rule = rules[expression['op']]
    coefficients = (rule['kind'], rule['a'], rule['b'], rule.get('c', 0))
    return LEGACY.value(coefficients, evaluate(expression['value'], rules))


def public_reason(samples):
    if not samples:
        return 'missing'
    candidates = [rule for rule in LEGACY.models()
                  if all(LEGACY.value(rule, row['x']) == row['y'] for row in samples)]
    signatures = {tuple(LEGACY.value(rule, x) for x in [-2, -1, 0, 1, 2, 7, 8]) for rule in candidates}
    return 'answerable' if len(signatures) == 1 else 'ambiguous'


def audit_declarations(worker, context):
    rules = worker['rules']
    requested = {(row['op'], row['epoch']) for row in context['requested']}
    assert {(row['op'], row['epoch']) for row in rules} == requested
    assert len(rules) == len(requested)
    for rule in rules:
        samples = [row for row in context['observations']
                   if (row['op'], row['epoch']) == (rule['op'], rule['epoch'])]
        assert rule['reason'] == public_reason(samples)
        if rule['reason'] == 'answerable':
            mapping = {rule['op']: rule}
            assert all(evaluate({'op': rule['op'], 'value': row['x']}, mapping) == row['y'] for row in samples)
        else:
            assert rule['kind'] == 'unknown' and rule['confidence'] == 0
            assert [rule[key] for key in ['a', 'b', 'c']] == [0, 0, 0]


def native_receipts(receipts):
    latest = {row['run']['agent_id']: row for row in receipts['records']
              if row['run']['agent_id'] != receipts['identity']['agentId']}
    workers = list(latest.values())
    measured = receipts['graph']['status'] == 'measured'
    assert len(workers) == 3
    for worker in workers:
        assert worker['run']['status'] == 'completed'
        assert worker['receipt']['result']['verified'] is True
        assert worker['oracle']['status'] == 'accepted_at_decision'
        assert not worker['protocol'].get('error')
    assert measured and receipts['success'] is True
    return workers


def audit_usage(attempts, model):
    assert all(row['status'] != 'started' for row in attempts)
    called = [row for row in attempts if row['provider_called'] == 1]
    assert called
    for row in called:
        assert row['model'] == 'ollama://' + model
        assert row['status'] == 'completed' and row['token_usage_source'] == 'provider'
        assert type(row['input_tokens']) is int and row['input_tokens'] > 0
        assert type(row['output_tokens']) is int and row['output_tokens'] > 0
    return {'calls': len(called), 'inputTokens': sum(row['input_tokens'] for row in called),
            'outputTokens': sum(row['output_tokens'] for row in called)}


def audit_control(directory):
    manifest = read(directory, 'manifest.json')
    data = read(directory, 'private-cases.json')
    result = read(directory, 'control-result.json')
    assert digest(manifest) == result['manifestHash']
    assert audit_runtime(Path(manifest['runtimeRoot'])) == manifest['runtimeHash']
    assert digest(data) == manifest['casesHash']
    assert digest(data['context']) == manifest['contextHash']
    truth = {rule['op']: rule for rule in data['rules']}
    assert len(result['rows']) == 12
    for row, query in zip(result['rows'], data['queries']):
        assert row['query'] == query
        expected = None if query['unknown'] else evaluate(query['expression'], truth)
        assert row['expected'] == expected
        correct = row['response']['abstain'] if query['unknown'] else row['response']['answer'] == expected
        assert row['correct'] == correct and correct
    for worker in result['candidates']['declarations']:
        audit_declarations(worker, data['context'])
    receipts = read(directory / 'induction', 'receipts.json')
    native_receipts(receipts)
    usage = audit_usage(receipts['attempts'], manifest['model']['name'])
    assert len(result['candidates']['declarations']) == 3 and result['passed'] is True
    return {'verified': True, 'control': str(directory), 'manifestHash': digest(manifest),
            'privateOutcomes': len(result['rows']), 'nativeWorkers': 3, 'modelUsage': usage}


def describe_declaration(rule, context):
    samples = [row for row in context['observations']
               if (row['op'], row['epoch']) == (rule['op'], rule['epoch'])]
    expected = public_reason(samples)
    matches = False
    if rule['kind'] in ['affine', 'quadratic', 'hinge']:
        matches = all(evaluate({'op': rule['op'], 'value': row['x']}, {rule['op']: rule}) == row['y']
                      for row in samples)
    return {'op': rule['op'], 'expectedReason': expected, 'declaredReason': rule['reason'],
            'publicSamplesMatch': matches, 'reasonCorrect': rule['reason'] == expected}


def measured_attempt(row):
    return row['status'] == 'completed' and row.get('token_usage_source') == 'provider' \
        and type(row.get('input_tokens')) is int and type(row.get('output_tokens')) is int


def complete_usage(called, known, unresolved):
    return bool(called) and len(called) == len(known) and not unresolved


def total_tokens(rows, field):
    return sum(row[field] for row in rows)


def usage_diagnostics(attempts):
    called = [row for row in attempts if row['provider_called'] == 1]
    known = [row for row in called if measured_attempt(row)]
    unresolved = [row['id'] for row in attempts if row['status'] == 'started']
    return {'recordedProviderCalls': len(called), 'knownUsageCalls': len(known),
            'knownInputTokens': total_tokens(known, 'input_tokens'),
            'knownOutputTokens': total_tokens(known, 'output_tokens'),
            'unmeasuredCalledAttempts': [row['id'] for row in called if not measured_attempt(row)],
            'unresolvedAttempts': unresolved,
            'allUsageMeasured': complete_usage(called, known, unresolved)}


def raw_rules(value):
    if isinstance(value, list):
        return value
    assert isinstance(value, dict)
    for key, rule in value.items():
        assert key == f"{rule['op']}:{rule['epoch']}"
    return list(value.values())


def declaration_coverage(rules, context):
    pairs = [(row['op'], row['epoch']) for row in rules]
    requested = {(row['op'], row['epoch']) for row in context['requested']}
    return {'uniquePairs': len(set(pairs)),
            'duplicatePairs': sorted(set(pair for pair in pairs if pairs.count(pair) > 1)),
            'missingPairs': sorted(requested - set(pairs)),
            'unexpectedPairs': sorted(set(pairs) - requested)}


def describe_history(receipts, context):
    result = []
    for worker in receipts['records']:
        if not worker['reports']:
            continue
        raw = json.loads(worker['reports'][-1]['fullText'])
        rules = raw_rules(raw.get('functionPrograms', {}).get('rules', []))
        receipt = (worker.get('receipt') or {}).get('result', {})
        result.append({'runId': worker['run']['id'], 'workerId': worker['run']['agent_id'],
                       'runStatus': worker['run']['status'], 'oracleStatus': worker['oracle']['status'],
                       'receiptVerified': receipt.get('verified'), 'promotionReason': receipt.get('promotionReason'),
                       'coverage': declaration_coverage(rules, context),
                       'declarations': [describe_declaration(rule, context) for rule in rules]})
    return result


def diagnose_control(directory):
    manifest, data = read(directory, 'manifest.json'), read(directory, 'private-cases.json')
    result = read(directory, 'control-result.json')
    assert digest(manifest) == result['manifestHash']
    assert digest(data) == manifest['casesHash'] and digest(data['context']) == manifest['contextHash']
    assert audit_runtime(Path(manifest['runtimeRoot'])) == manifest['runtimeHash']
    truth = {rule['op']: rule for rule in data['rules']}
    assert len(result['rows']) == len(data['queries']) == 12
    for row, query in zip(result['rows'], data['queries']):
        expected = None if query['unknown'] else evaluate(query['expression'], truth)
        correct = row['response']['abstain'] if query['unknown'] else row['response']['answer'] == expected
        assert row['query'] == query and row['expected'] == expected and row['correct'] == correct
    workers = [{'workerId': worker['workerId'],
                'declarations': [describe_declaration(rule, data['context']) for rule in worker['rules']]}
               for worker in result['candidates']['declarations']]
    receipts = read(directory / 'induction', 'receipts.json')
    usage = usage_diagnostics(receipts['attempts'])
    return {'verifiedAnalysis': True, 'controlPassed': result['passed'],
            'manifestHash': digest(manifest), 'correctOutcomes': sum(row['correct'] for row in result['rows']),
            'outcomes': len(result['rows']), 'graphStatus': receipts['graph']['status'],
            'modelUsage': usage, 'workers': workers, 'proposalHistory': describe_history(receipts, data['context']),
            'note': 'Public arithmetic and private scores checked separately; this diagnosis does not certify a positive control.'}


def audit_journal(directory):
    events = [json.loads(line) for line in (directory / 'events.jsonl').read_text(encoding='utf-8').splitlines()]
    previous = None
    for index, event in enumerate(events):
        item = dict(event)
        sealed = item.pop('hash')
        assert item['index'] == index and item['previous'] == previous
        assert digest(item) == sealed
        previous = sealed
    return events


def audit_checkpoint(directory, event):
    receipts = read(Path(event['receipts']), 'receipts.json')
    native_receipts(receipts)
    for worker in event['candidates']['declarations']:
        audit_declarations(worker, event['context'])
    assert event['runtimePassed'] is True
    return receipts


def audit_study(directory):
    manifest = read(directory, 'manifest.json')
    rows = read(directory, 'measurements.json')
    report = read(directory, 'report.json')
    events = audit_journal(directory)
    assert digest(manifest) == report['manifestHash']
    assert len(rows) == manifest['primaryAssignment'] == 1800
    unique = LEGACY.verify_oracles(rows, events, manifest['worlds'])
    LEGACY.verify_scores(rows, report)
    attempts = {}
    native = 0
    for event in events:
        if event['type'] != 'checkpoint' or not event['receipts']:
            continue
        receipts = audit_checkpoint(directory, event)
        native += 1
        attempts.update({row['id']: row for row in receipts['attempts']})
    usage = audit_usage(list(attempts.values()), manifest['model']['name'])
    assert usage['calls'] == report['modelUsage']['actualProviderCalls']
    assert usage['inputTokens'] == report['modelUsage']['inputTokens']
    assert usage['outputTokens'] == report['modelUsage']['outputTokens']
    assert native == 120
    return {'verified': True, 'predictions': len(rows), 'uniqueOracles': unique,
            'nativeMissions': native, 'modelUsage': usage,
            'limitation': 'Separate implementation by the same experimenter, not an independent laboratory.'}


def main():
    directory = Path(sys.argv[2])
    modes = {'control': audit_control, 'study': audit_study, 'diagnose-control': diagnose_control}
    result = modes[sys.argv[1]](directory)
    result['auditorImplementationHash'] = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    name = 'python-diagnosis.json' if sys.argv[1] == 'diagnose-control' else 'python-crosscheck.json'
    (directory / name).write_text(json.dumps(result, indent=2), encoding='utf-8')
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
