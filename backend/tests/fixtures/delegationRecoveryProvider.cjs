'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const provider = require('../../src/services/modelProvider');
const discovery = require('../../src/services/localModelDiscovery');
const bounded = require('../../src/services/agents/boundedDelegationAuthority');
let plans = 0; let rejected = false;
const calls = [];
discovery.discoverLocalModels = async () => [{ uri: 'ollama://qwen2.5-coder:7b', chatCapable: true }];
if (process.env.GENOS_TEST_DROP_DELEGATION_RUN === '1') {
  const parent = bounded.parent;
  bounded.parent = (db, agentId) => parent(db, agentId);
}

function report() {
  return { outcome: 'success', claims: [{ statement: 'Fixture inspected.', evidence: ['mission'] }],
    uncertainties: [], scopeCompletion: { scopeRef: 'mission', completedRefs: ['mission'] } };
}

async function probe(db, input) {
  if (plans !== 2) return;
  await assert.rejects(bounded.parent(db, input.agentId), { code: 'EXECUTION_AUTHORITY_RUN_REQUIRED' });
  const prior = await db.get('SELECT id FROM strategy_execution_runs WHERE agent_id=? AND id<>? ORDER BY rowid DESC LIMIT 1', input.agentId, input.runId);
  await assert.rejects(bounded.parent(db, input.agentId, prior.id), { code: 'DELEGATION_PARENT_RUN_TERMINAL' });
  const root = await db.get('SELECT r.id FROM strategy_execution_runs r JOIN agents a ON a.id=? WHERE r.agent_id=a.parent_agent_id LIMIT 1', input.agentId);
  await assert.rejects(bounded.parent(db, input.agentId, root.id), { code: 'EXECUTION_AUTHORITY_RUN_MISMATCH' });
}

function plan() {
  if (plans === 1) return { children: [{ workerKind: 'bounded_worker', mission: 'Inspect sales.csv and cite mission.', modelTokens: 3000, mode: 'analysis', dependsOn: -1 }] };
  return { children: [
    { workerKind: 'bounded_worker', mission: 'Fix parser.py to exclude missing values, run pytest.', modelTokens: 3000, mode: 'code', dependsOn: -1 },
    { workerKind: 'verifier_worker', mission: 'Review the tested candidate and run pytest without edits.', modelTokens: 3000, mode: 'review', dependsOn: 0 }
  ] };
}

function synthesis(prompt) {
  const children = JSON.parse(prompt.split('PERSISTED CHILD EXECUTIONS:\n')[1].split('\nOnly these children ran.')[0]);
  const summaries = children.map(child => ({ childId: child.childId, outcome: child.report?.outcome === 'success' ? 'success' : 'failed', evidence: child.evidence }));
  return { outcome: 'success', claims: [{ statement: 'The persisted children completed their bounded tasks.', evidence: children.flatMap(child => child.evidence) }],
    uncertainties: ['No global promotion or independent semantic decision asserted.'], childSummaries: summaries };
}

function proposal(options) {
  const review = options.responseFormat?.schema?.properties?.format?.const === 'genos.test-only/v1';
  return { format: review ? 'genos.test-only/v1' : 'genos.file-replacement/v1',
    patches: review ? [] : [{ path: 'parser.py', content: 'def parse(lines):\n    return [int(line) for line in lines if line.strip()]\n' }], tests: ['pytest'], evidence: 'mission' };
}

provider.generate = async options => {
  const db = await require('../../src/db').getDatabase();
  const run = await db.get('SELECT id FROM strategy_execution_runs WHERE agent_id=? ORDER BY rowid DESC LIMIT 1', options.agentId);
  let content; let schemaViolation;
  const planning = options.responseFormat?.name === 'genos_local_delegation_plan';
  const merging = options.prompt.includes('PERSISTED CHILD EXECUTIONS:\n');
  if (planning) { plans++; if (process.env.GENOS_TEST_DROP_DELEGATION_RUN !== '1') await probe(db, { agentId: options.agentId, runId: run.id }); content = plan(); }
  else if (merging && !rejected) { rejected = true; content = { outcome: 'unresolved', claims: [], uncertainties: ['Injected first synthesis rejection.'] }; schemaViolation = { error: 'Injected first synthesis rejection.' }; }
  else if (merging) content = synthesis(options.prompt);
  else if (options.responseFormat?.schema?.properties?.patches) content = proposal(options);
  else content = report();
  calls.push({ agentId: options.agentId, runId: run.id, phase: planning ? 'plan' : merging ? 'synthesis' : 'child' });
  fs.writeFileSync(process.env.GENOS_TEST_DELEGATION_CALLS, JSON.stringify(calls));
  return { text: JSON.stringify(content), schemaViolation, inputTokens: 20, outputTokens: 30, tokenUsageMeasured: true };
};
