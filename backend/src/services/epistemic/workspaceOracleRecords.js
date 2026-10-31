'use strict';

const values = require('./workspaceOracleValues');

function logs(subject, strategy, candidate) {
  const text = values.source(subject);
  const needle = subject.contract.needle;
  if (typeof needle !== 'string' || !needle || needle.length > 80) throw new Error('literal_needle_required');
  const lines = text.split(/\r?\n/);
  const selected = strategy === 'source_recompute'
    ? lines.map((line, index) => ({ line, number: index + 1 })).filter(item => item.line.includes(needle))
    : reverseScan(lines, needle);
  const requests = selected.map(item => Number(item.line.match(/\brequest=(\d+)\b/)?.[1]));
  if (requests.some(n => !Number.isSafeInteger(n))) throw new Error('request_id_outside_domain');
  return values.fields(candidate, { lines: selected.map(item => item.number), requests, cause: null });
}

function reverseScan(lines, needle) {
  const selected = [];
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (lines[i].indexOf(needle) >= 0) selected.unshift({ line: lines[i], number: i + 1 });
  }
  return selected;
}

function jsonContract(subject, strategy, candidate) {
  const spec = values.source(subject, 'spec');
  const example = JSON.parse(values.source(subject, 'example'));
  const marker = subject.contract.specMarker;
  if (typeof marker !== 'string' || marker.length < 1 || marker.length > 80) throw new Error('field_marker_required');
  const tail = spec.split(marker);
  if (tail.length !== 2) throw new Error('ambiguous_documented_field');
  const field = tail[1].trim().match(/^[A-Za-z_][A-Za-z0-9_]*/)?.[0];
  const keys = strategy === 'source_recompute' ? Object.keys(example) : Object.entries(example).map(([key]) => key);
  if (!field || !keys.length) throw new Error('field_contract_outside_domain');
  return values.fields(candidate, { specField: field, exampleField: keys[0], productionFormat: 'unknown' })
    && values.nonemptyStrings(candidate.limitations);
}

function dataQuality(subject, strategy, candidate) {
  if (subject.contract.scope !== 'synthetic_data_quality') throw new Error('clinical_scope_not_supported');
  const rows = values.csv(values.source(subject));
  const columns = subject.contract.columns;
  const missing = rows.filter(row => !row[columns.value]?.trim()).map(row => record(row, columns));
  const duplicates = strategy === 'source_recompute' ? duplicateRows(rows, columns) : quadraticDuplicates(rows, columns);
  return values.fields(candidate, { missing, possibleDuplicates: duplicates, diagnosis: null, treatment: null })
    && values.nonemptyStrings(candidate.limitations);
}

function record(row, columns) { return { patient: row[columns.patient], time: row[columns.time] }; }
function duplicateRows(rows, columns) {
  const seen = new Set();
  const found = [];
  for (const row of rows) {
    const key = JSON.stringify(row);
    if (seen.has(key)) found.push(record(row, columns));
    seen.add(key);
  }
  return found;
}
function quadraticDuplicates(rows, columns) {
  if (rows.length > 256) throw new Error('duplicate_scan_outside_domain');
  return rows.filter((row, index) => rows.slice(0, index).some(prior =>
    JSON.stringify(prior) === JSON.stringify(row))).map(row => record(row, columns));
}

function numericHistory(subject, strategy, candidate) {
  const key = subject.contract.key;
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,40}$/.test(key)) throw new Error('history_key_invalid');
  const current = numericAssignment(values.source(subject, 'current'), key);
  const previous = numericAssignment(subject.history.content, key);
  if (strategy === 'cross_check' && !values.source(subject, 'history').includes(String(previous))) return false;
  return values.fields(candidate, { currentTimeoutMs: current, previousTimeoutMs: previous })
    && Array.isArray(candidate.sources) && candidate.sources.length >= 2
    && candidate.sources.every(file => subject.sources.some(source => source.path === file));
}
function numericAssignment(text, key) {
  const matches = [...text.matchAll(new RegExp(`^\\s*${key}\\s*=\\s*(\\d+)\\s*$`, 'gm'))];
  if (matches.length !== 1) throw new Error('numeric_assignment_ambiguous');
  return Number(matches[0][1]);
}

function reportTotal(subject, strategy) {
  const rows = values.csv(values.source(subject));
  const numbers = rows.map(row => values.number(row[subject.contract.columns.value]));
  const total = strategy === 'source_recompute'
    ? numbers.reduce((sum, value) => sum + value, 0) : numbers.reduceRight((sum, value) => value + sum, 0);
  const report = values.source(subject, 'report');
  const lines = report.split(/\r?\n/).filter(line => /\btotal\b/i.test(line) && /\d/.test(line));
  return lines.length > 0 && lines.every(line => {
    const found = line.match(/\d+(?:\.\d+)?/g).map(Number);
    return found.length === 1 && found[0] === total;
  });
}

module.exports = { logs, jsonContract, dataQuality, numericHistory, reportTotal };
