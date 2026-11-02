'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { digest } = require('../../src/services/evidenceProtocol/canonical');
const { createMessage } = require('../../src/services/evidenceProtocol/contract');

const CANDIDATE = 'module.exports = n => n === -1 ? 99 : n + 1;\n';
const PROBE = "const fs = require('node:fs'); const f = require('./candidate.cjs'); const n = JSON.parse(fs.readFileSync('input.json')); process.exit(f(n) === n + 1 ? 0 : 1);\n";
const SUBJECT = { artifactDigest: digest(CANDIDATE), baseDigest: digest('base-v1'),
  environmentDigest: digest({ node: process.version, probe: PROBE }) };
const POLICY = { policyId: 'process-demo', version: '1' };
const GENERATIONS = { incarnation: 1, organization: 1, workspace: 1 };

function prepare(directory) {
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'candidate.cjs'), CANDIDATE);
  fs.writeFileSync(path.join(directory, 'probe.cjs'), PROBE);
  fs.writeFileSync(path.join(directory, 'base.txt'), 'base-v1');
  fs.writeFileSync(path.join(directory, 'input.json'), '0');
}

function claim(id = 'root', dependencies = []) {
  return { claimId: id, subject: SUBJECT,
    predicate: { command: 'node probe.cjs', expectedExitCode: 0 },
    assumptions: ['External input.json is declared, not content-addressed; acceptance is revocable.'],
    domain: { fingerprint: digest('integer-inputs'), description: 'Integer inputs to candidate' },
    evidence: ['probe:input=0'], obligations: ['recheck-on-counterexample'],
    provenance: { producerId: 'producer', sourceRefs: ['candidate.cjs', 'probe.cjs'] },
    dependencies, policy: POLICY };
}

function message(type, payload, options = {}) {
  const id = options.id || `${payload.claimId || payload.claim.claimId}:${type}`;
  return createMessage({ messageId: id, operationId: id, missionId: 'evidence-process-demo',
    conversationId: 'evidence-process-demo', type,
    sender: { agentId: options.sender || 'producer', incarnationId: 'demo-1', trustDomain: 'local-demo' },
    scope: { organizationId: 'demo', projectId: 'evidence' },
    causalRefs: options.causes || [], generations: GENERATIONS,
    authority: { authorityId: 'demo-authority', generation: 1 }, idempotencyKey: id,
    createdAt: '2026-11-02T00:00:00.000Z', expiresAt: '2099-01-01T00:00:00.000Z', payload });
}

function promotion(claimId = 'root') {
  return { claimId, subject: SUBJECT, policy: POLICY, generations: GENERATIONS,
    scope: { organizationId: 'demo', projectId: 'evidence' },
    missionId: 'evidence-process-demo', conversationId: 'evidence-process-demo' };
}

module.exports = { prepare, claim, message, promotion, SUBJECT, POLICY, CANDIDATE };
