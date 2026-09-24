'use strict';

const evaluator = require('../invariants/invariantEvaluator');
const counterfactual = require('../history/counterfactualService');

function rejectionPlan(operation, violations) {
  return {
    strategy: 'REJECT_OPERATION',
    operationId: operation.opId || null,
    invariantIds: violations.map((violation) => violation.invariantId)
  };
}

function propose(session, invariantId) {
  const invariant = session.schema?.invariants?.[invariantId];
  if (!invariant) throw repairError('SYNCYTIUM_INVARIANT_UNKNOWN', `Unknown invariant '${invariantId}'.`);
  const fields = [...new Set([...(invariant.scope || []), ...(invariant.dependencies || [])])];
  if (fields.length !== 1 || session.schema.fields[fields[0]]?.dataType !== 'LEGACY_LWW') return null;
  const path = fields[0];
  const operation = session.crdt.getHistory().filter((item) => item.kind?.key === path).at(-1);
  if (!operation) return null;
  const before = counterfactual.simulate(session, { opId: operation.opId }).simulated.sharedFields;
  if (before[path] === undefined || !evaluator.evaluateAll({ [invariantId]: invariant }, before)[0].passed) return null;
  return {
    strategy: 'RESTORE_PREVIOUS_VALUE',
    invariantId,
    path,
    value: before[path],
    repairsOperationId: operation.opId,
    operation: {
      opId: `repair-${invariantId}-${operation.opId}`,
      actorId: 'syncytium-repair',
      repairOf: operation.opId,
      kind: { type: 'set_field', key: path, value: before[path] }
    }
  };
}

function repairError(code, message) {
  return Object.assign(new Error(message), { code });
}

module.exports = { rejectionPlan, propose };
