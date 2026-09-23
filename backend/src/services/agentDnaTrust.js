const policy = require('./agentDnaPolicy');
const { verifySignerTrust } = require('./agentDna/container');

async function evaluateGenomeTrust(db, model, scope) {
  if (!model) return { trusted: false, reason: 'missing_model' };
  const required = await policy.isSignatureRequired(db, scope);
  if (!required) return { trusted: true, reason: 'signature_not_required' };
  if (!model.signatureValid) return { trusted: false, reason: 'signature_invalid' };
  if (!model.signer) return { trusted: false, reason: 'signer_missing' };
  const trusted = await verifySignerTrust(model.signer, scope, db);
  return trusted
    ? { trusted: true, reason: 'trusted_signer' }
    : { trusted: false, reason: 'signer_untrusted' };
}

module.exports = { evaluateGenomeTrust };
