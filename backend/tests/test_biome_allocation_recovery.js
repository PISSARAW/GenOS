'use strict';

const assert = require('node:assert/strict');
const { workerArtifactResponseFormat } = require('../src/services/agents/workerArtifactResponseSchema');
const recovery = require('../src/services/morphogenesis/biomeAllocationRecovery');
const rolePrompt = require('../src/services/morphogenesisRolePrompt');

const mission = {
  prompt: 'Répartis item1=3, item2=4, item3=4, item4=4, item5=6, item6=2, item7=1 en 3 groupes, plafond de 8.',
  role: 'resource_steward', recoveryAttempt: 3, recoveryMaxAttempts: 3,
  workerAssignment: { topology: 'biome', topologyRole: 'resource_steward' }
};
const format = workerArtifactResponseFormat('specialist', ['mission']);
const rawResponse = JSON.stringify({ outcome: 'unresolved', claims: [], uncertainties: [],
  specialtyAssessment: { niche: 'biome:resource_steward', inScope: true, evidence: ['mission'] } });
const invalid = { text: rawResponse, structured: JSON.parse(rawResponse),
  schemaViolation: { error: 'OUTPUT_SCHEMA_VIOLATION', violations: ['/uncertainties must NOT have fewer than 1 items'] } };
const normalized = recovery.normalizeUnresolvedResponse(invalid, format, mission);
assert.equal(normalized.structured.outcome, 'unresolved', 'schema repair must preserve abstention');
assert.equal(normalized.structured.claims.length, 0);
assert.match(normalized.structured.uncertainties[0], /without specifying/);
assert.equal(normalized.schemaViolation, undefined);
assert.equal(recovery.normalizeUnresolvedResponse(invalid, format, { ...mission, role: 'worker' }), null,
  'schema normalization is scoped to the assigned Biome steward');

const repaired = recovery.recoverExhaustedAllocation(normalized.structured, mission, rawResponse);
assert.ok(repaired, 'the final bounded recovery attempt should use a deterministic solution witness');
assert.equal(repaired.report.outcome, 'success');
assert.equal(repaired.report.claims.length, 1);
const candidate = JSON.parse(repaired.report.claims[0].statement);
assert.deepEqual(rolePrompt.validateBiomeAllocation(candidate, mission.prompt, mission), { passed: true, issues: [] });
assert.equal(repaired.report.morphogenesisRecoveryReceipt.validation.passed, true);
assert.equal(repaired.report.morphogenesisRecoveryReceipt.trigger, 'recovery_budget_exhausted');
assert.equal(recovery.recoverExhaustedAllocation(normalized.structured, { ...mission, recoveryAttempt: 2 }, rawResponse), null,
  'deterministic recovery must wait until the authorized attempt budget is exhausted');
assert.equal(recovery.recoverExhaustedAllocation(normalized.structured, {
  ...mission, prompt: 'Répartis item1=4, item2=4 en 2 groupes, plafond de 3.'
}, rawResponse), null, 'the fallback must not invent a witness for an infeasible allocation');

process.stdout.write('Biome bounded recovery preserves abstentions and validates final witnesses: PASS\n');
