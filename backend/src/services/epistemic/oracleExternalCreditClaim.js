'use strict';

const { createFormalResult } = require('../formalResultService');
const subjectStore = require('./oracleExternalCreditSubject');
const STATEMENT = 'The scoped external credit refill and fresh provider balance are valid.';
const DOMAIN = { statement: 'A supervised recovery worker replenishes a scoped external credit account. ',
  constraints: ['The provider signature verifies.', 'The lease binds target, amount, version and operation.',
    'A fresh independent signed balance matches the refill receipt and restores the functional lower bound.'] };

function build(input) {
  const { subject, workspaceRoot } = input;
  const producer = { model: 'external-credit-provider-oracle', version: '1',
    actorId: subject.content.workerId, strategy: 'signed-provider-proof', workspaceId: workspaceRoot };
  const formal = createFormalResult({ canonicalStatement: STATEMENT, status: 'tested', assumptions: [],
    validityDomain: DOMAIN, dependencies: [], producer,
    evidence: { kind: 'reproducible_artifact', content: subject.content,
      reproduction: { command: 'genos:native-external-credit-oracle', environment: process.version } },
    provenance: { createdAt: new Date().toISOString(), actor: subject.content.workerId,
      source: { type: 'provider-signed-run', uri: `genos://runs/${subject.content.runId}`, digest: `sha256:${subject.contentHash}` },
      inputs: [], transformations: ['sealed-provider-receipt-to-independent-signature-and-ledger-checks'] } });
  return { id: formal.resultId, claim: formal.canonicalStatement, formalResult: formal,
    epitopes: { evidence: { digest: formal.evidence.digest } }, producer };
}

module.exports = { STATEMENT, DOMAIN, build, assertAntigen: subjectStore.assertAntigen };
