'use strict';

const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const schema = require('../../../../shared/allostasisProtocol.v1.schema.json');
const { canonicalize, digest } = require('../evidenceProtocol/canonical');
const { AllostasisProtocolError } = require('./contractError');

const PROTOCOL = 'genos.allostasis/v1';
const MESSAGE_TYPES = Object.freeze([...schema.properties.type.enum]);
const UNITS = Object.freeze([...schema.definitions.unit.enum]);
const LEVELS = Object.freeze([...schema.definitions.level.enum]);
const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);
const definition = name => ajv.compile({ $ref: `#/definitions/${name}`, definitions: schema.definitions });
const messageSchema = ajv.compile(schema);
const reportSchema = definition('report');
const forecastSchema = definition('forecast');
const allocationSchema = definition('allocation');

function copy(value) {
  try { return JSON.parse(canonicalize(value)); }
  catch (error) { throw new AllostasisProtocolError('ALLOSTASIS_JSON_INVALID', error.message); }
}

function checked(value, validator) {
  const result = copy(value);
  if (!validator(result)) throw new AllostasisProtocolError('ALLOSTASIS_SCHEMA_INVALID', `ALLOSTASIS contract: ${ajv.errorsText(validator.errors)}`);
  return result;
}

function timestamp(value) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new AllostasisProtocolError('ALLOSTASIS_TIME_INVALID', 'ALLOSTASIS timestamp cannot be represented.');
  return parsed;
}

function interval(source, now) {
  const start = timestamp(source.observedAt ?? source.producedAt ?? source.createdAt);
  const end = timestamp(source.validUntil ?? source.expiresAt);
  const current = typeof now === 'number' ? now : Date.parse(now);
  if (!Number.isFinite(current)) throw new AllostasisProtocolError('ALLOSTASIS_CLOCK_INVALID', 'ALLOSTASIS clock invalid.');
  if (end <= start) throw new AllostasisProtocolError('ALLOSTASIS_EXPIRY_INVALID', 'ALLOSTASIS validity must follow production.');
  if (start > current) throw new AllostasisProtocolError('ALLOSTASIS_FUTURE', 'ALLOSTASIS data is from the future.');
  if (end <= current) throw new AllostasisProtocolError('ALLOSTASIS_EXPIRED', 'ALLOSTASIS data expired.');
}

function uncertainty(value, amount) {
  if (value.kind !== 'interval') return;
  if (value.lower > value.upper || amount < value.lower || amount > value.upper) {
    throw new AllostasisProtocolError('ALLOSTASIS_UNCERTAINTY_INVALID', 'ALLOSTASIS uncertainty interval does not contain the quantity.');
  }
}

function validateReport(input, options = {}) {
  const report = checked(input, reportSchema);
  validateReportStatus(report);
  const metrics = report.measurements.map(item => item.metricId);
  if (new Set(metrics).size !== metrics.length) throw new AllostasisProtocolError('ALLOSTASIS_REPORT_INVALID', 'ALLOSTASIS duplicate metric identity.');
  if (report.status === 'available') interval(report, options.now ?? Date.now());
  if (report.observedAt !== null) timestamp(report.observedAt);
  if (report.validUntil !== null) timestamp(report.validUntil);
  if (report.status === 'available' && report.measurements.some(item => item.value === null)) {
    throw new AllostasisProtocolError('ALLOSTASIS_REPORT_INVALID', 'ALLOSTASIS available report has unknown measurement.');
  }
  report.measurements.forEach(validateMeasurement);
  return report;
}

function validateReportStatus(report) {
  if (report.status === 'available' && (!report.measurements.length || report.reasons.length)) {
    throw new AllostasisProtocolError('ALLOSTASIS_REPORT_INVALID', 'ALLOSTASIS available report requires measurements without unavailable reasons.');
  }
  if (report.status === 'unavailable' && !report.reasons.length) {
    throw new AllostasisProtocolError('ALLOSTASIS_REPORT_INVALID', 'ALLOSTASIS unavailable report requires an explicit reason.');
  }
  if (report.subject.level !== report.nativeSnapshot.level) {
    throw new AllostasisProtocolError('ALLOSTASIS_REPORT_INVALID', 'ALLOSTASIS report and native source levels differ.');
  }
}

function validateMeasurement(item) {
  if (item.value === null && item.uncertainty.kind !== 'unknown') {
    throw new AllostasisProtocolError('ALLOSTASIS_UNCERTAINTY_INVALID', 'ALLOSTASIS missing values have unknown uncertainty.');
  }
  if (item.unit === 'ratio_ppm' && item.value > 1000000) {
    throw new AllostasisProtocolError('ALLOSTASIS_REPORT_INVALID', 'ALLOSTASIS ratio exceeds its declared scale.');
  }
  uncertainty(item.uncertainty, item.value);
  quantization(item);
}

function quantization(item) {
  if (item.unit !== 'ratio_ppm') {
    if (item.quantization !== null) throw new AllostasisProtocolError('ALLOSTASIS_REPORT_INVALID', 'ALLOSTASIS resource quantities cannot be ratio-quantized.');
    return;
  }
  if (item.value === null) return;
  const quantized = item.quantization;
  if (!quantized || item.value !== Math.floor(quantized.rawValue * 1000000)
    || quantized.lower !== item.value || quantized.upper !== Math.ceil(quantized.rawValue * 1000000)) {
    throw new AllostasisProtocolError('ALLOSTASIS_REPORT_INVALID', 'ALLOSTASIS ratio quantization does not bind the declared native value.');
  }
}

function validateForecast(input, options = {}) {
  const forecast = checked(input, forecastSchema);
  interval(forecast, options.now ?? Date.now());
  uncertainty(forecast.uncertainty, forecast.amount);
  return forecast;
}

function validateAllocation(input) {
  const allocation = checked(input, allocationSchema);
  timestamp(allocation.expiresAt);
  return allocation;
}

function validateMessage(input, options = {}) {
  const message = checked(input, messageSchema);
  interval(message, options.now ?? Date.now());
  if (message.payloadDigest !== digest(message.payload)) throw new AllostasisProtocolError('ALLOSTASIS_INTEGRITY', 'ALLOSTASIS payload digest mismatch.');
  const payload = message.payload;
  if (message.type === 'REPORT_STATE') validateReport(payload.report, options);
  if (message.type === 'FORECAST_NEED') validateForecast(payload.forecast, options);
  if (message.type === 'GRANT') {
    validateAllocation(payload.allocation);
    if (digest(payload.allocation) !== payload.allocationDigest) throw new AllostasisProtocolError('ALLOSTASIS_INTEGRITY', 'ALLOSTASIS allocation digest mismatch.');
  }
  return message;
}

function createMessage(fields, options = {}) {
  const value = copy(fields);
  return validateMessage({ ...value, protocol: PROTOCOL, payloadDigest: digest(value.payload) }, options);
}

module.exports = { PROTOCOL, MESSAGE_TYPES, UNITS, LEVELS, AllostasisProtocolError, createMessage,
  validateMessage, validateReport, validateForecast, validateAllocation, timestamp, uncertainty };
