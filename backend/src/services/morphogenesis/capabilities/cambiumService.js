'use strict';

const { withTransaction } = require('../../../db');

function invalidWitnesses(witnesses) {
  return witnesses.some((item) => !item.witnessId || !item.artifactRef || item.status !== 'VERIFIED');
}

function hasCoreFields(input) {
  return Boolean(input?.claimId && input.scopeId && input.procedure
    && input.environmentVersion && input.verificationRef);
}

function requireContract(input) {
  if (!hasCoreFields(input)
    || !Array.isArray(input.conditions) || !input.conditions.length
    || !Array.isArray(input.witnesses) || !input.witnesses.length) {
    throw new Error('Cambium requires claim, procedure, environment, conditions and witnesses');
  }
  if (invalidWitnesses(input.witnesses)) {
    throw new Error('Cambium witnesses need verified, resolvable artifact references');
  }
  return input;
}

async function registerProcedure(db, input) {
  const contract = requireContract(input);
  if (typeof input.resolveArtifact !== 'function') throw new Error('Cambium resolver required');
  if (!await input.resolveArtifact(contract.verificationRef)) throw new Error('Procedure verification is unresolved');
  for (const witness of contract.witnesses) {
    if (!await input.resolveArtifact(witness.artifactRef)) throw new Error('Cambium witness is unresolved');
  }
  return withTransaction(db, async (tx) => {
    await tx.run(`INSERT INTO morph_cambium_claims
      (claim_id, scope_id, procedure_json, verification_ref, environment_version, conditions_json, status)
      VALUES (?, ?, ?, ?, ?, ?, 'VERIFIED')`, [contract.claimId, contract.scopeId, JSON.stringify(contract.procedure),
      contract.verificationRef,
      contract.environmentVersion, JSON.stringify(contract.conditions)]);
    for (const witness of contract.witnesses) {
      await tx.run(`INSERT INTO morph_cambium_witnesses
        (witness_id, claim_id, artifact_ref, status) VALUES (?, ?, ?, 'VERIFIED')`,
      [witness.witnessId, contract.claimId, witness.artifactRef]);
    }
    return { claimId: contract.claimId, status: 'VERIFIED' };
  });
}

async function attachCounterexample(db, input) {
  if (!input?.counterexampleId || !input.claimId || !input.scopeId || !input.artifactRef || !input.condition) {
    throw new Error('Counterexample, claim, artifact and condition are required');
  }
  if (typeof input.resolveArtifact !== 'function' || !await input.resolveArtifact(input.artifactRef)) {
    throw new Error('Counterexample artifact is unresolved');
  }
  return withTransaction(db, async (tx) => {
    const claim = await tx.get('SELECT status FROM morph_cambium_claims WHERE claim_id = ? AND scope_id = ?', [input.claimId, input.scopeId]);
    if (!claim) throw new Error('Cambium claim not found');
    await tx.run(`INSERT INTO morph_cambium_counterexamples
      (counterexample_id, claim_id, artifact_ref, condition_json) VALUES (?, ?, ?, ?)`,
    [input.counterexampleId, input.claimId, input.artifactRef, JSON.stringify(input.condition)]);
    await tx.run("UPDATE morph_cambium_claims SET status = 'QUALIFIED' WHERE claim_id = ?", [input.claimId]);
    return { claimId: input.claimId, status: 'QUALIFIED' };
  });
}

async function resolvable(input, items) {
  if (typeof input.resolveArtifact !== 'function') return { allowed: false, reason: 'RESOLVER_REQUIRED' };
  for (const item of items) {
    if (!await input.resolveArtifact(item.artifact_ref)) {
      return { allowed: false, reason: 'ARTIFACT_UNRESOLVABLE', artifactRef: item.artifact_ref };
    }
  }
  return { allowed: true };
}

async function evaluateCompression(db, input) {
  const claim = await db.get('SELECT * FROM morph_cambium_claims WHERE claim_id = ? AND scope_id = ?', [input.claimId, input.scopeId]);
  if (!claim) throw new Error('Cambium claim not found');
  const witnesses = await db.all('SELECT * FROM morph_cambium_witnesses WHERE claim_id = ?', [input.claimId]);
  const counterexamples = await db.all('SELECT * FROM morph_cambium_counterexamples WHERE claim_id = ?', [input.claimId]);
  const removed = new Set(input.removeWitnessIds || []);
  const retained = witnesses.filter((w) => !removed.has(w.witness_id));
  if (!retained.length && !input.degradeClaim) return { allowed: false, reason: 'LAST_WITNESS_REQUIRED' };
  const artifactCheck = await resolvable(input, [{ artifact_ref: claim.verification_ref },
    ...retained, ...counterexamples]);
  if (!artifactCheck.allowed) return artifactCheck;
  if (typeof input.compareDecisions !== 'function') return { allowed: false, reason: 'COMPARISON_REQUIRED' };
  const comparison = await input.compareDecisions({ claim, witnesses, retained, counterexamples });
  if (comparison?.preserved !== true) return { allowed: false, reason: 'DECISION_BOUNDARY_LOST' };
  return { allowed: true, claimId: input.claimId, removeWitnessIds: [...removed],
    nextStatus: retained.length ? claim.status : 'UNVERIFIED', comparison };
}

async function commitCompression(db, input) {
  return withTransaction(db, async (tx) => {
    const decision = await evaluateCompression(tx, input);
    if (!decision.allowed) return decision;
    await tx.run('UPDATE morph_cambium_claims SET status = ? WHERE claim_id = ? AND scope_id = ?', [decision.nextStatus, input.claimId, input.scopeId]);
    for (const id of decision.removeWitnessIds) {
      await tx.run('DELETE FROM morph_cambium_witnesses WHERE claim_id = ? AND witness_id = ?', [input.claimId, id]);
    }
    return decision;
  });
}

module.exports = { registerProcedure, attachCounterexample, evaluateCompression, commitCompression };
