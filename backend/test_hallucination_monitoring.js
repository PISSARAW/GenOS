const assert = require('assert');
const { inspectEvent, recordObservation } = require('./src/services/hallucinationMonitoringService');

async function main() {
  assert.deepStrictEqual(inspectEvent({ eventType: 'AGENT_STEP', payload: { claims: [{ statement: 'verified', evidence: ['receipt-1'] }] } }), { detected: false, count: 0, reasons: [] });
  const unsupported = inspectEvent({ eventType: 'AGENT_STEP', payload: { claims: [{ statement: 'unsupported' }] } });
  assert.strictEqual(unsupported.detected, true);
  assert.match(unsupported.reasons[0], /lack evidence/);
  assert.strictEqual(inspectEvent({ payload: { claims: [{ statement: 'one' }, { statement: 'two' }] } }).count, 2);
  const failedProposal = inspectEvent({ eventType: 'AGENT_COMPLETED', payload: { proposal: { proposal: { evidence: 'ran test' }, tests: [{ exitCode: 1 }] } } });
  assert.strictEqual(failedProposal.detected, true);

  const state = { monitoring: 1, count: 0 };
  const db = {
    async get(sql) { return sql.includes('hallucination_monitoring') ? { hallucination_monitoring: state.monitoring } : { hallucination_count: state.count }; },
    async run(_sql, count) { state.count += count; }
  };
  const first = await recordObservation(db, { agentId: 'agent-1', eventType: 'UNVERIFIED_CLAIM', payload: {} });
  assert.strictEqual(first.total, 1);
  const second = await recordObservation(db, { agentId: 'agent-1', eventType: 'AGENT_STEP', payload: { claims: [{ statement: 'missing receipt' }] } });
  assert.strictEqual(second.total, 2);
  state.monitoring = 0;
  const disabled = await recordObservation(db, { agentId: 'agent-1', eventType: 'UNVERIFIED_CLAIM', payload: {} });
  assert.strictEqual(disabled.monitored, false);
  assert.strictEqual(state.count, 2);
  console.log('Hallucination monitoring checks passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
