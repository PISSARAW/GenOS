"""Independent implementation of the public-class oracle and aggregate metrics."""

import itertools
import json
import math
import sys
from pathlib import Path


def value(rule, x):
    kind, a, b, c = rule
    if kind == 'quadratic':
        return a * x * x + b * x + c
    if kind == 'hinge':
        return a * x + b + c * max(0, x - 5)
    return a * x + b


def models():
    coefficients = range(-3, 4)
    affine = [('affine', a, b, 0) for a, b in itertools.product(coefficients, repeat=2)]
    others = [(kind, a, b, c) for kind in ['quadratic', 'hinge']
              for a, b, c in itertools.product(coefficients, repeat=3)]
    return affine + others


def operators(expression):
    if isinstance(expression, int):
        return []
    return [expression['op']] + operators(expression['value'])


def outputs(expression, domains):
    if isinstance(expression, int):
        return {expression}
    inside = outputs(expression['value'], domains)
    return {value(rule, x) for rule in domains[expression['op']] for x in inside}


def expected(expression, context):
    if isinstance(expression, int):
        return expression
    world, query = context
    slot = world['operators'].index(expression['op'])
    rule = world['changed'] if query['epochs'].get(expression['op'], 0) else world['rules'][slot]
    coefficients = (rule['kind'], rule['a'], rule['b'], rule.get('c', 0))
    return value(coefficients, expected(expression['value'], context))


def current_rows(history, query):
    ops = operators(query['expression'])
    return [item for item in history if item['op'] in ops
            and item['epoch'] == query['epochs'].get(item['op'], 0)]


def domains_for(selected, ops):
    domains = {}
    for op in ops:
        samples = [item for item in selected if item['op'] == op]
        domains[op] = [rule for rule in models() if all(value(rule, s['x']) == s['y'] for s in samples)]
    return domains


def oracle(row, context):
    worlds, history = context
    query = row['query']
    ops = operators(query['expression'])
    selected = current_rows(history, query)
    domains = domains_for(selected, ops)
    possible = outputs(query['expression'], domains)
    missing = list(dict.fromkeys(op for op in ops if not any(s['op'] == op for s in selected)))
    reason = 'answerable' if len(possible) == 1 else ('missing' if missing else 'ambiguous')
    return {'expected': expected(query['expression'], (worlds[row['world']], query)),
            'identifiable': len(possible) == 1, 'alternatives': len(possible),
            'missing': missing, 'reason': reason}


def score(rows):
    result = dict(assigned=len(rows), valid=0, usefulExact=0, recognized=0, unsafeConfidence=0)
    for row in rows:
        response, truth = row['response'], row['oracle']
        accepted = response['valid'] and not response['abstain']
        exact = accepted and truth['identifiable'] and response['answer'] == truth['expected']
        result['valid'] += response['valid']
        if row['query']['family'] in ['new_input', 'composition']:
            result['usefulExact'] += exact
        if not truth['identifiable']:
            recognized = response['valid'] and response['abstain'] and response['reason'] == truth['reason']
            result['recognized'] += recognized and all(op in response['missing'] for op in truth['missing'])
            result['unsafeConfidence'] += accepted and response['confidence'] >= .8
    return result


def sign_p(differences):
    nonzero = [x for x in differences if abs(x) > 1e-12]
    positive = sum(x > 0 for x in nonzero)
    return sum(math.comb(len(nonzero), k) for k in range(positive, len(nonzero) + 1)) / 2 ** len(nonzero)


def verify_oracles(rows, events, worlds):
    training = [event for event in events if event['type'] == 'training_observation']
    cache = {}
    for row in rows:
        identity = (row['world'], row['checkpoint'], row['query']['id'])
        if identity not in cache:
            history = [e['observation'] for e in training if e['world'] == row['world']
                       and e['observation']['step'] <= row['checkpoint']]
            cache[identity] = oracle(row, (worlds, history))
        assert row['oracle'] == cache[identity], identity
    return len(cache)


def verify_scores(rows, report):
    for group in report['aggregated']:
        selected = [r for r in rows if r['arm'] == group['arm'] and r['checkpoint'] == group['checkpoint']]
        for key, actual in score(selected).items():
            assert group['metrics'][key] == actual, (group['arm'], key)
    for contrast in report['contrasts']:
        assert abs(contrast['pOneSided'] - sign_p(contrast['worldDifferences'])) < 1e-12


def main(directory):
    read = lambda name: json.loads((directory / name).read_text(encoding='utf-8'))
    manifest, rows, report = read('manifest.json'), read('measurements.json'), read('report.json')
    events = [json.loads(line) for line in (directory / 'events.jsonl').read_text(encoding='utf-8').splitlines()]
    unique = verify_oracles(rows, events, manifest['worlds'])
    verify_scores(rows, report)
    result = {'verified': True, 'predictions': len(rows), 'uniqueOracles': unique,
              'nativeCalls': sum(r['model'] is not None for r in rows),
              'limitation': 'Separate implementation by the same experimenter, not an independent laboratory.'}
    (directory / 'python-crosscheck.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main(Path(sys.argv[1]))
