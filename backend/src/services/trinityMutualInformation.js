'use strict';
function mutualInformation(joint) {
  if (!Array.isArray(joint) || !joint.length || joint.length > 24) return null;
  if (!joint.every(row => validRow(row, joint[0]))) return null;
  const values = joint.flat();
  if (values.some(p => !Number.isFinite(p) || p < 0 || p > 1)) return null;
  if (Math.abs(values.reduce((sum, p) => sum + p, 0) - 1) > 1e-8) return null;
  const left = joint.map(row => row.reduce((sum, p) => sum + p, 0));
  const right = joint[0].map((_, column) => joint.reduce((sum, row) => sum + row[column], 0));
  return joint.reduce((sum, row, i) => sum + row.reduce((inner, p, j) =>
    inner + (p > 0 ? p * Math.log2(p / (left[i] * right[j])) : 0), 0), 0);
}
function validRow(row, first) {
  return Array.isArray(row) && row.length === first.length && row.length > 0 && row.length <= 24;
}
function tripletRedundancy(triplet, config) {
  if (config.redundancyPolicy !== 'mutual_information') return null;
  const values = [[0, 1], [0, 2], [1, 2]].map(([a, b]) => {
    const key = [triplet[a].id, triplet[b].id].sort().join('|');
    return mutualInformation(config.jointDistributions?.[key]);
  });
  return values.some(value => value === null) ? null : values.reduce((sum, value) => sum + value, 0);
}
module.exports = { mutualInformation, tripletRedundancy };
