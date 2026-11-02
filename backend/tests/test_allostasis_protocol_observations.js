'use strict';

const assert = require('node:assert/strict');
const { digest } = require('../src/services/evidenceProtocol/canonical');
const { ObservationRegistry } = require('../src/services/allostasisProtocol/observations');
const f = require('./helpers/allostasisQualificationFixture');

async function messages(qualifier) {
  const captured = await qualifier.captureForecast({ forecastId: 'forecast-native', reportId: 'report-native', level: 'agent',
    unit: 'tokens', amount: 6, candidateId: 'native-forecast-1' });
  const report = f.message('REPORT_STATE', { payload: { report: captured.report } });
  const forecast = f.message('FORECAST_NEED', { payload: { forecast: captured.forecast }, causalRefs: [report.messageId] });
  return { report, forecast, query: { scope: f.SCOPE, missionId: 'mission-1', conversationId: 'conversation-1',
    forecastId: captured.forecast.forecastId, forecastDigest: digest(captured.forecast) } };
}

function registry(test, options = {}) {
  return new ObservationRegistry({ db: test.db, authorize: async () => true, clock: () => f.NOW,
    qualifyReport: ({ report }) => test.qualifier.qualifyReport(report),
    qualifyForecast: ({ forecast }) => test.qualifier.qualifyForecast(forecast), ...options });
}

async function realConversation() {
  const test = await f.setup();
  const observations = registry(test);
  try {
    const value = await messages(test.qualifier);
    assert.equal((await observations.apply(value.report)).status, 'reported');
    assert.equal((await observations.apply(value.forecast)).status, 'forecasted');
    const record = await observations.forecast(value.query);
    assert.deepEqual(record.forecast, value.forecast.payload.forecast);
    assert.equal(record.qualification.allocationAuthorized, false);
    assert.equal((await observations.apply(f.message('PRESSURE'))).allocationAuthorized, false);
    assert.equal((await observations.apply(value.forecast)).status, 'forecasted');
    const count = await test.db.get('SELECT COUNT(*) AS n FROM allostasis_observation_events');
    assert.equal(count.n, 3);
    await assert.rejects(observations.forecast({ ...value.query, missionId: 'foreign' }), /unavailable/);
    await f.seedNative(test.db, test.config, { energy: 0.5 });
    await assert.rejects(observations.forecast(value.query), /no longer matches/);
  } finally { test.close(); }
}

async function scopeAndCausality() {
  const test = await f.setup(); const observations = registry(test);
  try {
    const value = await messages(test.qualifier);
    await assert.rejects(observations.apply(value.forecast), /report binding/);
    await assert.rejects(observations.apply({ ...value.report, missionId: 'foreign' }), /scope or mission/);
    await observations.apply(value.report);
    await assert.rejects(observations.apply({ ...value.forecast, causalRefs: [] }), /must reference/);
    await assert.rejects(observations.apply({ ...value.forecast, sender: f.actor('another-client') }), /producer context/);
  } finally { test.close(); }
}

async function authorityAndAtomicJournal() {
  let granted = true;
  const test = await f.setup();
  const observations = registry(test, { authorize: async () => granted, qualifyReport: async ({ report }) => {
    const value = await test.qualifier.qualifyReport(report); granted = false; return value;
  } });
  try {
    const value = await messages(test.qualifier);
    await assert.rejects(observations.apply(value.report), /authority rejected/);
    assert.equal((await test.db.get('SELECT COUNT(*) AS n FROM allostasis_reports')).n, 0);
    assert.equal((await test.db.get('SELECT COUNT(*) AS n FROM allostasis_observation_events')).n, 0);
    granted = true;
    observations.qualifyReport = ({ report }) => test.qualifier.qualifyReport(report);
    await test.db.exec(`CREATE TEMP TRIGGER reject_observation_event BEFORE INSERT ON allostasis_observation_events
      BEGIN SELECT RAISE(ABORT,'injected observation journal failure'); END;`);
    await assert.rejects(observations.apply(value.report), /injected observation journal failure/);
    assert.equal((await test.db.get('SELECT COUNT(*) AS n FROM allostasis_reports')).n, 0);
  } finally { test.close(); }
}

async function main() {
  await realConversation(); await scopeAndCausality(); await authorityAndAtomicJournal();
  console.log('ALLOSTASIS report/forecast/pressure journal, pinned source freshness and atomic observation receipts: PASS');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
