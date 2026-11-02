'use strict';

const { withTransaction } = require('../../db');
const { digest } = require('../evidenceProtocol/canonical');
const { validateMessage, validateReport, validateForecast } = require('./contract');
const { ObservationStore } = require('./observationStore');
const c = require('./qualificationConfig');
const v = require('./observationBindings');

class ObservationRegistry {
  constructor(options) {
    for (const name of ['authorize', 'qualifyReport', 'qualifyForecast']) {
      if (typeof options[name] !== 'function') c.fail(`ALLOSTASIS observation ${name} callback required.`);
    }
    this.db = options.db;
    this.authorize = options.authorize;
    this.qualifyReport = options.qualifyReport;
    this.qualifyForecast = options.qualifyForecast;
    this.clock = options.clock || (() => Date.now());
    this.store = new ObservationStore(this.db);
    this.ready = withTransaction(this.db, () => this.store.initialize());
  }

  async allowed(operation, request) {
    if (await this.authorize(c.frozen({ operation, request })) !== true) throw new Error('ALLOSTASIS observation authority rejected or revoked.');
  }

  async qualify(message, kind) {
    const value = message.payload[kind];
    const provider = kind === 'report' ? this.qualifyReport : this.qualifyForecast;
    const request = { message, [kind]: value, query: v.query(message, value, kind) };
    return v.qualified(value, await provider(c.frozen(request)), kind);
  }

  async apply(input) {
    await this.ready;
    const message = validateMessage(input, { now: c.now(this.clock) });
    if (!['REPORT_STATE', 'FORECAST_NEED', 'PRESSURE'].includes(message.type)) c.fail('ALLOSTASIS observation message unsupported.');
    await this.allowed('APPLY', message);
    return withTransaction(this.db, async () => {
      await this.allowed('APPLY', message);
      validateMessage(message, { now: c.now(this.clock) });
      const replay = await this.store.replay(message);
      if (replay) return replay;
      const result = message.type === 'PRESSURE' ? await this.pressure(message) : await this.observe(message);
      validateMessage(message, { now: c.now(this.clock) });
      await this.store.record(message, result);
      return result;
    });
  }

  async pressure(message) {
    await this.allowed('APPLY', message);
    return { status: 'pressure', budgetId: message.payload.budgetId, unit: message.payload.unit, allocationAuthorized: false };
  }

  async observe(message) {
    const kind = message.type === 'REPORT_STATE' ? 'report' : 'forecast';
    const value = message.payload[kind];
    v.scope(message, value);
    const query = v.query(message, value, kind);
    if (await this.store.read(query, kind)) c.fail('ALLOSTASIS observation identity already exists; replay its original message.');
    let prior;
    if (kind === 'forecast') {
      prior = await this.store.read({ ...query, reportId: value.reportId }, 'report');
      v.forecastBinding(message, prior);
      await this.qualify(prior.message, 'report');
    }
    const qualification = await this.qualify(message, kind);
    await this.allowed('APPLY', message);
    validateMessage(message, { now: c.now(this.clock) });
    if (prior) validateMessage(prior.message, { now: c.now(this.clock) });
    await this.store.write(query, kind, { [kind]: value, report: prior?.report || (kind === 'report' ? value : null), message, qualification });
    return { status: kind === 'report' ? 'reported' : 'forecasted', ...query, allocationAuthorized: false };
  }

  async forecast(input) {
    await this.ready;
    const query = v.forecastQuery(input);
    await this.allowed('FORECAST', query);
    return withTransaction(this.db, async () => {
      await this.allowed('FORECAST', query);
      const state = await this.store.read(query, 'forecast');
      if (!state || digest(state.forecast) !== query.forecastDigest) c.fail('ALLOSTASIS scoped forecast unavailable.');
      validateForecast(state.forecast, { now: c.now(this.clock) });
      validateReport(state.report, { now: c.now(this.clock) });
      const qualification = await this.qualify(state.message, 'forecast');
      await this.allowed('FORECAST', query);
      validateMessage(state.message, { now: c.now(this.clock) });
      return { forecast: state.forecast, report: state.report, message: state.message, qualification };
    });
  }
}

module.exports = { ObservationRegistry };
