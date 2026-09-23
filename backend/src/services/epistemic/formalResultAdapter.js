'use strict';

/**
 * formalResultAdapter.js
 *
 * Adaptateur explicite HolobionteResult → FormalResult.
 */

const crypto = require('node:crypto');

const HOLOBIONTE_TO_FORMAL_STATUS = Object.freeze({
  verified: 'verified',
  proved: 'verified',
  refuted: 'refuted',
  failed: 'tested',
  inconclusive: 'conjecture',
});

const HOLOBIONTE_TO_FORMAL_EVIDENCE_KIND = Object.freeze({
  test_result: 'reproducible_artifact',
  proof: 'proof',
  counterexample: 'counterexample',
  reproducible_artifact: 'reproducible_artifact',
  observation: 'reproducible_artifact',
  behavior: 'reproducible_artifact',
  coverage: 'reproducible_artifact',
});

function sha256(value) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function canonicalizeAssumptions(raw) {
  if (!Array.isArray(raw)) return [];
  const result = [];
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    if (typeof item === 'string') result.push({ id: `assumption-${i}`, statement: item });
    else if (item && typeof item === 'object' && item.statement) {
      result.push({ id: item.id || `assumption-${i}`, statement: item.statement });
    }
  }
  return result;
}

function canonicalizeValidityDomain(raw, fallbackStatement) {
  const statement = (raw && raw.statement) || (raw && raw.domain) || fallbackStatement || '(domaine non spécifié)';
  const constraints = Array.isArray(raw && raw.constraints) ? raw.constraints.slice() : [];
  if (raw && raw.coverage !== undefined) constraints.push(`coverage: ${raw.coverage}`);
  return { statement, constraints };
}

function extractSourceInfo(raw) {
  const source = raw && raw.source || {};
  return {
    type: source.type || 'holobionte',
    uri: source.uri || 'genos://holobionte',
    digest: source.digest || sha256(JSON.stringify(raw || {})),
  };
}

function canonicalizeProvenance(raw, fallbackActor) {
  return {
    createdAt: (raw && raw.createdAt) || new Date().toISOString(),
    actor: (raw && raw.actor) || fallbackActor || 'holobionte',
    source: extractSourceInfo(raw),
    inputs: Array.isArray(raw && raw.inputs) ? raw.inputs : [],
    transformations: Array.isArray(raw && raw.transformations) ? raw.transformations : [],
  };
}

function canonicalizeProducer(raw) {
  if (!raw || typeof raw !== 'object') return { model: 'holobionte', version: '1.0' };
  return { model: raw.model || 'holobionte', version: raw.version || '1.0' };
}

function mapStatus(holobionteStatus) {
  return HOLOBIONTE_TO_FORMAL_STATUS[holobionteStatus] || 'conjecture';
}

function mapEvidenceKind(holobionteKind) {
  return HOLOBIONTE_TO_FORMAL_EVIDENCE_KIND[holobionteKind] || 'reproducible_artifact';
}

function adaptEvidence(rawEvidence, fallbackContent, producedBy) {
  const content = (rawEvidence && (rawEvidence.content || rawEvidence.digest))
    ? { digest: rawEvidence.digest, content: rawEvidence.content }
    : fallbackContent || { note: 'preuve holobionte' };
  const reproduction = (rawEvidence && rawEvidence.reproduction)
    || { command: producedBy || 'aeis:holobionte-review', environment: 'genos' };
  return {
    kind: mapEvidenceKind(rawEvidence && rawEvidence.kind),
    content,
    reproduction,
    reproductionProvided: Boolean(rawEvidence && rawEvidence.reproduction),
  };
}

function canonicalizeDependencies(deps) {
  if (!Array.isArray(deps)) return [];
  return deps.map(d => {
    const s = typeof d === 'string' ? d : JSON.stringify(d);
    return { resultId: sha256(s), semanticFingerprint: sha256(s), relation: 'uses' };
  });
}

function adaptHolobionteResult(holobionteResult) {
  if (!holobionteResult || typeof holobionteResult !== 'object') {
    return { error: 'holobionteResult must be an object' };
  }

  let status = mapStatus(holobionteResult.status);
  const statement = holobionteResult.canonicalStatement || holobionteResult.claim || holobionteResult.resultId || '(holobionte result)';
  const evidence = adaptEvidence(holobionteResult.evidence, { claim: statement });

  // Ne jamais prétendre "verified" sans preuve formelle
  if (status === 'verified' && evidence.kind !== 'proof') {
    status = 'tested';
  }

  return { candidate: {
    resultId: holobionteResult.resultId || holobionteResult.id || `hresult-${Date.now()}`,
    canonicalStatement: statement,
    status,
    evidence,
    assumptions: canonicalizeAssumptions(holobionteResult.assumptions),
    validityDomain: canonicalizeValidityDomain(holobionteResult.validityDomain, statement),
    dependencies: canonicalizeDependencies(holobionteResult.dependencies),
    provenance: canonicalizeProvenance(holobionteResult.provenance, 'holobionte'),
    producer: canonicalizeProducer(holobionteResult.producer),
  } };
}

function immuneReproduction() {
  return { command: 'aeis:immune-review', environment: 'genos' };
}

function buildImmuneCandidate({ resultId, statement, status, verifierResults, blocked }) {
  return {
    resultId,
    canonicalStatement: statement,
    status,
    evidence: {
      kind: status === 'refuted' ? 'counterexample' : 'reproducible_artifact',
      content: { immuneStatus: status, verifierCount: verifierResults.length, blocked: blocked || false },
      reproduction: immuneReproduction(),
      reproductionProvided: false,
    },
    assumptions: [],
    validityDomain: { statement, constraints: [] },
    dependencies: [],
    provenance: {
      createdAt: new Date().toISOString(),
      actor: 'holobionte-immune',
      source: { type: 'holobionte', uri: 'genos://holobionte/immune', digest: sha256(JSON.stringify({ resultId, statement, status })) },
      inputs: [],
      transformations: ['immune-review'],
    },
    producer: { model: 'holobionte', version: '1.0' },
  };
}

function computeImmuneStatus(verifierResults) {
  for (const r of verifierResults) {
    if (r.status === 'refuted') return 'refuted';
    if (r.status === 'verified') return 'tested';
  }
  return 'conjecture';
}

function adaptImmuneResult(immuneResult, antigen) {
  if (!immuneResult || typeof immuneResult !== 'object') {
    return { error: 'immuneResult must be an object' };
  }

  const verifierResults = immuneResult.verifierResults?.results || [];
  const statement = immuneResult.canonicalStatement || (antigen && antigen.claim) || '(immune review)';
  const id = immuneResult.resultId || (antigen && antigen.id) || `immune-${Date.now()}`;

  const candidate = buildImmuneCandidate({ resultId: id, statement, status: computeImmuneStatus(verifierResults), verifierResults, blocked: immuneResult.blocked });
  candidate.assumptions = canonicalizeAssumptions(antigen?.epitopes?.assumptions);
  candidate.validityDomain = canonicalizeValidityDomain(antigen?.epitopes?.validityDomain, statement);

  return { candidate };
}

module.exports = {
  adaptHolobionteResult,
  adaptImmuneResult,
  mapStatus,
  mapEvidenceKind,
  HOLOBIONTE_TO_FORMAL_STATUS,
  HOLOBIONTE_TO_FORMAL_EVIDENCE_KIND,
};
