'use strict';

const { OPERATIONS } = require('./catalog');
const receipts = require('./receiptStore');

const actuators = new Map();
let mandateResolver = null;

function configureGateway(configuration) {
  if (!configuration || typeof configuration.resolveMandate !== 'function') throw coded('GATEWAY_CONFIGURATION_INVALID');
  mandateResolver = configuration.resolveMandate;
}

function registerActuator(operationId, actuator) {
  if (!OPERATIONS[operationId] || !actuator || typeof actuator.inspect !== 'function' || typeof actuator.execute !== 'function') {
    throw coded('ACTUATOR_REGISTRATION_INVALID');
  }
  if (actuators.has(operationId)) throw coded('ACTUATOR_ALREADY_REGISTERED');
  actuators.set(operationId, actuator);
}

function listOperations() {
  return Object.entries(OPERATIONS).map(([id, item]) => ({ id, risk: item.risk, effect: item.effect, targetKind: item.targetKind,
    executable: item.risk !== 'prohibited' && actuators.has(id) }));
}

async function execute(input) {
  const operation = OPERATIONS[input.request.operationId];
  const actuator = actuators.get(input.request.operationId);
  if (typeof input.actor?.id !== 'string' || !input.actor.id) throw coded('IDENTITY_REQUIRED');
  if (operation.risk === 'prohibited') throw coded('OPERATION_PROHIBITED');
  if (!actuator || !mandateResolver) throw coded('GATEWAY_NOT_CONFIGURED');
  await authorizeMandate(input, operation);
  const receiptInput = { scope: `${input.tenant || 'unscoped'}:${input.actor.id}`, key: input.request.idempotencyKey, request: input.request };
  const reservation = await receipts.reserve(receiptInput);
  if (reservation.replay) return reservation.replay;
  if (!reservation.claimed) throw coded(reservation.code);
  let actionStarted = false;
  try {
    const inspected = await inspectCurrent(actuator, input, operation);
    actionStarted = true;
    const result = await actuator.execute({ operationId: input.request.operationId, target: input.request.target,
      parameters: input.request.parameters, currentState: inspected.state, actorId: input.actor.id, mandateId: input.request.mandateId });
    const response = { success: true, operationId: input.request.operationId, target: input.request.target,
      risk: operation.risk, observedStateVersion: inspected.stateVersion, result };
    await receipts.complete({ ...receiptInput, response });
    return response;
  } catch (error) {
    if (!actionStarted) await receipts.release(receiptInput);
    throw error;
  }
}

async function authorizeMandate(input, operation) {
  const mandate = await mandateResolver({ mandateId: input.request.mandateId, tenant: input.tenant, actorId: input.actor.id });
  const allowed = mandate && mandate.status === 'active' && mandate.actorId === input.actor.id
    && mandate.expiresAt > Date.now() && mandate.operations?.includes(input.request.operationId)
    && mandate.targets?.includes(input.request.target);
  if (!allowed) throw coded('MANDATE_INVALID_OR_EXPIRED');
  if (operation.risk === 'high' && mandate.humanApproved !== true) throw coded('HUMAN_APPROVAL_REQUIRED');
}

async function inspectCurrent(actuator, input, operation) {
  const observed = await actuator.inspect({ target: input.request.target, parameters: input.request.parameters });
  if (!observed || observed.stateVersion !== input.request.expectedStateVersion) throw coded('CURRENT_STATE_STALE');
  if (operation.effect === 'write') {
    const rollback = observed.rollback;
    if (rollback?.verifiedBackup !== true || !rollback.backupDigest || rollback.documentedReturnPath !== true
      || typeof actuator.rollback !== 'function') throw coded('VERIFIED_ROLLBACK_REQUIRED');
  }
  if (observed.preconditionsMet !== true) throw coded('PRECONDITIONS_FAILED');
  if (observed.alreadyApplied === true) throw coded('ACTION_ALREADY_APPLIED');
  return observed;
}

function coded(code) {
  return Object.assign(new Error(code), { code });
}

module.exports = { configureGateway, execute, listOperations, registerActuator };
