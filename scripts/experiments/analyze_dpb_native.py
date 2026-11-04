"""Analyse descriptive apres les 90 selections DPB; aucune generation modele."""
import hashlib
import json
import sqlite3
import statistics
import sys
from collections import Counter
from datetime import datetime
from pathlib import Path


def read(filename):
    return json.loads(filename.read_text(encoding='utf-8'))


def optional(filename):
    return read(filename) if filename.exists() else {}


def digest(filename):
    return hashlib.sha256(filename.read_bytes()).hexdigest()


def tool_result(directory):
    result = optional(directory / 'mcp-result.json')
    if result.get('isError'):
        return {'transportReportedError': True}
    blocks = [item['text'] for item in result.get('content', []) if item.get('type') == 'text']
    if len(blocks) != 1:
        return {}
    try:
        return json.loads(blocks[0])
    except ValueError:
        return {'unparsed': True}


def native_journal(records, owner):
    result = {}
    for row in records.get('gvx_development_events', []):
        payload = json.loads(row['payload_json'])
        record = payload.get('record', {})
        if record.get('agentId', record.get('event', {}).get('agentId')) == owner:
            result[payload['kind']] = record
    return result


def persisted_decision(directory, decision):
    if not decision or not (directory / 'runtime.sqlite').exists():
        return False
    uri = (directory / 'runtime.sqlite').resolve().as_uri() + '?mode=ro'
    db = sqlite3.connect(uri, uri=True)
    try:
        row = db.execute('SELECT id, content FROM genome_decisions WHERE id=?', (decision,)).fetchone()
    finally:
        db.close()
    return bool(row and len(json.loads(row[1]).get('evidence', [])) >= 3)


def replay_evidence(journal):
    replay = journal.get('native_oracle_code-replay', {})
    tests = replay.get('tests', [])
    return bool(replay.get('applied') and replay.get('replayVerified') and tests
                and replay.get('stateDigest') == replay.get('liveDigest')
                and all(item.get('exitCode') == 0 for item in tests))


def native_budgets(directory, records):
    result = []
    for row in records.get('mission_protocol_runs', []):
        binding = json.loads(row['binding_json'])
        filename = Path(binding['directory']).resolve() / 'allostasis.sqlite'
        if not filename.is_relative_to(directory.resolve()):
            raise ValueError('Native budget path escaped trial')
        if filename.exists():
            result.extend(read_budget_pools(filename, row['run_id']))
    return result


def read_budget_pools(filename, run_id):
    db = sqlite3.connect(filename.as_uri() + '?mode=ro', uri=True)
    try:
        pools = [json.loads(row[0]) for row in db.execute('SELECT body FROM allostasis_pools')]
    finally:
        db.close()
    return [{'runId': run_id, 'consumed': pool['consumed'], 'held': pool['held'],
             'protectedReserve': pool['protectedReserve']} for pool in pools]


def native_details(directory):
    records = optional(directory / 'native-records.json')
    qualification = optional(directory / 'native-qualification.json')
    owner = optional(directory / 'identity.json').get('orchestratorId')
    journal = native_journal(records, owner)
    event = journal.get('native_oracle_final-code-completion', {}).get('event', {})
    decision = event.get('payload', {}).get('deliveryDecisionId')
    result = tool_result(directory)
    counts = Counter(row['protocol'] for row in records.get('mission_protocol_receipts', []))
    return {'collected': bool(records), 'workerDnaBindings': len(records.get('biological_worker_bindings', [])),
            'gqwfSessions': len(records.get('gqwf_execution_sessions', [])),
            'gqelReceipts': len(records.get('gqel_quality_receipts', [])),
            'rootOracleAccepted': (qualification.get('oracle') or {}).get('status') == 'accepted_at_decision',
            'qualityPassed': qualification.get('qualityPassed') is True,
            'restoredReplayVerified': replay_evidence(journal),
            'deliveryDecisionPersisted': persisted_decision(directory, decision),
            'deliveryDecisionScope': 'provisional retention; references in saved content; no independent promotion authority',
            'completionGateAllowed': result.get('completionGate', {}).get('allowed') is True,
            'requiredCoverageComplete': result.get('coverage', {}).get('verdict') == 'required-coverage-complete',
            'exportHashBound': (qualification.get('binding') or {}).get('matched') is True,
            'nativeAccepted': qualification.get('accepted') is True,
            'observedTools': result.get('coverage', {}).get('protocol', {}).get('observedTools', []),
            'protocolReceipts': dict(counts), 'rootVerdict': qualification.get('verdict'),
            'allostasisPools': native_budgets(directory, records),
            'nativeCalledAttempts': sum(row['provider_called'] for row in records.get('model_attempt_ledger', []))}


def paired(rows, arms):
    grouped = {}
    for row in rows:
        grouped.setdefault((row['task'], row['seed']), {})[row['arm']] = row
    outcomes = Counter()
    for group in grouped.values():
        first, second = (bool(group[arm]['trueFix']) for arm in arms)
        outcomes['both' if first and second else 'first_only' if first else 'second_only' if second else 'neither'] += 1
    return {'arms': arms, 'pairs': len(grouped), 'descriptiveOnly': True, 'outcomes': dict(outcomes)}


