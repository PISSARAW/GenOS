'use strict';

const { normalizeCoordinationLocus } = require('../contracts/coordinationLocus');

function eligibleNodes(session, excluded = []) {
  const excludedIds = new Set(excluded);
  return (session.nodes || []).filter((node) => ['ACTIVE', 'AVAILABLE'].includes(node.state)
    && node.availability?.status !== 'UNAVAILABLE' && !excludedIds.has(node.nodeId));
}

function selectHolder(session, excluded) {
  const candidates = eligibleNodes(session, excluded).sort((left, right) => right.reliability - left.reliability
    || left.cost - right.cost || left.nodeId.localeCompare(right.nodeId));
  if (!candidates.length) throw Object.assign(new Error('No eligible Rhizome node can hold a coordination locus.'), { code: 'RHIZOME_LOCUS_NO_HOLDER' });
  return candidates[0].nodeId;
}

function assign(session, input) {
  const now = Number.isFinite(input.now) ? input.now : Date.now();
  const holderNodeId = input.holderNodeId || selectHolder(session, []);
  const node = eligibleNodes(session).find((item) => item.nodeId === holderNodeId);
  if (!node) throw Object.assign(new Error('Coordination locus holder is not an eligible graph node.'), { code: 'RHIZOME_LOCUS_NO_HOLDER' });
  const locus = normalizeCoordinationLocus({ ...input, holderNodeId, leaseUntil: new Date(now + (input.leaseMs || 60000)).toISOString() });
  if (session.coordinationLoci.some((item) => item.locusId === locus.locusId)) {
    throw Object.assign(new Error(`Coordination locus '${locus.locusId}' already exists.`), { code: 'RHIZOME_LOCUS_EXISTS' });
  }
  session.coordinationLoci.push(locus);
  session.graphVersion += 1;
  return locus;
}

function transfer(session, input) {
  const locus = session.coordinationLoci.find((item) => item.locusId === input.locusId);
  if (!locus) throw Object.assign(new Error(`Unknown coordination locus '${input.locusId}'.`), { code: 'RHIZOME_LOCUS_UNKNOWN' });
  const holderNodeId = input.holderNodeId || selectHolder(session, [locus.holderNodeId]);
  if (!eligibleNodes(session).some((item) => item.nodeId === holderNodeId) || holderNodeId === locus.holderNodeId) {
    throw Object.assign(new Error('Coordination locus transfer target is invalid.'), { code: 'RHIZOME_LOCUS_NO_HOLDER' });
  }
  const now = Number.isFinite(input.now) ? input.now : Date.now();
  Object.assign(locus, { holderNodeId, reason: input.reason || 'temporary transfer', leaseUntil: new Date(now + (input.leaseMs || 60000)).toISOString() });
  session.graphVersion += 1;
  return locus;
}

function drop(session, locusId) {
  const initialSize = session.coordinationLoci.length;
  session.coordinationLoci = session.coordinationLoci.filter((item) => item.locusId !== locusId);
  if (session.coordinationLoci.length === initialSize) return false;
  session.graphVersion += 1;
  return true;
}

function apply(input) {
  if (input.action === 'assign') return assign(input.session, input.locus);
  if (input.action === 'transfer') return transfer(input.session, input.locus);
  if (input.action === 'drop') return drop(input.session, input.locusId);
  throw Object.assign(new Error(`Unknown coordination locus action '${input.action}'.`), { code: 'RHIZOME_LOCUS_ACTION_INVALID' });
}

module.exports = { apply, selectHolder, eligibleNodes };
