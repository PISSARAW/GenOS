const vault = require('./secretVault');
const responses = require('./modelProviderResponses');

function references(turns) {
  return turns.filter((turn) => turn.status === 'completed').flatMap((turn) => {
    try {
      const continuity = JSON.parse(turn.response_json || '{}').providerContinuity;
      return continuity ? [{ sessionId: turn.session_id, ...continuity }] : [];
    } catch (_) { return []; }
  });
}

function latestBySession(turns) {
  const latest = new Map();
  for (const turn of turns.filter((item) => item.status === 'completed')) {
    latest.set(turn.session_id, references([turn])[0] || null);
  }
  return [...latest.values()];
}

function valid(reference) {
  if (!reference?.sealedResponseId || !reference.expiresAt
    || Date.parse(reference.expiresAt) <= Date.now()) return false;
  try {
    const responseId = vault.decrypt(reference.sealedResponseId);
    responses.validatePrior({ ...reference, responseId }, reference.model);
    return true;
  } catch (_) { return false; }
}

function available(turns) {
  return latestBySession(turns).some(valid);
}

module.exports = { references, available };
