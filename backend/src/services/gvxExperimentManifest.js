'use strict';

const values = require('./trinityProvenanceValues');
const schemas = require('./cognitiveOmegaSchemaCheck');
const { error } = require('./gvxContracts');
const VERSION = 'genos.gvx.experiment-manifest/v1';

function planContent(plan) {
  const { experimentalManifest, ...content } = plan;
  return content;
}

function binding(context) {
  const plan = context.plan;
  return {
    experimentId: plan.experimentId,
    scope: { organizationId: context.scope.organizationId, projectId: context.scope.projectId, entityId: context.entityId },
    snapshotHash: plan.snapshotHash, candidateHash: context.candidateHash ?? null,
    controls: values.clone(plan.controls), worldBudget: plan.worldBudget,
    planHash: values.digest(planContent(plan)),
    arms: plan.experimentDesign.arms.map(({ armId, worldId, role, isolationId }) => ({ armId, worldId, role, isolationId }))
  };
}

function build(plan, input) {
  values.assertPublic(input.provenance);
  const content = { schema: VERSION, canonicalization: 'genos-json/v1',
    payload: { ...binding({ ...input, plan }), provenance: values.clone(input.provenance) } };
  const manifest = { ...content, hash: values.digest(content) };
  verify(manifest, { ...input, plan });
  return manifest;
}

function validateShape(manifest) {
  const result = schemas.validate(manifest, { schema: 'gvx-experiment-manifest.schema.json' });
  if (result.unavailable) throw error('GVX_EXPERIMENT_MANIFEST_SCHEMA_UNAVAILABLE');
  if (!result.valid) throw Object.assign(error('GVX_EXPERIMENT_MANIFEST_INVALID'), { errors: result.errors });
  if (Buffer.byteLength(values.encode(manifest)) > 2 * 1024 * 1024) throw error('GVX_EXPERIMENT_MANIFEST_TOO_LARGE');
}

function unique(items, field) {
  if (new Set(items.map(item => item[field])).size !== items.length) throw error('GVX_EXPERIMENT_REFERENCE_DUPLICATE');
}

function assertLinks(items, target) {
  if (items.some(id => !target.has(id))) throw error('GVX_EXPERIMENT_REFERENCE_UNKNOWN');
}

function references(payload) {
  const source = payload.provenance;
  for (const field of ['armId', 'worldId', 'role', 'isolationId']) unique(payload.arms, field);
  for (const field of ['claims', 'hypotheses', 'interventions']) unique(source[field], 'id');
  unique(source.artifacts, 'artifactId');
  unique(source.receiptRefs, 'receiptId');
  unique(source.lineage, 'runId');
  const artifacts = [...source.artifacts.map(item => item.artifactId), ...source.receiptRefs.map(item => item.receiptId)];
  if (new Set(artifacts).size !== artifacts.length) throw error('GVX_EXPERIMENT_REFERENCE_DUPLICATE');
  const claims = new Set(source.claims.map(item => item.id));
  const hypotheses = new Set(source.hypotheses.map(item => item.id));
  assertLinks(source.claims.flatMap(item => item.sourceRefs), new Set(artifacts));
  assertLinks(source.hypotheses.flatMap(item => item.claimIds), claims);
  assertLinks(source.interventions.flatMap(item => item.hypothesisIds), hypotheses);
  interventionBindings(payload);
  lineageBindings(source);
}

function interventionBindings(payload) {
  const arms = new Set(payload.arms.map(item => item.armId));
  const mapped = new Set(payload.provenance.interventions.map(item => item.armId));
  assertLinks([...mapped], arms);
  if (mapped.size !== arms.size) throw error('GVX_EXPERIMENT_INTERVENTION_MISSING');
}

function lineageBindings(source) {
  const ancestors = new Set(source.lineage.map(item => item.runId));
  if (ancestors.has(source.run.id)) throw error('GVX_EXPERIMENT_LINEAGE_SELF_REFERENCE');
  if (source.run.parentRunId !== null && !ancestors.has(source.run.parentRunId)) {
    throw error('GVX_EXPERIMENT_PARENT_REFERENCE_MISSING');
  }
}

function verify(manifest, context) {
  validateShape(manifest);
  values.assertPublic(manifest);
  const { hash, ...content } = manifest;
  if (values.digest(content) !== hash) throw error('GVX_EXPERIMENT_MANIFEST_CORRUPT');
  references(manifest.payload);
  if (context) {
    const { provenance, ...bound } = manifest.payload;
    if (values.digest(bound) !== values.digest(binding(context))) throw error('GVX_EXPERIMENT_MANIFEST_BINDING_CHANGED');
  }
  return true;
}

module.exports = { VERSION, build, verify, planContent };
