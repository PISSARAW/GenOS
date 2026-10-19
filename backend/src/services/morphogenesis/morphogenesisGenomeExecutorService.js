'use strict';

const crypto = require('node:crypto');
const operations = require('../agentDnaOperations');
const store = require('../agentDnaStore');

const EXECUTABLE = new Set(['clone', 'cross', 'mutate', 'graft', 'speciate', 'decoy']);

function coded(code, message) {
  return Object.assign(new Error(message), { code });
}

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function candidateId(input) {
  const identity = {
    planId: input.planId,
    targetAgentId: input.action.targetAgentId,
    action: input.action.action,
    parents: input.action.parentBindings,
    concept: input.action.concept || null
  };
  return `morph-${digest(identity).slice(0, 20)}`;
}

async function verifiedParents(input) {
  const portfolio = await store.listGenomePortfolio(input.db, input.scope);
  if (portfolio.status !== 'ready') {
    throw coded('MORPHOGENESIS_GENOME_PORTFOLIO_UNAVAILABLE', 'Genome portfolio is unavailable.');
  }
  const active = new Map(portfolio.eligible.map((genome) => [genome.id, genome]));
  return input.action.parentBindings.map((binding) => {
    const genome = active.get(binding.genomeRef);
    if (!genome) throw coded('MORPHOGENESIS_GENOME_PARENT_UNAVAILABLE',
      `Parent genome '${binding.genomeRef}' is not active or trusted.`);
    if (genome.contentHash !== binding.contentHash) {
      throw coded('MORPHOGENESIS_GENOME_PARENT_CHANGED',
        `Parent genome '${binding.genomeRef}' changed after planning.`);
    }
    return genome;
  });
}

function reproductiveParams(action, parents, outputId) {
  const base = { genomeId: parents[0]?.id, outputId };
  if (action.action === 'cross') return { ...base, parentId: parents[1]?.id,
    seed: digest({ outputId, parents: action.parentBindings }) };
  if (action.action === 'clone') return { ...base, mode: 'mitosis', seed: outputId };
  if (action.action === 'mutate') return { ...base, rate: action.rate || 0.05,
    locus: action.locus, seed: outputId };
  return null;
}

function acquiredTraitParams(action, base) {
  if (action.action === 'graft') return { ...base, ...(action.grafts || [])[0] };
  if (action.action === 'speciate') return { ...base, name: action.name || base.outputId,
    concept: action.concept, grafts: action.grafts || [] };
  if (action.action === 'decoy') return { ...base, selector: action.selector,
    detectability: action.detectability };
  return null;
}

function operationParams(action, parents, outputId) {
  const base = { genomeId: parents[0]?.id, outputId };
  const reproductive = reproductiveParams(action, parents, outputId);
  if (reproductive) return reproductive;
  return acquiredTraitParams(action, base) || base;
}

async function existingReceipt(input) {
  const model = await store.loadGenome(input.db, input.outputId, input.scope);
  if (!model) return null;
  const stored = await input.db.get('SELECT status FROM agent_genomes WHERE id = ?', input.outputId);
  if (!['candidate', 'active'].includes(stored?.status)) {
    throw coded('MORPHOGENESIS_GENOME_CANDIDATE_UNAVAILABLE',
      `Derived genome '${input.outputId}' is no longer admissible.`);
  }
  const innovation = await input.db.get(`SELECT id, status FROM agent_genome_innovations
    WHERE candidate_genome_ref = ?`, input.outputId);
  return {
    status: 'replayed',
    candidateGenomeRef: input.outputId,
    candidateContentHash: model.contentHash,
    innovationId: innovation?.id || null,
    innovationStatus: innovation?.status || 'candidate',
    promoted: innovation?.status === 'promoted'
  };
}

