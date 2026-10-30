'use strict';

const { isDeepStrictEqual } = require('node:util');

function source(subject, key = 'data') {
  const relative = subject.contract.files?.[key] || (key === 'data' && subject.contract.sources[0].path);
  const value = subject.sources.find(item => item.path === relative);
  if (!value) throw new Error('sealed_source_missing');
  return value.content.replace(/^\uFEFF/, '');
}

function csv(text) {
  if (text.includes('"')) throw new Error('csv_dialect_outside_domain');
  const lines = text.trimEnd().split(/\r?\n/);
  const header = lines.shift().split(',');
  if (new Set(header).size !== header.length || lines.length > 4096) throw new Error('csv_shape_outside_domain');
  return lines.map(line => csvRow(line, header));
}

function csvRow(line, header) {
  const parts = line.split(',');
  if (parts.length !== header.length) throw new Error('csv_shape_outside_domain');
  return Object.fromEntries(header.map((key, index) => [key, parts[index]]));
}

function number(text) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('numeric_source_missing');
  const value = Number(text);
  if (!Number.isFinite(value) || Math.abs(value) > 1e9) throw new Error('numeric_source_outside_domain');
  return value;
}

function same(actual, expected) {
  if (typeof expected !== 'number') return isDeepStrictEqual(actual, expected);
  return typeof actual === 'number' && Number.isFinite(actual)
    && Math.abs(actual - expected) <= 1e-9 * Math.max(1, Math.abs(expected));
}

function fields(actual, expected) {
  return Object.entries(expected).every(([key, value]) => same(actual?.[key], value));
}

function candidate(report) {
  const value = report?.claims?.[0]?.statement;
  if (report?.claims?.length !== 1 || typeof value !== 'string') throw new Error('structured_candidate_required');
  const parsed = JSON.parse(value);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('structured_candidate_required');
  return parsed;
}

function nonemptyStrings(value) {
  return Array.isArray(value) && value.length > 0 && value.every(item => typeof item === 'string' && item.trim());
}

module.exports = { source, csv, number, same, fields, candidate, nonemptyStrings };
