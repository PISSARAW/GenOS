'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Ajv2020 = require('ajv/dist/2020');
const addFormats = require('ajv-formats');

const schemaPath = path.resolve(__dirname, '../../..', 'spec/socialworld-campaign-report.schema.json');
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);

function validateSocialWorldReport(report) {
  if (!validate(report)) return { valid: false, errors: ajv.errorsText(validate.errors).split('; ') };
  const errors = [];
  if (report.status === 'pass' && report.evidenceRefs.length === 0) errors.push('A passing report requires evidence references.');
  if (report.status === 'pass' && report.violations.length > 0) errors.push('A passing report cannot contain violations.');
  if (report.scenario === 'V2-06') errors.push(...v2EvidenceErrors(report));
  return { valid: errors.length === 0, errors };
}

function v2EvidenceErrors(report) {
  const errors = [];
  if (!report.caseId || !report.arms) return ['V2-06 reports require caseId and arm observations.'];
  if (!['pass', 'fail', 'inconclusive'].includes(report.oracle.status) || report.oracle.caseId !== report.caseId) {
    errors.push('V2-06 oracle must identify its recalculated status and case.');
  }
  const references = new Set(report.evidenceRefs);
  for (const arm of ['baseline', 'masked', 'counterfactual']) {
    const entry = report.arms[arm];
    if (!entry?.decision?.receiptId || !entry?.model?.sourceMemoryIds) {
      errors.push(`V2-06 arm '${arm}' lacks decision or memory evidence.`);
      continue;
    }
    if (!references.has(entry.decision.receiptId)
      || entry.model.sourceMemoryIds.some((id) => !references.has(id))) {
      errors.push(`V2-06 arm '${arm}' has evidence references absent from the report.`);
    }
  }
  return errors;
}

module.exports = { validateSocialWorldReport };
