'use strict';

const assert = require('node:assert/strict');
const persistence = require('../src/services/agow/agowStatePersistenceService');
const scopeService = require('../src/services/agow/allostaticScopeService');
const regret = require('../src/services/agow/allostaticRegretAdapter');
const { createStateQualifier } = require('../src/services/allostasisProtocol/qualification');
const f = require('./helpers/allostasisQualificationFixture');

async function actualNativeScopes() {
  const test = await f.setup();
  try {
    for (const level of Object.keys(scopeService.SCOPES)) {
      const result = await test.qualifier.capture({ reportId: `report-${level}`, level });
      assert.equal(result.available, true); assert.equal(result.allocationAuthorized, false);
      assert.equal(result.report.subject.subjectId, test.config.subjectBindings[level]);
      assert.equal(result.report.nativeSnapshot.storageScope, scopeService.SCOPES[level]);
      assert.equal(result.report.measurements[0].value, 750000);
      assert.equal(result.report.measurements[0].quantization.rawValue, 0.75);
      assert.equal(result.report.measurements[0].uncertainty.kind, 'unknown');
      assert.deepEqual((await test.qualifier.qualifyReport(result.report)).report, result.report);
    }
    await assert.rejects(test.qualifier.capture({ reportId: 'bad', level: 'agent', sourceAgentId: 'foreign' }), /override/);
    const foreign = { ...test.config, sourceAgentId: 'foreign' };
    assert.throws(() => createStateQualifier(foreign), /pinned consistently/);
  } finally { test.close(); }
}

async function absentAndStaleRemainUnknown() {
  let now = f.NOW;
  const test = await f.setup({ config: { clock: () => now } });
  try {
    await test.db.run('DELETE FROM adaptive_state WHERE scope=? AND key=?', scopeService.SCOPES.agent, 'client-a');
    let result = await test.qualifier.capture({ reportId: 'missing', level: 'agent' });
    assert.equal(result.available, false); assert.equal(result.report.observedAt, null);
    assert.equal(result.report.measurements[0].value, null);
    await persistence.save({ db: test.db, scope: scopeService.SCOPES.agent, agentId: 'client-a', state: { variables: { energy: 0.5 } } });
    result = await test.qualifier.capture({ reportId: 'no-time', level: 'agent' });
    assert.equal(result.available, false); assert.equal(result.report.measurements[0].value, null);
    await f.seedNative(test.db, test.config);
    now = '2026-11-02T10:01:00.000Z';
    result = await test.qualifier.capture({ reportId: 'stale', level: 'agent' });
    assert.equal(result.available, false); assert.ok(result.reasons.includes('native_state_stale'));
    assert.equal(result.report.measurements[0].value, null);
  } finally { test.close(); }
}

async function exactIntegerAndTraceableRatio() {
  const test = await f.setup({ seed: { energy: 1 / 3 } });
  try {
    const result = await test.qualifier.capture({ reportId: 'ratio', level: 'agent' });
    const quantization = result.report.measurements[0].quantization;
    assert.equal(quantization.lower, 333333); assert.equal(quantization.upper, 333334);
    assert.equal(result.report.nativeSnapshot.rawState.variables.energy, 1 / 3);
    const bindings = [{ metricId: 'observedTokens', level: 'agent', field: 'observedTokens', unit: 'tokens', kind: 'integer' }];
    const qualifier = createStateQualifier({ ...test.config, metricBindings: bindings });
    await persistence.save({ db: test.db, scope: scopeService.SCOPES.agent, agentId: 'client-a', state: {
      variables: { observedTokens: 7 }, measuredAt: Date.parse(f.NOW), evidenceRefs: ['fixture:counter'] } });
    const integer = await qualifier.capture({ reportId: 'integer', level: 'agent' });
    assert.equal(integer.report.measurements[0].value, 7); assert.equal(integer.report.measurements[0].quantization, null);
    await persistence.save({ db: test.db, scope: scopeService.SCOPES.agent, agentId: 'client-a', state: {
      variables: { observedTokens: 7.5 }, measuredAt: Date.parse(f.NOW), evidenceRefs: ['fixture:fractional'] } });
    const fraction = await qualifier.capture({ reportId: 'fraction', level: 'agent' });
    assert.equal(fraction.available, false); assert.equal(fraction.report.measurements[0].value, null);
  } finally { test.close(); }
}

async function actualNativeForecast() {
  const test = await f.setup();
  try {
    const input = { forecastId: 'forecast-native', reportId: 'report-native', level: 'agent', unit: 'tokens', amount: 6, candidateId: test.candidate.candidateId };
    const result = await test.qualifier.captureForecast(input);
    assert.equal(result.available, true); assert.equal(result.allocationAuthorized, false);
    assert.equal(result.forecast.demandSource, 'declared');
    assert.deepEqual(result.forecast.horizon, { unit: 'cycles', amount: 3 });
    const levels = await scopeService.resolve({ db: test.db, agentId: test.config.sourceAgentId });
    assert.deepEqual(result.forecast.nativeAssessment, regret.evaluate(test.candidate, { allostaticLevels: levels }));
    assert.deepEqual((await test.qualifier.qualifyForecast(result.forecast)).forecast, result.forecast);
    await assert.rejects(test.qualifier.captureForecast({ ...input, level: 'organization' }), /agent-only/);
    const invalid = { ...result.forecast, amount: 7 };
    assert.equal((await test.qualifier.qualifyForecast(invalid)).forecast.amount, 7, 'Resource need is a declaration, never inferred from utility.');
  } finally { test.close(); }
}

async function changedSourceAndIdentity() {
  const test = await f.setup();
  try {
    const result = await test.qualifier.capture({ reportId: 'report', level: 'agent' });
    await f.seedNative(test.db, test.config, { energy: 0.5 });
    await assert.rejects(test.qualifier.qualifyReport(result.report), /differs from the pinned/);
    test.qualifier.loadCandidate = async () => ({ ...test.candidate, agentId: 'someone-else' });
    await assert.rejects(test.qualifier.captureForecast({ forecastId: 'f', reportId: 'r', level: 'agent', unit: 'tokens', amount: 1,
      candidateId: test.candidate.candidateId }), /candidate identity/);
  } finally { test.close(); }
}

async function main() {
  await actualNativeScopes();
  await absentAndStaleRemainUnknown();
  await exactIntegerAndTraceableRatio();
  await actualNativeForecast();
  await changedSourceAndIdentity();
  console.log('ALLOSTASIS actual persisted AGOW scopes, explicit unavailable values and native forecast qualification: PASS');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