def elapsed(row):
    outcome = row['outcome']
    if not outcome.get('startedAt') or not outcome.get('finishedAt'):
        return None
    return (datetime.fromisoformat(outcome['finishedAt'].replace('Z', '+00:00'))
            - datetime.fromisoformat(outcome['startedAt'].replace('Z', '+00:00'))).total_seconds()


def costs(rows, arm):
    selected = [row for row in rows if row['arm'] == arm]
    durations = [value for row in selected if (value := elapsed(row)) is not None]
    return {'arm': arm, 'calls': sum(row['accounting']['calls'] for row in selected),
            'unknownUsageTrials': sum(not row['accounting']['complete'] for row in selected),
            'medianSeconds': statistics.median(durations) if durations else None,
            'totalSeconds': sum(durations),
            'processFailures': sum(row['outcome'].get('exitCode') != 0 for row in selected)}


def terminal_reply(raw):
    try:
        value = json.loads(raw)
    except ValueError:
        try:
            value = json.loads(raw.strip().splitlines()[-1])
        except (ValueError, IndexError):
            return {}
    return value if isinstance(value, dict) else {}


def generation_details(directory, objective):
    filename = directory / 'provider-events.jsonl'
    if not filename.exists():
        return {'dispatches': 0, 'taskDelivered': None}
    events = [json.loads(line) for line in filename.read_text(encoding='utf-8').splitlines()]
    requests = [event['request'] for event in events if event['type'] == 'dispatch']
    replies = [terminal_reply(event['raw']) for event in events if event['type'] == 'response']
    messages = requests[0].get('messages', []) if requests else []
    return {'dispatches': len(requests), **generation_summary(requests, replies, events),
            'taskDelivered': any(objective in message.get('content', '') for message in messages) if requests else None,
            }


def generation_summary(requests, replies, events):
    return {'temperatures': dict(Counter(str(request.get('options', {}).get('temperature')) for request in requests)),
            'finishReasons': dict(Counter(str(reply.get('done_reason')) for reply in replies)),
            'modelDigests': sorted({event['digest'] for event in events if event['type'] == 'model-pin'}, key=str),
            'auxiliaryCalls': sum(event['type'] == 'auxiliary' for event in events)}


def audit_generations(directory, campaign):
    objectives = {task: (directory / 'fixtures' / task / 'task.md').read_text(encoding='utf-8').splitlines()[0]
                  for task in campaign['protocol']['tasks']}
    return {row['id']: generation_details(directory / 'trials' / row['id'], objectives[row['task']])
            for row in campaign['runs']}


def validate_rows(campaign, result):
    expected = {row['id'] for row in campaign['runs']}
    actual = [row['id'] for row in result['rows']]
    if len(actual) != 90 or len(set(actual)) != 90 or set(actual) != expected:
        raise ValueError('Complete unique primary rows required')
    for row in result['rows']:
        if row['trueFix'] != (row['hiddenPassed'] == 8 and row['protectedIntact']):
            raise ValueError('True-fix metric mismatch')
        if row['falseClaim'] != (row['accepted'] and not row['trueFix']):
            raise ValueError('False-claim metric mismatch')


def analyse(directory):
    campaign = read(directory / 'campaign.json')
    if not optional(directory / 'campaign-completion.json').get('runtimeVerifiedAfterCampaign'):
        raise ValueError('Completed sealed runtime verification required')
    result = read(directory / 'summary.json')
    validate_rows(campaign, result)
    details = {row['id']: native_details(directory / 'trials' / row['id'])
               for row in result['rows'] if row['arm'] == 'C'}
    generations = audit_generations(directory, campaign)
    flags = ['rootOracleAccepted', 'qualityPassed', 'restoredReplayVerified', 'deliveryDecisionPersisted',
             'completionGateAllowed', 'requiredCoverageComplete', 'exportHashBound', 'nativeAccepted']
    return {'schema': 'dpb.native-independent-analysis/v1', 'campaignHash': digest(directory / 'campaign.json'),
            'summaryHash': digest(directory / 'summary.json'), 'arms': result['arms'],
            'costs': [costs(result['rows'], arm) for arm in campaign['protocol']['arms']],
            'paired': [paired(result['rows'], arms) for arms in [('A', 'B'), ('B', 'C'), ('A', 'C')]],
            'nativeMechanismCounts': {flag: sum(bool(row[flag]) for row in details.values()) for flag in flags},
            'native': details, 'generations': generations,
            'limitations': ['Three task clusters; repeated seeds are correlated. No inferential p-value.',
                            'Complete treatment comparison; no isolated causal estimate for GQWF.',
                            'Same-model critics: one dependency group. Public oracle is a finite test scope.']}


if __name__ == '__main__':
    target = Path(sys.argv[1]).resolve()
    output = analyse(target)
    (target / 'analysis.json').write_text(json.dumps(output, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    print(json.dumps({key: value for key, value in output.items() if key != 'native'}, indent=2, ensure_ascii=False))
