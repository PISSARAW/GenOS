'use strict';

const MAX_OBSERVATIONS = 32;
let identity = null;
let boundRunId = null;
let revision = 0;
let received = [];
let queued = [];

function safeTarget(target) {
  return typeof target === 'string' && target.length <= 260
    && !/[\r\n\t\0]/.test(target) && !target.split(/[\\/]/).includes('..');
}

function validReceipt(receipt) {
  return receipt && safeTarget(receipt.target)
    && (/^[a-f0-9]{64}$/.test(receipt.digest || '') || receipt.digest === 'missing')
    && Number.isSafeInteger(receipt.planRevision)
    && typeof receipt.evidenceRef === 'string' && receipt.evidenceRef.length <= 512;
}

function validMessage(message) {
  return validHeader(message) && validBatch(message);
}

function validHeader(message) {
  return message.agentId === identity && typeof message.runId === 'string'
    && /^[A-Za-z0-9_-]{1,200}$/.test(message.runId)
    && (!boundRunId || message.runId === boundRunId);
}

function validBatch(message) {
  return Number.isSafeInteger(message.planRevision)
    && message.planRevision > revision && message.planRevision <= 10000
    && Array.isArray(message.observations) && message.observations.length > 0
    && message.observations.length <= 16 && message.observations.every(validReceipt);
}

function accept(message) {
  if (message?.type !== 'genos-observation-update') return false;
  if (!identity) { queued = [...queued, message].slice(-MAX_OBSERVATIONS); return false; }
  if (!validMessage(message)) return false;
  if (!message.observations.every((receipt) => receipt.runId === message.runId
    && receipt.planRevision === message.planRevision
    && receipt.evidenceRef === `dependency:${message.runId}:${message.planRevision}:${receipt.target}`)) return false;
  boundRunId = message.runId;
  revision = message.planRevision;
  received = [...received, ...message.observations].slice(-MAX_OBSERVATIONS);
  return true;
}

function bind(agentId) {
  identity = agentId;
  boundRunId = null;
  revision = 0;
  received = [];
  const backlog = queued;
  queued = [];
  backlog.forEach(accept);
}

function currentRevision() { return revision; }

function latestDigest() { return received.at(-1)?.digest || null; }

function latestEvidenceRef() { return received.at(-1)?.evidenceRef || null; }

function apply(state, emitEvent) {
  if (revision <= (state.observationRevision || 0)) return false;
  const observations = received.map(({ target, digest, planRevision, evidenceRef }) => ({
    target, digest, digestPrefix: digest.slice(0, 8), planRevision, evidenceRef
  }));
  state.observationRevision = revision;
  state.framedPrompt = `${state.baseFramedPrompt}\n\nOBSERVATIONS EXTERNES HORODATÉES PAR GENOS : ${JSON.stringify(observations)}\n`
    + `Ces empreintes proviennent de fichiers déclarés. Cite exactement la dernière référence de preuve ${latestEvidenceRef()} dans ta réponse ou dans le champ evidence du dernier claim. Ne prétends pas connaître le contenu du fichier.\n`;
  state.promptTokenEstimate = Math.ceil(Buffer.byteLength(state.framedPrompt, 'utf8') / 4);
  emitEvent(state, { eventType: 'AGENT_PLAN_REVISED', action: 'REOBSERVE',
    detail: 'Local runtime rebuilt its prompt from a new observation.', status: 'running',
    payload: { planRevision: revision, observations } });
  return true;
}

process.on('message', accept);

module.exports = { bind, accept, apply, currentRevision, latestDigest, latestEvidenceRef };
