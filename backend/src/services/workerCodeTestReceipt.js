'use strict';

const crypto = require('crypto');

function emitCodeTestReceipt(mission, proposal, emit) {
  if (!Array.isArray(proposal?.tests) || proposal.tests.length === 0) return;
  const proofs = proposal.tests.map((test) => ({
    command: test.command,
    executed: Number.isInteger(test.exitCode) && test.exitCode >= 0,
    exitCode: test.exitCode,
    digest: crypto.createHash('sha256').update(JSON.stringify({
      command: test.command, exitCode: test.exitCode, stdout: test.stdout || '', stderr: test.stderr || ''
    })).digest('hex')
  }));
  const receipt = require('./codeTestExecutionReceipt').buildReceipt({
    agentId: mission.agentId, missionId: mission.missionId, workspaceRoot: mission.workspaceRoot, proofs
  });
  if (receipt) emit(mission.agentId, receipt.eventType, receipt.action, receipt.detail, receipt.payload, 'info');
}

module.exports = emitCodeTestReceipt;
