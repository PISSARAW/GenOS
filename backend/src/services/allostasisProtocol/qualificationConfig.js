'use strict';

const { canonicalize, digest } = require('../evidenceProtocol/canonical');
const { LEVELS, UNITS, AllostasisProtocolError } = require('./contract');

const copy = value => JSON.parse(canonicalize(value));
const fail = message => { throw new AllostasisProtocolError('ALLOSTASIS_QUALIFICATION_INVALID', message); };
const same = (left, right) => digest(left) === digest(right);

function freeze(value) {
  for (const child of Object.values(value)) {
    if (child && typeof child === 'object') freeze(child);
  }
  return Object.freeze(value);
}

const frozen = value => freeze(copy(value));

function text(value) {
  if (typeof value !== 'string' || !value || value !== value.trim() || value.length > 512) fail('ALLOSTASIS pinned identity invalid.');
}

function exact(value, required, optional = []) {
  const allowed = new Set([...required, ...optional]);
  if (!value || required.some(key => !Object.hasOwn(value, key)) || Object.keys(value).some(key => !allowed.has(key))) {
    fail('ALLOSTASIS unsupported fields cannot override the pinned source configuration.');
  }
}

function binding(entry) {
  ['metricId', 'field'].forEach(key => text(entry[key]));
  if (!LEVELS.includes(entry.level)) fail('ALLOSTASIS metric level unknown.');
  if (entry.kind === 'ratio' && entry.unit === 'ratio_ppm') return;
  if (entry.kind === 'integer' && UNITS.includes(entry.unit)) return;
  fail('ALLOSTASIS explicit integer resource or ratio-ppm mapping required.');
}

function configuration(options) {
  const config = copy({ sourceAgentId: options.sourceAgentId, scope: options.scope, missionId: options.missionId,
    subjectBindings: options.subjectBindings, metricBindings: options.metricBindings,
    maxAgeMs: options.maxAgeMs ?? 60000 });
  [config.sourceAgentId, config.scope.organizationId, config.scope.projectId, config.missionId].forEach(text);
  for (const level of LEVELS) text(config.subjectBindings[level]);
  if (config.subjectBindings.agent !== config.sourceAgentId || config.subjectBindings.mission !== config.missionId
    || config.subjectBindings.organization !== config.scope.organizationId) fail('ALLOSTASIS source and subject identities are not pinned consistently.');
  if (!Number.isSafeInteger(config.maxAgeMs) || config.maxAgeMs < 1) fail('ALLOSTASIS freshness bound invalid.');
  validateMetrics(config.metricBindings);
  return config;
}

function validateMetrics(entries) {
  if (!Array.isArray(entries) || !entries.length || entries.length > 128) fail('ALLOSTASIS bounded local metric mappings required.');
  entries.forEach(binding);
  const keys = entries.map(entry => digest([entry.level, entry.metricId]));
  if (new Set(keys).size !== keys.length) fail('ALLOSTASIS duplicate metric mapping.');
}

function now(clock) {
  const value = clock();
  const time = typeof value === 'number' ? value : Date.parse(value);
  if (!Number.isSafeInteger(time) || !Number.isFinite(new Date(time).getTime())) fail('ALLOSTASIS local clock invalid.');
  return time;
}

function iso(time) {
  if (!Number.isSafeInteger(time) || !Number.isFinite(new Date(time).getTime())) fail('ALLOSTASIS source timestamp invalid.');
  return new Date(time).toISOString();
}

function subject(config, level) {
  if (!LEVELS.includes(level)) fail('ALLOSTASIS requested level unsupported.');
  return { level, subjectId: config.subjectBindings[level] };
}

module.exports = { copy, frozen, fail, same, text, exact, configuration, now, iso, subject };
