'use strict';

const { createCytoplasm } = require('../../syncytiumCytoplasmService');
const { commitMutation } = require('../history/sessionMutation');
const identity = require('../causality/operationIdentity');

async function apply(context) {
  const { sessionId, session, op, options, admission, decision, persist, assessConsistency } = context;
  const flux = { opId: op.opId, ion: op.kind.type.slice('flux_'.length),
    deltaFlux: Number(op.kind.deltaFlux) || 0, agentId: op.agentId, operationDigest: identity.digest(op) };
  const cytoplasm = createCytoplasm();
  for (const previous of session.fluxOps) {
    cytoplasm.propagateIonicFlux(previous.ion, previous.deltaFlux, previous.agentId);
  }
  const ion = cytoplasm.propagateIonicFlux(flux.ion, flux.deltaFlux, flux.agentId);
  const result = { sessionId, ion, schema: session.schema, warnings: admission.warnings,
    consistency: assessConsistency({ ...session, cytoplasm }), coordination: decision, deltaRecipients: [] };
  await commitMutation({ session, changes: { cytoplasm, fluxOps: [...session.fluxOps, flux], pendingOperation: op },
    persist: (value) => persist(options.db, value) });
  return result;
}

function assertDuplicate(session, operation) {
  const previous = session.fluxOps.find(item => item.opId === operation.opId);
  if (!previous) return false;
  identity.assertSame(previous.operationDigest, operation);
  return true;
}

module.exports = { apply, assertDuplicate };
