'use strict';

const { withTransaction } = require('../../../db');
const artifacts = require('./runtimeArtifacts');

async function link(db, input) {
  return withTransaction(db, async (tx) => {
    const claims = await tx.all('SELECT claim_id FROM morph_cambium_claims WHERE scope_id = ? AND claim_id IN (?, ?)',
      [input.scopeId, input.parentId, input.childId]);
    if (claims.length !== 2) throw new Error('CAMBIUM_LINK_SCOPE_INVALID');
    await rejectCycle(tx, input);
    await tx.run('INSERT INTO morph_cambium_links (parent_id, child_id) VALUES (?, ?)', [input.parentId, input.childId]);
    return { linked: true };
  });
}

async function invalidate(db, input) {
  if (!input.reason || !await input.resolveArtifact(input.evidenceRef)) throw new Error('INVALIDATION_EVIDENCE_REQUIRED');
  return withTransaction(db, async (tx) => {
    const root = await tx.get('SELECT claim_id FROM morph_cambium_claims WHERE claim_id = ? AND scope_id = ?', [input.claimId, input.scopeId]);
    if (!root) throw new Error('CAMBIUM_CLAIM_SCOPE_INVALID');
    const descendants = await tx.all(`WITH RECURSIVE impacted(id) AS (
      SELECT ? UNION SELECT child_id FROM morph_cambium_links JOIN impacted ON parent_id = impacted.id
    ) SELECT claim_id FROM morph_cambium_claims JOIN impacted ON claim_id = impacted.id WHERE scope_id = ?`,
    [input.claimId, input.scopeId]);
    for (const row of descendants) await tx.run("UPDATE morph_cambium_claims SET status = 'UNVERIFIED' WHERE claim_id = ?", [row.claim_id]);
    const content = { claimId: input.claimId, reason: input.reason, evidenceRef: input.evidenceRef,
      impacted: descendants.map((row) => row.claim_id) };
    return { ...content, artifactRef: await artifacts.put(tx, { scopeId: input.scopeId, kind: 'cambium-invalidation', content }) };
  });
}

module.exports = { link, invalidate };

async function dependenciesUsable(db, input) {
  const ancestors = await db.all(`WITH RECURSIVE parents(id) AS (
    SELECT parent_id FROM morph_cambium_links WHERE child_id = ?
    UNION SELECT parent_id FROM morph_cambium_links JOIN parents ON child_id = parents.id
  ) SELECT claim_id, status, verification_ref, conditions_json, environment_version FROM morph_cambium_claims
    JOIN parents ON claim_id = parents.id WHERE scope_id = ?`, [input.claimId, input.scopeId]);
  for (const ancestor of ancestors) {
    if (ancestor.status === 'UNVERIFIED' || !await input.resolveArtifact(ancestor.verification_ref)) return false;
    const counterexamples = await db.all('SELECT artifact_ref, condition_json FROM morph_cambium_counterexamples WHERE claim_id = ?', [ancestor.claim_id]);
    if (!(await Promise.all(counterexamples.map((item) => input.resolveArtifact(item.artifact_ref)))).every(Boolean)) return false;
    if (!ancestorApplies(ancestor, counterexamples, input)) return false;
    const witnesses = await db.all('SELECT artifact_ref FROM morph_cambium_witnesses WHERE claim_id = ?', [ancestor.claim_id]);
    if (!witnesses.length || !(await Promise.all(witnesses.map((item) => input.resolveArtifact(item.artifact_ref)))).every(Boolean)) return false;
  }
  return true;
}
module.exports.dependenciesUsable = dependenciesUsable;
async function rejectCycle(db, input) {
  const cycle = await db.get(`WITH RECURSIVE children(id) AS (
    SELECT ? UNION SELECT child_id FROM morph_cambium_links JOIN children ON parent_id = children.id
  ) SELECT id FROM children WHERE id = ?`, [input.childId, input.parentId]);
  if (cycle) throw new Error('CAMBIUM_DEPENDENCY_CYCLE');
}
function ancestorApplies(ancestor, counterexamples, input) {
  if (input.environmentVersion && input.environmentVersion !== ancestor.environment_version) return false;
  if (!input.facts) return true;
  const { matches } = require('./cambiumDecision');
  const conditions = JSON.parse(ancestor.conditions_json);
  return conditions.every((condition) => matches(condition, input.facts))
    && !counterexamples.some((item) => matches(JSON.parse(item.condition_json), input.facts));
}
