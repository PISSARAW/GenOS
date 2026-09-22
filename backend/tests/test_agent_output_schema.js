const assert = require('node:assert/strict');
const schemaService = require('../src/services/agentOutputSchemaService');
const modelProvider = require('../src/services/modelProvider');

let passed = 0;
let failed = 0;

function test(description, fn) {
  try {
    fn();
    passed++;
    console.log(`PASS: ${description}`);
  } catch (err) {
    failed++;
    console.error(`FAIL: ${description}`);
    console.error(err);
    process.exitCode = 1;
  }
}

async function testAsync(description, fn) {
  try {
    await fn();
    passed++;
    console.log(`PASS: ${description}`);
  } catch (err) {
    failed++;
    console.error(`FAIL: ${description}`);
    console.error(err);
    process.exitCode = 1;
  }
}

test('getSchema returns parsed schema object', () => {
  const schema = schemaService.getSchema();
  assert.ok(schema);
  assert.equal(typeof schema, 'object');
  assert.ok(schema.outcome);
  assert.ok(schema.claims !== undefined);
});

test('validateOutput accepts minimal valid output', () => {
  const output = {
    author: { name: 'agent', meaning: 'test' },
    outcome: 'success',
    claims: [{ statement: 'done', evidence: ['log'] }],
    uncertainties: [],
    tests: ['npm test: pass'],
    dossierInfluence: [],
    artifact: '',
    artifactText: '',
    creativeEvaluation: { rubric: {}, constraintCoverage: 0, revisions: [], criticEvidence: [] },
    failure: {},
    noAnswerProof: {},
  };
  const violations = schemaService.validateOutput(output);
  assert.deepEqual(violations, []);
});

test('validateOutput rejects missing required fields', () => {
  const output = { outcome: 'success' };
  const violations = schemaService.validateOutput(output);
  assert.ok(violations.length > 0);
  assert.ok(violations.some((v) => v.includes('missing required field')));
});

test('validateOutput rejects wrong type for claims', () => {
  const output = {
    author: { name: 'agent', meaning: 'test' },
    outcome: 'success',
    claims: 'not an array',
    uncertainties: [],
    tests: [],
    dossierInfluence: [],
    artifact: '',
    artifactText: '',
    creativeEvaluation: { rubric: {}, constraintCoverage: 0, revisions: [], criticEvidence: [] },
    failure: {},
    noAnswerProof: {},
  };
  const violations = schemaService.validateOutput(output);
  assert.ok(violations.some((v) => v.includes('claims') && v.includes('array')));
});

test('validateOutput rejects invalid enum for outcome', () => {
  const output = {
    author: { name: 'agent', meaning: 'test' },
    outcome: 'maybe',
    claims: [],
    uncertainties: [],
    tests: [],
    dossierInfluence: [],
    artifact: '',
    artifactText: '',
    creativeEvaluation: { rubric: {}, constraintCoverage: 0, revisions: [], criticEvidence: [] },
    failure: {},
    noAnswerProof: {},
  };
  const violations = schemaService.validateOutput(output);
  assert.ok(violations.some((v) => v.includes('outcome') && v.includes('success')));
});

test('parseAndValidate extracts JSON from markdown fence', () => {
  const raw = '```json\n{"author":{"name":"a","meaning":"b"},"outcome":"success","claims":[],"uncertainties":[],"tests":[],"dossierInfluence":[],"artifact":"","artifactText":"","creativeEvaluation":{"rubric":{},"constraintCoverage":0,"revisions":[],"criticEvidence":[]},"failure":{},"noAnswerProof":{}}\n```';
  const result = schemaService.parseAndValidate(raw);
  assert.equal(result.ok, true);
  assert.equal(result.output.outcome, 'success');
});

test('parseAndValidate extracts JSON with trailing text', () => {
  const raw = 'Here is my response:\n{"author":{"name":"a","meaning":"b"},"outcome":"failed","claims":[],"uncertainties":[],"tests":[],"dossierInfluence":[],"artifact":"","artifactText":"","creativeEvaluation":{"rubric":{},"constraintCoverage":0,"revisions":[],"criticEvidence":[]},"failure":{},"noAnswerProof":{}}\nDone.';
  const result = schemaService.parseAndValidate(raw);
  assert.equal(result.ok, true);
  assert.equal(result.output.outcome, 'failed');
});

test('parseAndValidate returns failure for no JSON', () => {
  const result = schemaService.parseAndValidate('no json here');
  assert.equal(result.ok, false);
  assert.equal(result.error, 'JSON_PARSE_FAILURE');
});

