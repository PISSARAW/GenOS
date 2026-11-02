'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { digest } = require('../../src/services/evidenceProtocol/canonical');
const { EvidenceConversation } = require('../../src/services/evidenceProtocol/conversation');
const { EvidenceRevision } = require('../../src/services/evidenceProtocol/revision');
const { SUBJECT, POLICY, CANDIDATE, claim: fixtureClaim } = require('./evidenceProcessFixtures.cjs');

const directory = process.argv[2];

function probe(input) {
  const artifact = fs.readFileSync(path.join(directory, 'candidate.cjs'), 'utf8');
  if (artifact !== CANDIDATE) throw new Error('Demo artifact no longer matches trusted candidate.');
  fs.writeFileSync(path.join(directory, 'input.json'), JSON.stringify(input));
  const result = spawnSync(process.execPath, ['probe.cjs'], { cwd: directory, timeout: 5000 });
  if (result.error) throw result.error;
  return result.status;
}

function authorize(message) {
  return message.authority.authorityId === 'demo-authority' && message.authority.generation === 1 &&
    message.sender.trustDomain === 'local-demo' &&
    ['producer', 'consumer-1', 'consumer-2', 'consumer-3'].includes(message.sender.agentId);
}

function verifyEvidence({ claim }) {
  validateBinding(claim);
  if (probe(0) !== 0) {
    throw new Error('Demo predicate failed.');
  }
  return { status: 'validated', claimDigest: digest(claim), subject: claim.subject,
    policy: claim.policy, receiptDigest: digest({ claimId: claim.claimId, input: 0, exitCode: 0 }) };
}

function validateBinding(claim) {
  const subject = {
    artifactDigest: digest(fs.readFileSync(path.join(directory, 'candidate.cjs'), 'utf8')),
    baseDigest: digest(fs.readFileSync(path.join(directory, 'base.txt'), 'utf8')),
    environmentDigest: digest({ node: process.version,
      probe: fs.readFileSync(path.join(directory, 'probe.cjs'), 'utf8') }),
  };
  const expected = fixtureClaim();
  const actual = [subject, claim.subject, claim.predicate, claim.domain];
  const trusted = [SUBJECT, SUBJECT, expected.predicate, expected.domain];
  if (digest(actual) !== digest(trusted)) throw new Error('Demo binding mismatch.');
}

function verifyCounterexample(request) {
  validateBinding(conversation.claim(request.targetId).claim);
  if (request.counterexampleResultId !== 'input-negative-one' || probe(-1) !== 1) {
    throw new Error('Demo counterexample not reproduced.');
  }
  return { ...request, status: 'validated', receiptDigest: digest({ ...request, input: -1, exitCode: 1 }) };
}

const conversation = new EvidenceConversation({ dbPath: path.join(directory, 'evidence.sqlite'),
  authorize, verifyEvidence, acceptPolicy: ({ claim }) => digest(claim.policy) === digest(POLICY) });
new EvidenceRevision({ conversation, verifyCounterexample });

async function dispatch(request) {
  if (request.action === 'apply') return conversation.apply(request.value);
  if (request.action === 'promote') return conversation.canPromote(request.value);
  if (request.action === 'claim') return conversation.claim(request.value);
  if (request.action === 'history') return conversation.history();
  throw new Error('Unknown demo action.');
}

let queue = Promise.resolve();
process.on('message', request => {
  queue = queue.then(async () => {
    try { process.send({ id: request.id, value: await dispatch(request) }); }
    catch (error) { process.send({ id: request.id, error: error.message }); }
  });
});
process.on('disconnect', () => { conversation.close(); process.exit(0); });
process.send({ ready: true, pid: process.pid });