async function persistInnovation(input) {
  const innovationId = `morphogenesis-${input.result.contentHash.slice(0, 16)}`;
  const evidence = {
    source: 'morphogenesis_genome_action',
    planId: input.planId,
    action: input.action,
    parentFingerprints: input.action.parentBindings
  };
  await input.db.run(`INSERT INTO agent_genome_innovations
    (id, source_agent_id, base_genome_ref, candidate_genome_ref, concept,
     evidence_json, status, organization_id, project_id)
    VALUES (?, ?, ?, ?, ?, ?, 'candidate', ?, ?)
    ON CONFLICT(id) DO NOTHING`,
  innovationId, input.sourceAgentId || null, input.parents[0].id,
  input.result.genomeRef, input.action.concept || input.action.action,
  JSON.stringify(evidence), input.scope.organizationId || null, input.scope.projectId || null);
  return innovationId;
}

function assertAction(action) {
  if (action.schema !== 'genos.morphogenesis-genome-action/v1') {
    throw coded('MORPHOGENESIS_GENOME_ACTION_INVALID', 'Genome action schema is invalid.');
  }
  if (action.action === 'unresolved') {
    throw coded('MORPHOGENESIS_GENOME_PARENT_REQUIRED', 'Unresolved genome action cannot execute.');
  }
  if (action.action !== 'reuse' && !EXECUTABLE.has(action.action)) {
    throw coded('MORPHOGENESIS_GENOME_ACTION_UNSUPPORTED', `Unsupported genome action '${action.action}'.`);
  }
  const parentCount = Array.isArray(action.parentBindings) ? action.parentBindings.length : 0;
  if (parentCount === 0 || (action.action === 'cross' && parentCount !== 2)) {
    throw coded('MORPHOGENESIS_GENOME_PARENT_REQUIRED', 'Genome action has invalid parent bindings.');
  }
}

async function executeGenomeAction(input, deps = {}) {
  assertAction(input.action);
  const runOperation = deps.runOperation || operations.runOperation;
  const parents = await verifiedParents(input);
  if (input.action.action === 'reuse') {
    return { status: 'verified', genomeBinding: input.action.parentBindings[0], promoted: false,
      promotionAuthorized: false, cognitiveImprovementDemonstrated: false,
      qualificationRequired: 'reserved_missions' };
  }
  const outputId = candidateId(input);
  const replay = await existingReceipt({ ...input, outputId });
  if (replay) {
    if (!replay.innovationId) replay.innovationId = await persistInnovation({ ...input, parents,
      result: { genomeRef: replay.candidateGenomeRef, contentHash: replay.candidateContentHash } });
    return { ...replay, promotionAuthorized: false, cognitiveImprovementDemonstrated: false,
      qualificationRequired: 'reserved_missions' };
  }
  const result = await runOperation(input.db, {
    operation: input.action.action,
    params: operationParams(input.action, parents, outputId),
    scope: input.scope,
    status: 'candidate',
    concept: input.action.concept || input.action.action
  });
  if (result.status !== 'candidate' || result.dnaStatus !== 'DRAFT') {
    throw coded('MORPHOGENESIS_GENOME_CANDIDATE_INVALID',
      'Derived genome must be persisted as a DRAFT candidate.');
  }
  const innovationId = await persistInnovation({ ...input, parents, result });
  return {
    status: 'candidate_created',
    candidateGenomeRef: result.genomeRef,
    candidateContentHash: result.contentHash,
    innovationId,
    innovationStatus: 'candidate',
    promoted: false,
    promotionAuthorized: false,
    cognitiveImprovementDemonstrated: false,
    qualificationRequired: 'reserved_missions'
  };
}

async function abandonCandidate(input) {
  const receipt = input.receipt?.detail || input.receipt || {};
  const genomeRef = receipt.candidateGenomeRef;
  if (!genomeRef) return { abandoned: false, reason: 'no_candidate_effect' };
  await input.db.run("UPDATE agent_genomes SET status='rejected' WHERE id=? AND status='candidate'", genomeRef);
  await input.db.run(`UPDATE agent_genome_innovations SET status='rejected',
    evaluation_json=? WHERE candidate_genome_ref=? AND status IN ('candidate','evaluated')`,
  JSON.stringify({ decision: 'rollback_abandon', reason: input.cause }), genomeRef);
  return { abandoned: true, candidateGenomeRef: genomeRef };
}

module.exports = { abandonCandidate, candidateId, executeGenomeAction, operationParams };
