'use strict';

const crypto = require('node:crypto');
const Ajv = require('ajv');
const FORMAT = 'genos.daemon-allocation-observation/v1';

function workspace(contract) {
  const assigned = contract?.assignment?.workspaceVerificationContract;
  if (contract?.identity?.workerKind !== 'resident_daemon'
      || assigned?.kind !== 'resource_allocation' || assigned.mode !== 'observation') return null;
  require('../epistemic/workspaceVerificationContract').assertContract(assigned);
  return assigned;
}

function object(properties, required = Object.keys(properties)) {
  return { type: 'object', properties, required, additionalProperties: false };
}

function references(assigned) {
  const refs = assigned.sources.filter(source => !source.mutable).map(source => `sha256:${source.sha256}`);
  const unique = [...new Set(refs)];
  return { type: 'array', minItems: unique.length, maxItems: unique.length,
    uniqueItems: true, items: { type: 'string', enum: unique } };
}

function responseFormat(contract) {
  const assigned = workspace(contract);
  if (!assigned) return null;
  const refs = references(assigned);
  const integer = { type: 'integer', minimum: 0, maximum: 24000000 };
  const uncertainties = { type: 'array', maxItems: 4, items: { type: 'string', minLength: 1, maxLength: 400 } };
  const common = { schema: { const: FORMAT }, uncertainties };
  const success = object({ ...common, outcome: { const: 'success' },
    observation: object({ observedSum: integer, target: integer, anomaly: { type: 'boolean' } }),
    evidence: refs, territoryReport: object({ territoryId: { const: assigned.files.allocation },
      observedAt: { type: 'string', minLength: 20, maxLength: 35,
        pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,9})?Z$' }, sourceRefs: refs }) });
  const unresolved = object({ ...common, outcome: { const: 'unresolved' },
    observation: { type: 'null' }, uncertainties: { ...uncertainties, minItems: 1 } });
  return { name: 'genos_daemon_allocation_observation', schema: { oneOf: [success, unresolved] } };
}

function invalid(detail) {
  return Object.assign(new Error(`Invalid typed daemon observation: ${detail}`), {
    code: 'INVALID_DAEMON_OBSERVATION'
  });
}

function parse(raw, format) {
  let data;
  try { data = JSON.parse(raw); } catch (_) { throw invalid('response must be strict JSON.'); }
  const validate = new Ajv({ strict: false, allErrors: true }).compile(format.schema);
  if (!validate(data)) throw invalid(JSON.stringify(validate.errors.slice(0, 3)));
  if (data.outcome === 'success' && !Number.isFinite(Date.parse(data.territoryReport.observedAt))) {
    throw invalid('observedAt is not a valid UTC timestamp.');
  }
  return data;
}

function project(raw, contract) {
  const format = responseFormat(contract);
  if (!format) return raw;
  const data = parse(raw, format);
  const report = { outcome: data.outcome, uncertainties: data.uncertainties,
    claims: [], daemonObservation: { schema: FORMAT, serialization: 'json-stringify/v1',
      sourceTextSha256: crypto.createHash('sha256').update(raw).digest('hex') } };
  if (data.outcome === 'success') {
    report.claims.push({ statement: JSON.stringify(data.observation), evidence: data.evidence });
    report.territoryReport = data.territoryReport;
  }
  return JSON.stringify(report);
}

function instruction(contract) {
  const assigned = workspace(contract);
  if (!assigned) return '';
  return `Return only the typed JSON response with schema "${FORMAT}". `
    + 'For outcome "success", put one object in observation: {observedSum: integer, target: integer, anomaly: boolean}; '
    + 'include evidence, uncertainties and territoryReport. Compute observedSum using only values[indices[i]] '
    + 'from the current allocation, with zero-based indices. Compare that sum with the supplied target. '
    + 'A healthy allocation must have anomaly false; success describes a usable observation, not an anomaly. '
    + `Use territoryId "${assigned.files.allocation}", a UTC observedAt and all sealed source references in evidence and sourceRefs. `
    + 'Do not provide claims, a JSON-encoded string, prose or mission decisions. '
    + 'If evidence is insufficient, return outcome "unresolved", observation null and nonempty uncertainties, '
    + 'with the same schema identifier; omit evidence and territoryReport.';
}

module.exports = { FORMAT, responseFormat, project, instruction };
