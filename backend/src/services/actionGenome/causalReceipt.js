const crypto = require('crypto');

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

function digest(value) {
  const body = JSON.stringify(canonical(value));
  return `sha256:${crypto.createHash('sha256').update(body).digest('hex')}`;
}

function issueCausalReceipt(context) {
  const statement = {
    schema: 'genos.action-invocation-statement/v1',
    action: {
      id: context.genome.identity.id,
      version: context.genome.identity.version,
      contractDigest: digest(context.genome)
    },
    actorId: context.invocation.actor.id,
    observedStateVersion: context.state.version,
    inputDigest: digest(context.invocation.input),
    requestedBudget: context.invocation.budget,
    admitted: context.verdicts.every((verdict) => verdict.passed),
    verdicts: context.verdicts,
    evidenceStatus: 'pending_execution'
  };
  return {
    schema: 'genos.action-invocation-receipt/v1',
    receiptId: digest(statement),
    statement
  };
}

module.exports = { digest, issueCausalReceipt };
