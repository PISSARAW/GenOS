'use strict';

const programs = require('./nceProcedureProgram');
const SCHEMA = 'genos.nce.repertoire-search.v1';
const OPERATIONS = ['sort', 'unique', 'absolute', 'reverse'];

function searchOptions(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new Error('Invalid NCE search options');
  if (Object.keys(options).some((key) => !['maxCandidates', 'maxParents'].includes(key))) {
    throw new Error('Unknown NCE search option');
  }
  return { schema: SCHEMA,
    maxCandidates: boundedInteger(options.maxCandidates ?? 16, 32),
    maxParents: boundedInteger(options.maxParents ?? 8, 16) };
}

function boundedInteger(value, maximum) {
  if (!Number.isInteger(value) || value < 0 || value > maximum) throw new Error('Invalid NCE search budget');
  return value;
}

function hasPromotionEvidence(receipt) {
  return receipt.measured === true && receipt.promoted === true
    && typeof receipt.evidenceRef === 'string' && Boolean(receipt.evidenceRef.trim());
}

function verifiedParents(state, limit) {
  const proofs = new Map((state.nceReceipts || []).filter(hasPromotionEvidence)
    .map((receipt) => [receipt.evidenceRef, receipt]));
  const parents = [];
  for (const hash of Object.keys(state.proceduralRepertoire || {}).sort()) {
    if (parents.length >= limit) break;
    const entry = state.proceduralRepertoire[hash];
    const proof = proofs.get(entry.evidenceRef);
    if (!proof || proof.agentId !== state.agentId) continue;
    const procedure = programs.validateProgram(entry.procedure);
    if (programs.digest(procedure) !== hash || programs.digest(proof.procedure) !== hash) continue;
    parents.push({ procedure, reference: { agentId: state.agentId, programHash: hash, evidenceRef: entry.evidenceRef } });
  }
  return parents;
}

function proposal(kind, parents, result) {
  return { procedure: programs.program(result.steps), derivation: {
    schema: 'genos.nce.derivation.v1', kind, parents: parents.map((parent) => parent.reference),
    ...(result.edit ? { edit: result.edit } : {}),
  } };
}

function mutation(parent, steps, edit) { return proposal('mutation', [parent], { steps, edit }); }

function* compositions(parents) {
  for (const left of parents) {
    for (const right of parents) {
      if (left === right) continue;
      const steps = [...left.procedure.steps, ...right.procedure.steps];
      if (steps.length <= 16) yield proposal('composition', [left, right], { steps });
    }
  }
}

function* mutations(parent) {
  const steps = parent.procedure.steps;
  if (steps.length < 16) {
    for (const operation of OPERATIONS) {
      yield mutation(parent, [...steps, operation], { type: 'insert', position: steps.length, operation });
      yield mutation(parent, [operation, ...steps], { type: 'insert', position: 0, operation });
    }
  }
  for (let position = 0; position < steps.length; position += 1) {
    yield mutation(parent, steps.filter((_, index) => index !== position),
      { type: 'delete', position, operation: steps[position] });
  }
}

function* proposals(parents) {
  for (const parent of parents) yield proposal('reuse', [parent], { steps: parent.procedure.steps });
  yield* compositions(parents);
  for (const parent of parents) yield* mutations(parent);
}

function searchRepertoire(state, context) {
  const { options, artifacts } = context;
  const limit = Math.min(options.maxCandidates, 32 - artifacts.length);
  if (limit <= 0) return [];
  const parents = verifiedParents(state, options.maxParents);
  const seen = new Set(artifacts.map((artifact) => programs.digest(artifact.content.procedure)));
  const result = [];
  for (const candidate of proposals(parents)) {
    const hash = programs.digest(candidate.procedure);
    if (seen.has(hash)) continue;
    seen.add(hash);
    result.push({ id: `repertoire-${programs.digest(candidate)}`, agentId: state.agentId, active: true,
      provenance: { createdBy: state.agentId, source: SCHEMA, derivation: candidate.derivation },
      content: { procedure: candidate.procedure } });
    if (result.length >= limit) break;
  }
  return result;
}

function searchManifest(artifacts, options) {
  return { ...options, candidates: artifacts.map((artifact) => ({
    artifactId: artifact.id, programHash: programs.digest(artifact.content.procedure),
    provenance: structuredClone(artifact.provenance),
  })) };
}

module.exports = { searchOptions, searchRepertoire, searchManifest };
