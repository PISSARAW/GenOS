'use strict';

const crypto = require('node:crypto');
const bandit = require('../../backend/src/services/routingBanditService');
const { saveAssembly } = require('../../backend/src/services/aeisAssemblyStore');
const { issueReceipt } = require('../../backend/src/services/epistemicVerifierReceiptService');
const { ensureVerifier, listVerifierDigests } = require('../../backend/src/services/verifierTrustRegistry');
const { createFormalResult } = require('../../backend/src/services/formalResultService');
const { evaluateEpistemicAssurance } = require('../../backend/src/services/epistemicAssuranceService');

process.env.GENOS_EPISTEMIC_RECEIPT_SECRET ||= 'verified-bandit-fixture-only';

function attachAssemblyStore(db) {
  const rows = new Map();
  const get = db.get.bind(db);
  const run = db.run.bind(db);
  db.get = async (sql, ...args) => String(sql).startsWith('SELECT * FROM aeis_assurance_assemblies')
    ? rows.get(args[0]) || null : get(sql, ...args);
  db.run = async (sql, ...args) => {
    if (String(sql).startsWith('INSERT INTO aeis_assurance_assemblies')) {
      const [id, payload_json, manifest_json, signature, key_id, run_id, scope_id] = args;
      rows.set(id, { id, payload_json, manifest_json, signature, key_id,
        signature_version: 3, run_id, scope_id });
      return;
    }
    return run(sql, ...args);
  };
  return rows;
}

async function verifiedObservation(db, input = {}) {
  const missionId = input.missionId || crypto.randomUUID();
  const routeAttemptId = input.routeAttemptId || crypto.randomUUID();
  const data = { ...input, missionId, routeAttemptId,
    scopeId: input.scopeId || 'fixture-org:fixture-project:fixture-workspace' };
  const statement = bandit.outcomeStatement(data);
  const sourceDigest = `sha256:${crypto.createHash('sha256').update(statement).digest('hex')}`;
  const formal = { canonicalStatement: statement, status: 'verified', assumptions: [],
    validityDomain: { statement: 'One model route attempt.', constraints: [] },
    dependencies: [], evidence: { kind: 'proof', content: { statement, fixture: true } },
    provenance: { createdAt: new Date().toISOString(), actor: 'fixture:oracle',
      source: { type: 'proof', uri: 'genos://test/model-route', digest: sourceDigest },
      inputs: [], transformations: ['fixture-check'] },
    producer: { model: 'independent-fixture', version: '1' } };
  const result = createFormalResult(formal);
  const verifierDigest = ensureVerifier('test').digest;
  const receipt = () => issueReceipt({ resultId: result.resultId, evidenceDigest: result.evidence.digest,
    verifierDigest, status: 'verified', independent: true });
  const assembly = { results: [formal], obligations: [{ id: 'route-outcome', required: true }],
    coverage: [{ obligationId: 'route-outcome', resultId: result.resultId,
      evidenceDigest: result.evidence.digest }],
    constraintAttestations: [{ actorId: 'fixture:oracle-a', independent: true,
      obligationIds: ['route-outcome'] }, { actorId: 'fixture:oracle-b', independent: true,
      obligationIds: ['route-outcome'] }],
    trustedVerifierDigests: listVerifierDigests(), verifications: [receipt(), receipt()],
    compositionRoots: [result.resultId], workerIds: [], contributions: [] };
  const evaluation = { allAccepted: true, evaluation: evaluateEpistemicAssurance(assembly), assembly };
  const assemblyId = await saveAssembly(db, evaluation, { runId: missionId, scopeId: data.scopeId });
  return { ...data, verification: { assemblyId } };
}

module.exports = { attachAssemblyStore, verifiedObservation };
