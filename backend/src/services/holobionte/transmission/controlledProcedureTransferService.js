'use strict';

const { createHash, randomUUID } = require('crypto');
const contracts = require('../contracts/symbiosisContractService');
const memory = require('../memory/symbioticMemoryService');
const store = require('../holobiontStore');

function transferError(message, code = 'HOLOBIONT_PROCEDURE_TRANSFER_INVALID') {
  return Object.assign(new Error(message), { code });
}

function requireText(value, field) {
  const text = String(value || '').trim();
  if (!text) throw transferError(`${field} is required.`);
  return text;
}

function digest(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

async function sourceProcedure(db, input, donor) {
  if (!donor.residentSymbionts.some((item) => item.id === input.donorSymbiontId && item.status === 'RESIDENT')) {
    throw transferError('Procedure donor must be a resident symbiont.', 'HOLOBIONT_DONOR_NOT_RESIDENT');
  }
  const authorization = await contracts.authorizeSymbiontWork(db, {
    holobiontId: donor.holobiontId, symbiontId: input.donorSymbiontId,
    capability: input.capability
  });
  const procedures = await memory.recallMemories(db, {
    holobiontId: donor.holobiontId, memoryType: 'PROCEDURAL'
  });
  const record = procedures.find((item) => item.memoryId === input.procedureMemoryId);
  if (!record || record.content.producerSymbiontId !== input.donorSymbiontId
      || record.content.procedure?.capability !== input.capability) {
    throw transferError('Procedure must have verified memory provenance from the donor symbiont.', 'HOLOBIONT_PROCEDURE_PROVENANCE_INVALID');
  }
  return { authorization, record, procedure: record.content.procedure };
}

function validateSandbox(input, procedure) {
  const receipt = input.sandboxReceipt || {};
  if (receipt.isolated !== true || receipt.passed !== true) {
    throw transferError('Recipient sandbox must report isolated local validation.', 'HOLOBIONT_PROCEDURE_SANDBOX_REQUIRED');
  }
  if (receipt.procedureHash !== digest(procedure)) {
    throw transferError('Sandbox receipt does not match the transferred procedure.', 'HOLOBIONT_PROCEDURE_HASH_MISMATCH');
  }
  if (!Array.isArray(receipt.evidenceRefs) || receipt.evidenceRefs.length === 0) {
    throw transferError('Local validation evidence is required.', 'HOLOBIONT_EVIDENCE_REQUIRED');
  }
  return receipt;
}

async function transferProcedure(db, input = {}) {
  const donor = await store.getSession(db, requireText(input.donorHolobiontId, 'donorHolobiontId'));
  const recipient = await store.getSession(db, requireText(input.recipientHolobiontId, 'recipientHolobiontId'));
  if (!donor || !recipient) throw transferError('Donor or recipient Host not found.', 'HOLOBIONT_SESSION_NOT_FOUND');
  if (donor.hostId === recipient.hostId) throw transferError('Procedure transfer requires distinct Hosts.');
  if (Number(input.expectedRecipientRevision) !== recipient.revision) {
    throw transferError('Recipient Host revision conflict.', 'HOLOBIONT_REVISION_CONFLICT');
  }
  const { authorization, record, procedure } = await sourceProcedure(db, input, donor);
  const receipt = validateSandbox(input, procedure);
  const result = await memory.recordMemory(db, {
    holobiontId: recipient.holobiontId,
    expectedSessionRevision: recipient.revision,
    memoryId: randomUUID(), memoryType: 'PROCEDURAL', scope: recipient.scope,
    content: { procedureId: record.content.procedureId, procedure,
      producerSymbiontId: input.donorSymbiontId,
      transfer: { sourceHostId: donor.hostId, sourceMemoryId: record.memoryId,
        sourceMemoryHash: record.resultHash, capability: input.capability } },
    dataClasses: input.dataClasses || [],
    evidenceRefs: [...record.evidenceRefs, ...receipt.evidenceRefs],
    procedureVerified: true, authorId: input.verifierId,
    riskScore: input.riskScore, selfVerified: input.selfVerified === true
  });
  if (!result.accepted && result.accepted !== undefined) {
    return { assimilated: false, status: 'REJECTED', reason: result.reason, immuneReview: result.immuneReview };
  }
  return {
    assimilated: true, status: 'ASSIMILATED', procedureMemoryId: result.memoryId,
    sourceMemoryId: record.memoryId, sourceAuthorization: authorization,
    sandboxReceipt: { ...receipt, receiptId: randomUUID() }, immuneReview: result.immuneReview
  };
}

module.exports = { transferProcedure, digest };
