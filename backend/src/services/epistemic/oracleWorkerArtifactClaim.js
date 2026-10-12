'use strict';

const { createFormalResult } = require('../formalResultService');
const store = require('./oracleWorkerArtifactSubject');
const STATEMENT = 'The native worker artifact matches its sealed kind, method and evidence contract.';
const DOMAIN = { statement: 'A deterministic GenOS worker returns evidence conforming to its sealed native contract.',
  constraints: ['The biological run binding identifies the worker and its method.',
    'The artifact type, required content and provenance satisfy the worker kind contract.',
    'The artifact provenance and report claims are bound to the persisted evidence report.'] };

function build({ subject, workspaceRoot }) {
  const formal = createFormalResult({ canonicalStatement: STATEMENT, status: 'tested', assumptions: [],
    validityDomain: DOMAIN, dependencies: [],
    producer: { model: 'genos-native-worker-artifact-oracle', version: '1',
      actorId: subject.content.workerId, strategy: 'sealed-artifact-contract', workspaceId: workspaceRoot },
    evidence: { kind: 'reproducible_artifact', content: subject.content,
      reproduction: { command: 'genos:native-worker-artifact-oracle', environment: process.version } },
    provenance: { createdAt: new Date().toISOString(), actor: subject.content.workerId,
      source: { type: 'sealed-worker-run', uri: `genos://runs/${subject.content.runId}`,
        digest: `sha256:${subject.contentHash}` }, inputs: [],
      transformations: ['sealed-method-to-typed-artifact-and-provenance-validation'] } });
  return { id: formal.resultId, claim: formal.canonicalStatement, formalResult: formal,
    epitopes: { evidence: { digest: formal.evidence.digest } }, producer: formal.producer };
}

module.exports = { STATEMENT, DOMAIN, build, assertAntigen: store.assertAntigen };
