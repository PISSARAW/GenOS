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
const V2_ARMS = Object.freeze(['genos-full', 'static-social-graph', 'llm-with-memory',
  'genos-without-relational-physiology', 'genos-social-memory-ablated', 'genos-social-memory-counterfactual']);

function validateSocialWorldReport(report) {
  if (!validate(report)) return { valid: false, errors: ajv.errorsText(validate.errors).split('; ') };
  const errors = [];
  if (report.status === 'pass' && report.evidenceRefs.length === 0) errors.push('A passing report requires evidence references.');
  if (report.status === 'pass' && report.violations.length > 0) errors.push('A passing report cannot contain violations.');
  if (report.scenario === 'V2-06') errors.push(...v2EvidenceErrors(report));
  return { valid: errors.length === 0, errors };
}

function v2EvidenceErrors(report) {
  if (!report.caseId || !report.arms) return ['V2-06 reports require caseId and arm observations.'];
  if (!['pass', 'fail', 'inconclusive'].includes(report.oracle.status) || report.oracle.caseId !== report.caseId) {
    return ['V2-06 oracle must identify its recalculated status and case.'];
  }
  const references = new Set(report.evidenceRefs);
  return [...reportedArmErrors(report.arms), ...V2_ARMS.flatMap((arm) => armEvidenceErrors(arm, report.arms[arm], references))];
}

function reportedArmErrors(arms) {
  const reported = Object.keys(arms).sort();
  const expected = [...V2_ARMS].sort();
  return reported.length === expected.length && reported.every((arm, index) => arm === expected[index])
    ? [] : ['V2-06 reports must contain exactly the six manifest arms.'];
}

function armEvidenceErrors(arm, entry, references) {
  if (!entry?.decision?.receiptId || !Array.isArray(entry?.model?.sourceMemoryIds)) {
    return [`V2-06 arm '${arm}' lacks decision or memory evidence.`];
  }
  return [...referenceErrors(arm, entry, references), ...interventionEvidenceErrors(arm, entry.interventionReceipt)];
}

function referenceErrors(arm, entry, references) {
  const ids = [entry.decision.receiptId, ...entry.model.sourceMemoryIds, entry.interventionReceipt?.interventionId];
  return ids.every((id) => id && references.has(id))
    ? [] : [`V2-06 arm '${arm}' has evidence references absent from the report.`];
}

function interventionEvidenceErrors(arm, receipt) {
  const mode = treatmentMode(arm);
  if (receipt?.mode !== mode || !receipt?.interventionId) {
    return [`V2-06 arm '${arm}' does not match its registered intervention treatment.`];
  }
  if (mode === 'baseline' && !baselineSnapshotValid(receipt)) {
    return [`V2-06 arm '${arm}' baseline memory snapshot is not unchanged.`];
  }
  if (mode !== 'baseline' && !interventionSnapshotValid(receipt)) {
    return [`V2-06 arm '${arm}' intervention does not prove a scoped memory change.`];
  }
  return [];
}

function treatmentMode(arm) {
  if (arm === 'genos-social-memory-ablated') return 'mask-social-memories';
  if (arm === 'genos-social-memory-counterfactual') return 'counterfactual-social-memories';
  return 'baseline';
}

function baselineSnapshotValid(receipt) {
  return Boolean(receipt.beforeHash && receipt.beforeHash === receipt.afterHash);
}

function interventionSnapshotValid(receipt) {
  return Boolean(receipt.beforeHash && receipt.beforeHash !== receipt.afterHash
    && receipt.preservedNonSocialMemoryHash);
}

module.exports = { validateSocialWorldReport };
