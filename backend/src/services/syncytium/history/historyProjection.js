'use strict';
const projections = require('../sync/projectionMaterializer');
const deltas = require('../sync/deltaRouter');

function domainFor(session, options = {}) {
  if (!options.domainId) return null;
  const domain = session.domains[options.domainId];
  if (!domain) throw Object.assign(new Error('Unknown Syncytium consumer domain.'), { code: 'SYNCYTIUM_DOMAIN_UNKNOWN' });
  return domain;
}

function visible(session, operation, domain) {
  return deltas.route({ operation, schema: session.schema, domains: session.domains }).includes(domain.domainId);
}

function snapshot(session, value, options) {
  const domain = domainFor(session, options);
  const result = structuredClone(value);
  if (!domain) return result;
  if (!result.shared) return projections.projectSnapshot({ snapshot: result, schema: session.schema, domain });
  delete result.crdtState;
  result.shared = projections.projectSnapshot({ snapshot: result.shared, schema: session.schema, domain });
  result.causalFrontier = result.shared.causalFrontier;
  return result;
}

function result(session, value, options) {
  const domain = domainFor(session, options);
  const projected = structuredClone(value);
  if (!domain) return projected;
  if (projected.snapshot) projected.snapshot = snapshot(session, projected.snapshot, options);
  if (projected.replica) {
    delete projected.replica.offlineCrdtState;
    projected.replica.offlineOperations = (projected.replica.offlineOperations || []).filter(item => visible(session, item, domain));
  }
  if (projected.missingOperations) projected.missingOperations = projected.missingOperations.filter(item => visible(session, item, domain));
  return projected;
}

function history(session, options) {
  const domain = domainFor(session, options);
  const operations = session.crdt.getHistory();
  const frontier = session.crdt.getCausalFrontier();
  return { sessionId: session.sessionId,
    operations: domain ? operations.filter(item => visible(session, item, domain)) : operations,
    causalFrontier: domain ? Object.fromEntries(Object.entries(frontier).filter(([actor]) => domain.members.includes(actor))) : frontier,
    compactedOpCount: session.crdt.serialize().compactedOpCount };
}

module.exports = { domainFor, snapshot, result, history };
