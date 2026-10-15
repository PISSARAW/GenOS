'use strict';

const assert = require('node:assert/strict');
const dynamicOrganization = require('../src/services/dynamicOrganizationService');
const { packSignalPayload } = require('../src/services/biomimeticSignalingBus');
const { buildTeamAudit } = require('../src/services/aTeam/execution/teamAuditService');

async function main() {
  const original = dynamicOrganization.getStateForMember;
  dynamicOrganization.getStateForMember = async (_db, _orchestratorId, workerId) => ({
    communicationLinks: [{ agentId: workerId === 'worker-a' ? 'worker-b' : 'worker-a',
      role: 'peer', relationship: 'peer', communication: { mode: 'direct' } }]
  });
  const signal = { event: 'coordination_bootstrap_direct', sender_agent_id: 'worker-a' };
  const messages = [{ id: 41, senderAgentId: 'worker-a', recipientAgentId: 'worker-b',
    channel: 'peer_mesh', kind: 'question', content: '', payloadJson: JSON.stringify({ trace: 'audit' }),
    signalType: 'ligand', signalBlob: packSignalPayload('ligand', signal),
    delivery: 'delivered', createdAt: '2026-10-15 10:00:00' }];
  const receipts = [{ messageId: 41, recipientAgentId: 'worker-b', state: 'acknowledged',
    availableAt: 'a', readAt: 'b', acknowledgedAt: 'c' }];
  const db = { all: async (sql) => sql.includes('FROM agent_organization_messages WHERE') ? messages : receipts };
  const run = { missionId: 'mission', members: [
    { workerId: 'worker-a', memberId: 'a', role: 'identity_witness', subSystem: 'identity' },
    { workerId: 'worker-b', memberId: 'b', role: 'peer_mapper', subSystem: 'peer_mapping' }
  ] };
  const observed = { verdicts: new Map([
    ['worker-a', { promoted: true, reason: null, evidenceRefs: ['message:41'], report: { outcome: 'success' } }],
    ['worker-b', { promoted: true, reason: null, evidenceRefs: ['message:41'], report: { outcome: 'success' } }]
  ]) };
  try {
    const audit = await buildTeamAudit(db, run, observed);
    assert.equal(audit.complete, true);
    assert.deepEqual(audit.identities.map((item) => item.workerId), ['worker-a', 'worker-b']);
    assert.equal(audit.relationships[0].peers[0].relationship, 'peer');
    assert.deepEqual(audit.communications[0].signal, signal);
    assert.equal(audit.communications[0].receipts[0].state, 'acknowledged');
    assert.equal(audit.reports[0].report.outcome, 'success');
  } finally {
    dynamicOrganization.getStateForMember = original;
  }
  console.log('A-Team terminal audit exposes identities, relationships, communications and reports.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
