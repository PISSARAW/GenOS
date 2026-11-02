'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { digest } = require('../../src/services/evidenceProtocol/canonical');
const { createMessage } = require('../../src/services/continuityProtocol/contract');

const CONTEXT = { scope: { organizationId: 'continuity-demo', projectId: 'migration' },
  missionId: 'mission-demo', branchId: 'branch-main' };
const SOURCE = { agentId: 'agent-alpha', incarnationId: 'old-incarnation', trustDomain: 'demo-runtime',
  missionId: CONTEXT.missionId, branchId: CONTEXT.branchId, historyDigest: digest(['genesis', 'old-activation']) };
const SUCCESSOR = { ...SOURCE, incarnationId: 'new-incarnation',
  historyDigest: digest([SOURCE.historyDigest, 'handoff-proposal']) };
const actor = identity => ({ agentId: identity.agentId, incarnationId: identity.incarnationId,
  trustDomain: identity.trustDomain });
const CHECKPOINT = { historyDigest: SOURCE.historyDigest, obligationIds: ['finish-validation'],
  evidenceRefs: ['verified-candidate'], unknownEffectIds: ['remote-operation-unknown'] };
const BUNDLE = { checkpoint: { checkpointId: 'sealed-demo-checkpoint', digest: digest(CHECKPOINT),
  sourceHistoryDigest: SOURCE.historyDigest },
obligations: [{ obligationId: 'finish-validation', owner: actor(SUCCESSOR), evidenceRefs: ['verified-candidate'] }],
evidenceRefs: ['verified-candidate'], permissions: ['protected-note'],
budget: { unit: 'operations', limit: 10, spent: 1, reserved: 2 },
unknownEffects: [{ effectId: 'remote-operation-unknown', owner: actor(SUCCESSOR),
  description: 'Outcome remains unknown after transport interruption', reference: 'remote:operation-1' }] };
const TRANSFER = { ...CONTEXT, transferId: 'demo-transfer', bundleDigest: digest(BUNDLE),
  previousOwner: actor(SOURCE), successor: actor(SUCCESSOR), previousGeneration: 1, newGeneration: 2,
  permissions: BUNDLE.permissions, budget: BUNDLE.budget };

function prepare(directory) {
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'checkpoint.json'), JSON.stringify(CHECKPOINT));
}

function messages() {
  const types = ['OFFER_HANDOFF', 'SEAL_CHECKPOINT', 'ACCEPT_RESPONSIBILITY', 'ACTIVATE_SUCCESSOR'];
  return types.map((type, index) => {
    const successor = index > 1;
    const payload = index === 0 ? { transferId: TRANSFER.transferId, source: SOURCE, successor: SUCCESSOR,
      bundle: BUNDLE, authority: { previousGeneration: 1, newGeneration: 2 } } :
      { transferId: TRANSFER.transferId, bundleDigest: TRANSFER.bundleDigest };
    return createMessage({ messageId: `demo:${type}`, operationId: `demo:${type}`,
      missionId: CONTEXT.missionId, conversationId: 'migration-conversation', type,
      sender: actor(successor ? SUCCESSOR : SOURCE), audience: actor(successor ? SOURCE : SUCCESSOR),
      scope: CONTEXT.scope, causalRefs: index ? [`demo:${types[index - 1]}`] : [],
      generations: { incarnation: successor ? 2 : 1, organization: 1, workspace: 1 },
      authority: { authorityId: 'mission-owner', generation: successor ? 2 : 1 },
      idempotencyKey: `demo:${type}`, createdAt: '2026-11-02T00:00:00.000Z',
      expiresAt: '2099-01-01T00:00:00.000Z', payload });
  });
}

function bootstrap() {
  return { ...CONTEXT, operationId: 'bootstrap', owner: actor(SOURCE), generation: 1,
    permissions: BUNDLE.permissions, budget: { ...BUNDLE.budget, spent: 0 } };
}

module.exports = { CONTEXT, SOURCE, SUCCESSOR, BUNDLE, TRANSFER, actor, prepare, messages, bootstrap };
