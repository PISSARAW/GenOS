"""Cross-check the sealed run with a separate, standard-library-only evaluator."""
import json
import math
import sys
from pathlib import Path


def near(observed, expected):
    if expected is None:
        assert observed is None
    else:
        assert math.isclose(observed, expected, abs_tol=1e-10), (observed, expected)


def binomial_lower(successes, n, alpha):
    if successes == 0:
        return 0.0
    left, right = 0.0, 1.0
    for _ in range(90):
        p = (left + right) / 2
        tail = sum(math.comb(n, k) * p ** k * (1 - p) ** (n - k)
                   for k in range(successes, n + 1))
        if tail < alpha:
            left = p
        else:
            right = p
    return (left + right) / 2


def truth(task, world, known):
    node = task['expression']
    chain = []
    while isinstance(node, dict):
        chain.append(node['op'])
        node = node['value']
    missing = set(chain) - known
    if missing:
        return False, None, missing
    value = node
    for operator in reversed(chain):
        rule = world[operator]
        value = rule['a'] * value + rule['b']
    return True, value, missing


def evaluate_row(row, task, context):
    answerable, expected, missing = truth(task, context['world'], context['known'])
    assert row['oracle']['answerable'] == answerable
    assert row['oracle']['expected'] == expected
    response = row['response']
    numeric = isinstance(response['answer'], (int, float)) and not isinstance(response['answer'], bool)
    correct = answerable and numeric and response['answer'] == expected
    assert row['oracle']['numericCorrect'] == correct
    recognized = not answerable and response['abstain'] and response['answer'] is None
    recognized = bool(recognized and missing.issubset(response['missing']))
    assert row['oracle']['recognized'] == recognized
    accepted = row['valid'] and not response['abstain'] and response['confidence'] >= 0.5
    assert row['decision']['abstain'] == (response['abstain'] or response['confidence'] < 0.5)
    return dict(answerable=answerable, correct=correct, recognized=recognized,
                accepted=accepted, success=bool(accepted and correct))


def partition(rows, outcomes):
    known = [r for r in rows if outcomes[r['responseEvent']]['answerable']]
    unknown = [r for r in rows if not outcomes[r['responseEvent']]['answerable']]
    valid_known = [r for r in known if r['valid']]
    answered = [r for r in known if outcomes[r['responseEvent']]['accepted']]
    return known, unknown, valid_known, answered


def outcome_counts(known, unknown, outcomes):
    correct = sum(outcomes[r['responseEvent']]['success'] for r in known)
    recognized = sum(r['valid'] and outcomes[r['responseEvent']]['recognized'] for r in unknown)
    high_confidence_errors = sum(not r['valid'] or r['response']['confidence'] >= 0.8 for r in unknown)
    return correct, recognized, high_confidence_errors


def arm_metrics(rows, outcomes):
    known, unknown, valid_known, answered = partition(rows, outcomes)
    correct, recognized, high_confidence_errors = outcome_counts(known, unknown, outcomes)
    losses = [(r['response']['confidence'] - int(outcomes[r['responseEvent']]['correct'])) ** 2
              for r in valid_known]
    return dict(known_count=len(known), correct=correct, covered=len(answered),
                unknown_count=len(unknown), recognized=recognized, high_confidence_errors=high_confidence_errors,
                valid=len([r for r in rows if r['valid']]), calibration_valid=len(valid_known),
                brier=sum(losses) / len(losses) if losses else None)


def check_arm(observed, metrics, alpha):
    near(observed['knownSuccess'], metrics['correct'] / metrics['known_count'])
    near(observed['knownCoverage'], metrics['covered'] / metrics['known_count'])
    near(observed['calibrationCoverage'], metrics['calibration_valid'] / metrics['known_count'])
    near(observed['brier'], metrics['brier'])
    assert observed['valid'] == metrics['valid']
    for name, count in [('unknownRecognition', metrics['recognized']),
                        ('unknownHighConfidenceError', metrics['high_confidence_errors'])]:
        n = metrics['unknown_count']
        near(observed[name]['lower'], binomial_lower(count, n, alpha))
        near(observed[name]['upper'], 1 - binomial_lower(n - count, n, alpha))


def check_corpus(corpus, rows):
    assert len(corpus['training']) == 100
    assert len(corpus['heldout']) == 160
    assert not {r['id'] for r in corpus['training']} & {r['id'] for r in corpus['heldout']}
    assert len(rows) == 580


def check_transfer(rows, outcomes, report):
    alpha = report['alpha']
    for comparison in report['comparisons']:
        family = comparison['family']
        subset = [r for r in rows if r['phase'] == 'heldout' and r['family'] == family]
        by_key = {(r['taskId'], r['arm']): r for r in subset}
        differences = []
        for item in [r for r in subset if r['arm'] == 'experienced']:
            control = by_key[item['taskId'], comparison['control']]
            differences.append(int(outcomes[item['responseEvent']]['success'])
                               - int(outcomes[control['responseEvent']]['success']))
        gain = sum(differences) / len(differences)
        near(comparison['gain'], gain)
        near(comparison['lower'], max(-1, gain - math.sqrt(2 * math.log(1 / alpha) / len(differences))))


def main(directory):
    root = Path(directory)
    manifest = json.loads((root / 'manifest.json').read_text(encoding='utf-8'))
    report = json.loads((root / 'report.json').read_text(encoding='utf-8'))
    rows = json.loads((root / 'measurements.json').read_text(encoding='utf-8'))
    design = manifest['protocol']
    corpus = manifest['corpus']
    check_corpus(corpus, rows)
    tasks = {r['id']: r for r in corpus['training'] + corpus['heldout']}
    context = dict(world=corpus['world'], known=set(list(corpus['world'])[:4]))
    outcomes = {r['responseEvent']: evaluate_row(r, tasks[r['taskId']], context) for r in rows}
    alpha = design['familywiseAlpha'] / design['simultaneousBounds']
    summaries = {}
    for arm in design['arms']:
        arm_rows = [r for r in rows if r['phase'] == 'heldout' and r['arm'] == arm]
        summaries[arm] = arm_metrics(arm_rows, outcomes)
        check_arm(report['byArm'][arm], summaries[arm], alpha)
    check_transfer(rows, outcomes, dict(alpha=alpha, comparisons=report['transfer']))
    result = dict(verified=True, implementation='Python standard library; iterative oracle and direct binomial sums',
                  checked_rows=len(rows), summaries=summaries,
                  limitation='Second implementation by the same author, not an independent laboratory.')
    (root / 'python-crosscheck.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main(sys.argv[1])