test('parseAndValidate returns violation for invalid JSON', () => {
  const raw = '{"outcome": "invalid_value"}';
  const result = schemaService.parseAndValidate(raw);
  assert.equal(result.ok, false);
  assert.equal(result.error, 'OUTPUT_SCHEMA_VIOLATION');
});

test('repairOutput fills missing fields with defaults', () => {
  const partial = {
    author: { name: 'agent', meaning: 'test' },
    outcome: 'success',
  };
  const repaired = schemaService.repairOutput(partial);
  assert.ok(Array.isArray(repaired.claims));
  assert.ok(Array.isArray(repaired.uncertainties));
  assert.ok(Array.isArray(repaired.tests));
  assert.ok(Array.isArray(repaired.dossierInfluence));
  assert.equal(typeof repaired.artifact, 'string');
  assert.equal(typeof repaired.artifactText, 'string');
  assert.equal(typeof repaired.creativeEvaluation, 'object');
  assert.equal(typeof repaired.failure, 'object');
  assert.equal(typeof repaired.noAnswerProof, 'object');
});

test('repairOutput normalizes invalid outcome to failed', () => {
  const broken = {
    author: { name: 'a', meaning: 'b' },
    outcome: 'maybe',
    claims: 'not array',
    uncertainties: 'single',
    tests: 'one',
  };
  const repaired = schemaService.repairOutput(broken);
  assert.equal(repaired.outcome, 'failed');
  assert.ok(Array.isArray(repaired.claims));
  assert.ok(Array.isArray(repaired.uncertainties));
  assert.ok(Array.isArray(repaired.tests));
});

test('validateOutput rejects non-object output', () => {
  assert.ok(schemaService.validateOutput('string').length > 0);
  assert.ok(schemaService.validateOutput(42).length > 0);
  assert.ok(schemaService.validateOutput(null).length > 0);
  assert.ok(schemaService.validateOutput([]).length > 0);
});

(async () => {
  await testAsync('model provider validates structured responses', async () => {
    const previousKey = process.env.OPENAI_API_KEY;
    const previousEndpoint = process.env.OPENAI_API_ENDPOINT;
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.OPENAI_API_ENDPOINT = 'http://127.0.0.1:9999/v1/chat/completions';
    const originalFetch = global.fetch;
    global.fetch = async () => ({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({
        choices: [{ message: {
          content: '{"author":{"name":"agent","meaning":"test"},"outcome":"success","claims":[{"statement":"done","evidence":["log"]}],"uncertainties":[],"tests":[],"dossierInfluence":[],"artifact":"","artifactText":"","creativeEvaluation":{"rubric":{},"constraintCoverage":0,"revisions":[],"criticEvidence":[]},"failure":{},"noAnswerProof":{}}'
        } }],
        usage: { input_tokens: 0, output_tokens: 0 }
      })
    });
    try {
      const result = await modelProvider.generate({
        model: 'openai://test-model',
        prompt: 'test',
        stream: false,
        responseFormat: 'json_object',
      });
      assert.deepEqual(result.structured.outcome, 'success');
      assert.equal(result.schemaViolation, undefined);
    } finally {
      global.fetch = originalFetch;
      if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = previousKey;
      if (previousEndpoint === undefined) delete process.env.OPENAI_API_ENDPOINT;
      else process.env.OPENAI_API_ENDPOINT = previousEndpoint;
    }
  });

  await testAsync('model provider attaches schemaViolation for unrepairable output', async () => {
    const previousKey = process.env.OPENAI_API_KEY;
    const previousEndpoint = process.env.OPENAI_API_ENDPOINT;
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.OPENAI_API_ENDPOINT = 'http://127.0.0.1:9999/v1/chat/completions';
    const originalFetch = global.fetch;
    global.fetch = async () => ({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({
        choices: [{ message: {
          content: '{"author":42,"outcome":"invalid"}'
        } }],
        usage: { input_tokens: 0, output_tokens: 0 }
      })
    });
    try {
      const result = await modelProvider.generate({
        model: 'openai://test-model',
        prompt: 'test',
        stream: false,
        responseFormat: 'json_object',
      });
      assert.ok(result.schemaViolation, 'schemaViolation should be present when repair fails');
      assert.equal(result.schemaViolation.error, 'OUTPUT_SCHEMA_VIOLATION');
      assert.ok(Array.isArray(result.schemaViolation.violations));
      assert.ok(result.schemaViolation.violations.length > 0);
    } finally {
      global.fetch = originalFetch;
      if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = previousKey;
      if (previousEndpoint === undefined) delete process.env.OPENAI_API_ENDPOINT;
      else process.env.OPENAI_API_ENDPOINT = previousEndpoint;
    }
  });

  console.log(`\n${passed} passed, ${failed} failed.`);
  console.log('All agent output schema tests completed.');
})();
