"""Separate raw model ignorance from deterministic guards and information available to each arm."""
import hashlib
import importlib.util
import json
import sys
from collections import defaultdict
from functools import lru_cache
from pathlib import Path

sys.dont_write_bytecode = True
SPEC = importlib.util.spec_from_file_location('native_audit', Path(__file__).with_name('crosscheck_native_competence.py'))
AUDIT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(AUDIT)


def operators(expression):
    return [] if type(expression) is int else [expression['op'], *operators(expression['value'])]


@lru_cache(maxsize=None)
def reason_for_samples(samples):
    return AUDIT.public_reason([{'x': x, 'y': y} for x, y in samples])


def context_reason(row, context):
    reasons = []
    for op in set(operators(row['query']['expression'])):
        epoch = row['query']['epochs'].get(op, 0)
        samples = tuple(sorted({(item['x'], item['y']) for item in context['observations']
                                if (item['op'], item['epoch']) == (op, epoch)}))
        reasons.append(reason_for_samples(samples))
    if 'missing' in reasons:
        return 'missing'
    return 'ambiguous' if 'ambiguous' in reasons else 'answerable'


def valid_declaration(rule):
    if not rule:
        return False
    if rule['reason'] == 'answerable':
        return rule['kind'] in ['affine', 'quadratic', 'hinge'] and rule['confidence'] > 0
    return rule['kind'] == 'unknown' and rule['confidence'] == 0 \
        and [rule[key] for key in ['a', 'b', 'c']] == [0, 0, 0]


def declared_reason(declaration):
    rules = declaration['requested']
    if not rules or not all(valid_declaration(rule) for rule in rules):
        return 'invalid'
    reasons = {rule['reason'] for rule in rules}
    if 'missing' in reasons:
        return 'missing'
    return 'ambiguous' if 'ambiguous' in reasons else 'answerable'


def record(group, row, expected):
    declarations = row['nativeDeclarations']
    group['scheduledRoleQueries'] += 3
    group['availableRawWorkerQueries'] += len(declarations)
    group['missingRawRoleQueries'] += max(0, 3 - len(declarations))
    if expected != 'answerable':
        group['scheduledUnknownRoleQueries'] += 3
    for declaration in declarations:
        actual = declared_reason(declaration)
        group['rawLabelsCorrect'] += actual == expected
        group['invalidRawLabels'] += actual == 'invalid'
        if expected != 'answerable':
            group['availableUnknownWorkerQueries'] += 1
            group['unknownRecognized'] += actual == expected
            group['falseAnswerability'] += actual == 'answerable'
        else:
            group['abstentionsDespiteIdentifiability'] += actual in ['missing', 'ambiguous']


def analyze(directory):
    rows = AUDIT.read(directory, 'measurements.json')
    report = AUDIT.read(directory, 'report.json')
    assert len(rows) == report['predictions'] == 1800
    events = AUDIT.audit_journal(directory)
    contexts = {(item['world'], item['arm'], item['checkpoint']): item['context']
                for item in events if item['type'] == 'checkpoint'}
    groups = defaultdict(lambda: defaultdict(int))
    for row in rows:
        if row['arm'] == 'synthesis_only':
            continue
        key = (row['world'], row['arm'], row['checkpoint'])
        expected = context_reason(row, contexts[key])
        record(groups[(row['arm'], row['checkpoint'], 'agent_context')], row, expected)
        world_reason = 'answerable' if row['oracle']['identifiable'] else row['oracle']['reason']
        record(groups[(row['arm'], row['checkpoint'], 'world_public_history')], row, world_reason)
    return [{'arm': arm, 'checkpoint': checkpoint, 'reference': reference, **values}
            for (arm, checkpoint, reference), values in sorted(groups.items())]


def main():
    directory = Path(sys.argv[1])
    result = {'schema': 'genos.native-ignorance-analysis/v1', 'groups': analyze(directory),
              'implementationHash': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
              'limitations': ['Worker query declarations are correlated; independent statistical units remain worlds.',
                              'Confidence sentinels are constrained by the protocol; this is classification of ignorance, not general graded confidence calibration.',
                              'Available raw declarations and missing scheduled roles are reported separately; deterministic guard abstentions do not count as model recognition.']}
    (directory / 'ignorance-analysis.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
