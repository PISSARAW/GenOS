/**
 * Per-tenant AgentDNA policy: whether spawned workers may only use genomes
 * whose Ed25519 signature verifies.
 */

function envRequiresSignature() {
  const flag = String(process.env.GENOS_AGENT_DNA_REQUIRE_SIGNED || '').toLowerCase();
  return flag === '1' || flag === 'true' || flag === 'yes' || flag === 'on';
}

function scopeIds(scope) {
  const value = scope || {};
  return { organizationId: value.organizationId || null, projectId: value.projectId || null };
}

async function isSignatureRequired(db, scope) {
  if (envRequiresSignature()) return true;
  const ids = scopeIds(scope);
  if (!ids.organizationId || !ids.projectId) return false;
  try {
    const row = await db.get(
      'SELECT require_signed FROM genome_policies WHERE organization_id = ? AND project_id = ?',
      ids.organizationId,
      ids.projectId
    );
    return Boolean(row && row.require_signed);
  } catch (_) {
    return false;
  }
}

async function setPolicy(db, scope, requireSigned) {
  const ids = scopeIds(scope);
  if (!ids.organizationId || !ids.projectId) {
    throw Object.assign(new Error('organizationId and projectId are required to set a genome policy'), {
      code: 'GENOME_POLICY_SCOPE_REQUIRED'
    });
  }
  await db.run(
    `INSERT INTO genome_policies (organization_id, project_id, require_signed, updated_at)
     VALUES (?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(organization_id, project_id) DO UPDATE SET require_signed = excluded.require_signed, updated_at = CURRENT_TIMESTAMP`,
    ids.organizationId,
    ids.projectId,
    requireSigned ? 1 : 0
  );
  return { organizationId: ids.organizationId, projectId: ids.projectId, requireSigned: Boolean(requireSigned) };
}

async function getPolicy(db, scope) {
  const ids = scopeIds(scope);
  return {
    organizationId: ids.organizationId,
    projectId: ids.projectId,
    requireSigned: await isSignatureRequired(db, scope)
  };
}

module.exports = { isSignatureRequired, setPolicy, getPolicy, envRequiresSignature, scopeIds };
