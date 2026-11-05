'use strict';
const assert = require('node:assert/strict');
const { terminalFailure } = require('../src/services/aTeamDispatchService');

async function main() {
  const { processFailure, failureText } = await import('../../mcp/processFailure.js');
  const { createToolCallHandler } = await import('../../mcp/toolCallHandler.js');
  const previousLease = process.env.GENOS_MCP_LEASE;
  process.env.GENOS_MCP_LEASE = 'genos_orchestrate';
  try {
    const terminal = { status: 'BLOCKED', accepted: false, teamRunId: 'typed-team',
      completion: { verdict: 'failed', reasons: ['completion_invariant_failed'],
        closureChecks: { requiredWorkers: true, invariants: false } },
      audit: { communications: [{ payload: { apiKey: 'REVIEW_SENTINEL_DO_NOT_PUBLISH' } }] },
      results: [{ report: 'PRIVATE_REPORT_SENTINEL' }], completionInput: { secret: 'PRIVATE_INPUT_SENTINEL' } };
    const refusal = terminalFailure(terminal);
    assert.equal(refusal.exitCode, 2);
    assert.equal(refusal.code, 'A_TEAM_TERMINAL_FAILURE');
    const rejected = processFailure({ code: refusal.exitCode, stderr: refusal.message,
      stdout: JSON.stringify(refusal.stdoutEnvelope) });
    assert.equal(rejected.exitCode, 2);
    const handler = createToolCallHandler({ runOrchestrator: async () => { throw rejected; } });
    const result = await handler({ params: { name: 'genos_orchestrate', arguments: {
      action: 'dispatch_team', background: false, mission: 'Observe a refusal.' } } });
    assert.equal(result.isError, true, 'A structured refusal remains an MCP failure.');
    const body = JSON.parse(result.content[0].text);
    assert.equal(body.success, false);
    assert.equal(body.aTeam.accepted, false);
    assert.deepEqual(body.aTeam.result.completion.reasons, terminal.completion.reasons);
    assert.equal(body.aTeam.result.completion.closureChecks.invariants, false);
    assert.doesNotMatch(JSON.stringify(body), /SENTINEL/);
    assert.equal(body.aTeam.result.audit, undefined);
    const huge = terminalFailure({ ...terminal, completion: {
      reasons: Array(100).fill('completion_invariant_failed'), report: 'PRIVATE_REPORT_SENTINEL' } });
    assert.equal(huge.stdoutEnvelope.aTeam.result.completion.reasons.length, 50);
    assert.equal(huge.stdoutEnvelope.aTeam.result.completion.reasonCount, 100);
    for (const stdout of ['{', 'null', '{}', JSON.stringify({ ...body, success: true }),
      JSON.stringify({ ...body, aTeam: { ...body.aTeam, status: 'completed' } })]) {
      const error = processFailure({ code: 1, stderr: 'infrastructure failure', stdout });
      assert.equal(error.failureEnvelope, undefined);
      assert.match(failureText(error), /Process exited with code 1: infrastructure failure/);
    }
    console.log('A-Team typed terminal refusal preserves nonzero exit, MCP isError and domain details: PASS');
  } finally {
    if (previousLease === undefined) delete process.env.GENOS_MCP_LEASE;
    else process.env.GENOS_MCP_LEASE = previousLease;
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
