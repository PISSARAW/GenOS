'use strict';

const { createFormalResult } = require('../formalResultService');
const subjects = require('./oracleMemorySubject');
const values = require('../trinityProvenanceValues');

function build({ subject }) {
  const producer = { model: 'promotion-memory-compiler', version: '1', actorId: subject.content.source.agentId,
    strategy: 'report-to-memory', workspaceId: subject.binding.workspaceRoot };
  const formal = createFormalResult({ canonicalStatement: subjects.STATEMENT, status: 'tested', assumptions: [],
    validityDomain: subjects.DOMAIN, dependencies: [], producer,
    evidence: { kind: 'reproducible_artifact', content: subject.content,
      reproduction: { command: 'genos:promotion-memory-oracle', environment: process.version } },
    provenance: { createdAt: new Date().toISOString(), actor: producer.actorId,
      source: { type: 'promotion-memory', uri: `genos://memories/${subject.content.memory.id}`,
        digest: `sha256:${values.digest(subject.binding)}` },
      inputs: [], transformations: ['recorded-promotion-to-memory-fidelity'] } });
  return { id: formal.resultId, claim: formal.canonicalStatement, formalResult: formal, producer,
    epitopes: { evidence: { digest: formal.evidence.digest } } };
}

module.exports = { build };
