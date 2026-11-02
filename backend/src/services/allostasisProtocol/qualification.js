'use strict';

const { withTransaction } = require('../../db');
const scopeService = require('../agow/allostaticScopeService');
const persistence = require('../agow/agowStatePersistenceService');
const { digest } = require('../evidenceProtocol/canonical');
const { validateReport, validateForecast } = require('./contract');
const c = require('./qualificationConfig');
const { makeReport } = require('./qualificationMeasures');
const forecastService = require('./qualificationForecast');

class StateQualifier {
  constructor(options) {
    for (const name of ['exec', 'get', 'all', 'run']) {
      if (typeof options.db?.[name] !== 'function') c.fail('ALLOSTASIS native SQLite connection required.');
    }
    this.db = options.db;
    this.config = c.frozen(c.configuration(options));
    this.clock = options.clock || (() => Date.now());
    this.loadCandidate = options.loadCandidate;
  }

  capture(input) {
    const request = c.copy(input);
    return withTransaction(this.db, () => this.captureSnapshot(request));
  }

  async captureSnapshot(input) {
    c.exact(input, ['reportId', 'level']);
    c.text(input.reportId);
    c.subject(this.config, input.level);
    const levels = await scopeService.resolve({ db: this.db, agentId: this.config.sourceAgentId });
    const storageScope = scopeService.SCOPES[input.level];
    const stored = await persistence.load({ db: this.db, scope: storageScope, agentId: this.config.sourceAgentId });
    const normalized = scopeService.normalizeLevel(stored.state);
    if (!c.same(normalized, levels[input.level])) c.fail('ALLOSTASIS native source changed during capture.');
    const snapshot = { service: 'agow.allostaticScopeService/v1', sourceAgentId: this.config.sourceAgentId,
      storageScope, level: input.level, rawState: stored.state, scopeState: normalized };
    const report = makeReport({ config: this.config, snapshot, current: c.now(this.clock), reportId: input.reportId });
    validateReport(report, { now: c.now(this.clock) });
    return { available: report.status === 'available', report, reportDigest: digest(report),
      reasons: report.reasons, allocationAuthorized: false, levels };
  }

  qualifyReport(input) {
    const report = c.copy(input);
    return withTransaction(this.db, async () => {
      validateReport(report, { now: c.now(this.clock) });
      const local = await this.captureSnapshot({ reportId: report.reportId, level: report.subject.level });
      if (!c.same(report, local.report)) c.fail('ALLOSTASIS offered report differs from the pinned current native source.');
      return local;
    });
  }

  captureForecast(input) {
    const request = c.copy(input);
    return withTransaction(this.db, () => forecastService.capture(this, request));
  }

  qualifyForecast(input) {
    const forecast = c.copy(input);
    return withTransaction(this.db, async () => {
      validateForecast(forecast, { now: c.now(this.clock) });
      const local = await forecastService.capture(this, { forecastId: forecast.forecastId, reportId: forecast.reportId,
        level: forecast.subject.level, unit: forecast.unit, amount: forecast.amount,
        candidateId: forecast.nativeCandidate.candidateId, uncertainty: forecast.uncertainty });
      if (!local.available || !c.same(forecast, local.forecast)) c.fail('ALLOSTASIS forecast no longer matches the pinned native source.');
      return local;
    });
  }
}

const createStateQualifier = options => new StateQualifier(options);

module.exports = { StateQualifier, createStateQualifier };
