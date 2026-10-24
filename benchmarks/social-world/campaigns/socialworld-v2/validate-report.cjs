#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REQUIRED_FIELDS = [
  'campaignId', 'scenario', 'arm', 'seed', 'attempt', 'sourceCommit',
  'runtimeVersion', 'model', 'configHash', 'status', 'startedAt',
  'durationMs', 'inputs', 'observed', 'oracle', 'evidenceRefs',
  'violations', 'limitations'
];
const ALLOWED_STATUSES = new Set(['pass', 'fail', 'inconclusive']);

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasTraversal(reference) {
  return reference.split(/[\\/]/).includes('..');
}

function containedPath(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative);
}

function safeReference(reference) {
  if (typeof reference !== 'string' || !reference.trim() || reference.includes('\0')) return false;
  return !path.isAbsolute(reference) && !path.win32.isAbsolute(reference)
    && !/^[a-zA-Z]:/.test(reference) && !hasTraversal(reference);
}

function referenceExists(reference, reportDirectory) {
  if (!safeReference(reference)) return false;
  try {
    const root = fs.realpathSync(reportDirectory);
    const candidate = path.resolve(root, reference);
    if (!containedPath(root, candidate)) return false;
    const resolved = fs.realpathSync(candidate);
    return containedPath(root, resolved) && fs.statSync(resolved).isFile();
  } catch (_) {
    return false;
  }
}

function validateFields(report) {
  return REQUIRED_FIELDS.filter((field) => !Object.hasOwn(report, field))
    .map((field) => `missing required field: ${field}`);
}

function validateStatusAndTiming(report) {
  const errors = [];
  if (!ALLOWED_STATUSES.has(report.status)) errors.push('status must be pass, fail, or inconclusive');
  if (!Number.isInteger(report.attempt) || report.attempt < 1) errors.push('attempt must be a positive integer');
  if (!Number.isFinite(report.durationMs) || report.durationMs < 0) errors.push('durationMs must be non-negative');
  if (report.model !== null && typeof report.model !== 'string') errors.push('model must be a string or null');
  return errors;
}

function validateObjectFields(report) {
  const errors = [];
  if (!isPlainObject(report.inputs)) errors.push('inputs must be an object');
  if (!isPlainObject(report.observed)) errors.push('observed must be an object');
  if (!isPlainObject(report.oracle) || typeof report.oracle.recalculable !== 'boolean') {
    errors.push('oracle must be an object with boolean recalculable');
  }
  return errors;
}

function validateCollections(report) {
  const errors = [];
  if (!Array.isArray(report.evidenceRefs)) errors.push('evidenceRefs must be an array');
  if (!Array.isArray(report.violations)) errors.push('violations must be an array');
  if (!Array.isArray(report.limitations)) errors.push('limitations must be an array');
  return errors;
}

function validateTypes(report) {
  return [...validateStatusAndTiming(report), ...validateObjectFields(report), ...validateCollections(report)];
}

function validatePass(report, reportPath) {
  const errors = [];
  if (report.oracle.recalculable !== true) errors.push('pass requires a recalculable oracle');
  if (report.evidenceRefs.length === 0) errors.push('pass requires evidence references');
  const reportDirectory = path.dirname(path.resolve(reportPath));
  for (const reference of report.evidenceRefs) {
    if (!referenceExists(reference, reportDirectory)) {
      errors.push(`evidence reference cannot be resolved: ${reference}`);
    }
  }
  if (report.violations.length > 0) errors.push('pass cannot contain violations');
  return errors;
}

function validateReport(report, reportPath) {
  if (!isPlainObject(report)) return ['report must be a JSON object'];
  const errors = [...validateFields(report), ...validateTypes(report)];
  if (report.status === 'pass' && Array.isArray(report.evidenceRefs)
    && isPlainObject(report.oracle) && Array.isArray(report.violations)) {
    errors.push(...validatePass(report, reportPath));
  }
  return errors;
}

function main() {
  const reportPath = process.argv[2];
  if (!reportPath) {
    process.stderr.write('Usage: node validate-report.cjs <report.json>\n');
    process.exitCode = 2;
    return;
  }
  try {
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    const errors = validateReport(report, reportPath);
    if (errors.length) {
      process.stderr.write(`${errors.map((error) => `- ${error}`).join('\n')}\n`);
      process.exitCode = 1;
      return;
    }
    process.stdout.write('SocialWorld V2 report valid\n');
  } catch (error) {
    process.stderr.write(`Unable to validate report: ${error.message}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();
module.exports = { validateReport };
