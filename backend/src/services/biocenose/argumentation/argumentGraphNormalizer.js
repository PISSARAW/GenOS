'use strict';

const ATTACKS = new Set(['ATTACK', 'REFUTE', 'UNDERCUT', 'COUNTEREXAMPLE']);

function normalize(input) {
  const argumentsList = [...input.arguments];
  const attacks = [];
  const supports = [];
  for (const item of argumentsList) {
    const id = String(item.argumentId || '');
    const claimId = String(item.claimId || item.argument?.claimId || '');
    if (item.relation === 'SUPPORT' && id && claimId) supports.push({ claimId, argumentId: id });
    if (ATTACKS.has(item.relation) && id) attacks.push(...attackEdges(item, argumentsList));
  }
  return { claims: input.claims, arguments: argumentsList, attacks, supports };
}

function attackEdges(item, argumentsList) {
  const id = String(item.argumentId);
  const targetId = item.argument?.targetArgumentId || item.targetArgumentId;
  const claimId = item.argument?.targetClaimId || item.targetClaimId || item.claimId || item.argument?.claimId;
  return targetId ? [{ from: id, to: String(targetId) }] : claimAttackEdges({ id, claimId, argumentsList });
}

function claimAttackEdges(input) {
  return input.argumentsList.filter((item) => item.relation === 'SUPPORT' && item.claimId === input.claimId)
    .map((item) => ({ from: input.id, to: item.argumentId }));
}

module.exports = { normalize };
