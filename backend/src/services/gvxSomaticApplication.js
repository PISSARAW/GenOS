'use strict';

const { appendEvent, listAllEvents } = require('./gvxDevelopmentLedger');

async function applySomaticCandidate(db, input) {
  validateAdapters(input);
  const approval = await input.authorization.authorize({
    action: 'gvx.somatic.apply', candidateHash: input.candidateHash,
    parentHash: input.parentHash, scope: input.scope, entityId: input.entityId
  });
  validateApproval(approval);
  const prior = await findApplication(db, input);
  if (prior) {
    if (prior.parentHash !== input.parentHash || prior.candidateHash !== input.candidateHash) throw appError('GVX_APPLICATION_CONFLICT');
    if ((await findRollback(db, input))?.payload.result.status === 'restored') throw appError('GVX_APPLICATION_ALREADY_ROLLED_BACK');
    return prior;
  }
  const runtimeReceipt = await input.runtime.apply(input.change);
  try {
    validateRuntimeReceipt(runtimeReceipt, input);
    return await appendEvent(db, {
      id: `gvx-application:${input.applicationId}`,
      ...input.scope, entityId: input.entityId, type: 'application_recorded',
      parentHash: input.parentHash, candidateHash: input.candidateHash,
      payload: { kind: 'somatic_application', applicationId: input.applicationId,
        approvalId: approval.approvalId, runtimeReceipt }
    });
  } catch (error) {
    const compensation = await compensate(input, runtimeReceipt);
    throw Object.assign(error, { compensation });
  }
}

async function rollbackSomaticApplication(db, input) {
  validateAdapters(input);
  const application = await findApplication(db, input);
  if (!application) throw appError('GVX_APPLICATION_NOT_FOUND');
  const prior = await findRollback(db, input);
  if (prior?.payload.result.status === 'restored') return prior;
  const approval = await input.authorization.authorize({
    action: 'gvx.somatic.rollback', candidateHash: input.candidateHash,
    parentHash: input.parentHash, scope: input.scope, entityId: input.entityId
  });
  validateApproval(approval);
  const result = await executeRollback(input, application);
  return appendEvent(db, {
    ...input.scope, entityId: input.entityId, type: 'rollback_recorded',
    parentHash: input.parentHash, candidateHash: input.candidateHash,
    payload: { kind: 'somatic_rollback', applicationId: input.applicationId,
      approvalId: approval.approvalId, result }
  });
}

async function findApplication(db, input) {
  const events = await listAllEvents(db, eventScope(input));
  const event = events.find((item) => item.type === 'application_recorded'
    && item.payload.kind === 'somatic_application'
    && item.payload.applicationId === input.applicationId);
  return event || null;
}

async function findRollback(db, input) {
  const events = await listAllEvents(db, eventScope(input));
  return events.reverse().find((item) => item.type === 'rollback_recorded'
    && item.payload.kind === 'somatic_rollback'
    && item.payload.applicationId === input.applicationId) || null;
}

async function executeRollback(input, application) {
  try {
    const result = await input.runtime.rollback(application.payload.runtimeReceipt.rollbackToken);
    if (!result || result.restoredHash !== input.parentHash) throw appError('GVX_ROLLBACK_PARENT_MISMATCH');
    return { status: 'restored', restoredHash: result.restoredHash };
  } catch (error) {
    return { status: 'failed', errorCode: error.code || 'GVX_ROLLBACK_FAILED' };
  }
}

async function compensate(input, receipt) {
  try {
    const approval=await input.authorization.authorize({action:'gvx.somatic.rollback',scope:input.scope,
      entityId:input.entityId,parentHash:input.parentHash,candidateHash:input.candidateHash});
    validateApproval(approval);
    const result=await input.runtime.rollback(receipt?.rollbackToken);
    if(result?.restoredHash!==input.parentHash) throw appError('GVX_COMPENSATION_PARENT_MISMATCH');
    return {status:'restored',restoredHash:result.restoredHash};
  } catch(error) { return {status:'failed',errorCode:error.code||'GVX_COMPENSATION_FAILED'}; }
}

function validateAdapters(input) {
  if (!inputIdentityValid(input) || !inputAdaptersValid(input)) throw appError('GVX_APPLICATION_ADAPTERS_REQUIRED');
}

function inputIdentityValid(input) {
  return Boolean(input && input.scope && input.entityId && input.applicationId
    && /^[a-f0-9]{64}$/.test(input.parentHash || '')
    && /^[a-f0-9]{64}$/.test(input.candidateHash || ''));
}

function inputAdaptersValid(input) {
  return Boolean(input.authorization && typeof input.authorization.authorize === 'function'
    && input.runtime && typeof input.runtime.apply === 'function'
    && typeof input.runtime.rollback === 'function');
}

function eventScope(input) { return { ...input.scope, entityId: input.entityId }; }

function validateApproval(approval) {
  if (!approval || approval.allowed !== true || typeof approval.approvalId !== 'string' || !approval.approvalId.trim()) {
    throw appError('GVX_APPLICATION_NOT_AUTHORIZED');
  }
}

function validateRuntimeReceipt(receipt, input) {
  if (!receipt || receipt.beforeHash !== input.parentHash
      || receipt.afterHash !== input.candidateHash || !receipt.rollbackToken) {
    throw appError('GVX_RUNTIME_RECEIPT_INVALID');
  }
}

function appError(code) { return Object.assign(new Error(code), { code }); }

module.exports = { applySomaticCandidate, rollbackSomaticApplication };
