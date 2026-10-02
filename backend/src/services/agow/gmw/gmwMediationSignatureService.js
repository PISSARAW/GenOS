'use strict';

const collector = require('./gmwStateCollector');
const reachability = require('./gmwReachabilityService');
const observability = require('./gmwObservabilityService');
const boundaryResponse = require('./gmwBoundaryResponseService');

async function collect(options) {
  return evaluate(await collector.collect(options));
}

function evaluate(samples) {
  const graph = reachability.measure(samples);
  const visible = observability.measure(samples);
  const boundary = boundaryResponse.measure(samples);
  const pairs = new Set(samples.map((item) => `${item.source}->${item.target}`));
  const nodes = new Set(samples.flatMap((item) => [item.source, item.target]));
  const possiblePairs = nodes.size * Math.max(0, nodes.size - 1);
  const scores = samples.map((item) => Math.min(1, boundaryResponse.norm(item.output)));
  return { reachability: graph.score, observability: visible.score,
    inputOutputAlignment: boundary.alignment, mediationCapacity: boundary.capacity,
    effectiveDimensionality: matrixRank(boundary.responses),
    sourceTargetBreadth: possiblePairs ? pairs.size / possiblePairs : 0,
    uncertainty: standardError(scores), sampleCount: samples.length,
    method: 'intervention_vector_proxy_v1', evidenceRefs: samples.map((item) => item.evidenceRef),
    promotionEligible: false };
}

function matrixRank(matrix) {
  const rows = matrix.map((row) => [...row]);
  const width = Math.max(0, ...rows.map((row) => row.length));
  let rank = 0;
  for (let column = 0; column < width && rank < rows.length; column += 1) {
    const pivot = pivotRow(rows, rank, column);
    if (pivot < 0) continue;
    [rows[rank], rows[pivot]] = [rows[pivot], rows[rank]];
    eliminate({ rows, pivot: rank, column, width });
    rank += 1;
  }
  return rank;
}

function pivotRow(rows, start, column) {
  for (let row = start; row < rows.length; row += 1) if (Math.abs(rows[row][column] || 0) > 1e-8) return row;
  return -1;
}

function eliminate(options) {
  const { rows, pivot, column, width } = options;
  const scale = rows[pivot][column];
  for (let col = column; col < width; col += 1) rows[pivot][col] = (rows[pivot][col] || 0) / scale;
  for (let row = pivot + 1; row < rows.length; row += 1) {
    const factor = rows[row][column] || 0;
    for (let col = column; col < width; col += 1) rows[row][col] = (rows[row][col] || 0) - factor * rows[pivot][col];
  }
}

function standardError(values) {
  if (values.length < 2) return 1;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
  return Math.min(1, Math.sqrt(variance / values.length));
}

module.exports = { collect, evaluate, matrixRank, standardError };
