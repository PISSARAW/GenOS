'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { digest } = require('../../src/services/evidenceProtocol/canonical');
const fixture = require('./synapseProcessFixtures.cjs');

const SCRIPT = "const fs=require('node:fs');const s=JSON.parse(fs.readFileSync('state.json','utf8'));if(s.P17.status!=='retracted'||s.C42.status!=='suspended'||s.D8.status!=='reevaluate')process.exit(1);process.stdout.write('explicit states checked');";
const RUNTIME = { version: process.version, executableDigest: digest(fs.readFileSync(process.execPath).toString('base64')) };
const ENVIRONMENT = Object.fromEntries(['SystemRoot', 'WINDIR'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
ENVIRONMENT.NODE_OPTIONS = '';
const QUALIFICATION = { environmentDigest: digest({ runtime: RUNTIME, environment: ENVIRONMENT }),
  policy: { policyId: 'epistemic-state-local-check', version: '1' }, predicateDigest: digest(SCRIPT) };

async function applied(runtime, request) {
  const receipt = await runtime.receipt(request.query);
  if (!receipt || receipt.status !== 'applied') throw new Error('No durable receiver application receipt.');
  return receipt;
}

function probe(value) {
  const parent = path.resolve(os.tmpdir());
  const directory = fs.mkdtempSync(path.join(parent, 'synapse-independent-check-'));
  try {
    fs.writeFileSync(path.join(directory, 'state.json'), JSON.stringify(value));
    const result = spawnSync(process.execPath, ['-e', SCRIPT],
      { cwd: directory, env: ENVIRONMENT, encoding: 'utf8', timeout: 5000, windowsHide: true });
    if (result.error) throw result.error;
    if (result.status !== 0 || result.stdout !== 'explicit states checked') throw new Error('Independent SYNAPSE state predicate failed.');
    return { exitCode: result.status, output: result.stdout };
  } finally {
    if (path.dirname(path.resolve(directory)) !== parent) throw new Error('Unsafe SYNAPSE proof cleanup.');
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

function providers(runtime, role) {
  const common = (request, status) => ({ status, requestDigest: digest(request) });
  return {
    resolveSubject: query => runtime.subject(query),
    observeTransport: async request => {
      const source = await applied(runtime, request);
      return { ...common(request, 'received'), sourceReceiptDigest: source.receiptDigest,
        receiptDigest: digest({ dimension: 'received', source }) };
    },
    verifyDecoded: async request => {
      const source = await applied(runtime, request);
      return { ...common(request, 'decoded'), contextDigest: request.subject.delta.contextDigest,
        operationsDigest: request.subject.delta.operationsDigest, sourceReceiptDigest: source.receiptDigest,
        receiptDigest: digest({ dimension: 'decoded', source }) };
    },
    verifyApplied: request => applied(runtime, request),
    verificationContext: () => QUALIFICATION,
    verifyEvidence: async request => {
      await applied(runtime, request);
      const query = { scope: request.query.scope, missionId: request.query.missionId,
        conversationId: request.query.conversationId, contextId: request.subject.context.contextId };
      const state = await runtime.state(query);
      if (state.stateDigest !== request.subject.delta.targetDigest) throw new Error('Independent predicate state is no longer the offered result.');
      const outcome = probe(state.value);
      return { ...common(request, 'verified'), ...QUALIFICATION, subjectDigest: request.subjectDigest,
        verifier: fixture.ACTORS[role], independence: { execution: true, provenance: false,
          method: false, statisticalIndependence: 'not_established' },
        receiptDigest: digest({ request, outcome, stateDigest: state.stateDigest }) };
    },
  };
}

module.exports = { providers };
