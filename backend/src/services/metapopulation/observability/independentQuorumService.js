'use strict';

function senseIndependentQuorum(members, options = {}) {
  const threshold = finiteOption(options.evidenceThreshold, 0.5);
  const ratio = finiteOption(options.quorumRatio, 0.5);
  const normalized = normalizeMembers(members, threshold);
  const independent = selectIndependent(normalized);
  const totalWeight = independent.reduce((sum, member) => sum + member.weight, 0);
  const supportWeight = independent.filter((member) => member.support).reduce((sum, member) => sum + member.weight, 0);
  const support = totalWeight ? Number((supportWeight / totalWeight).toFixed(3)) : 0;
  return { reached: totalWeight > 0 && support >= ratio, support, quorumRatio: ratio,
    evidenceThreshold: threshold, responders: normalized.filter((item) => !item.silent).length,
    independentResponders: independent.filter((item) => !item.silent).length,
    abstentions: independent.filter((item) => item.abstain).length,
    silent: independent.filter((item) => item.silent).length,
    sourceDiversity: distinctCount(independent.map((item) => item.source)),
    modelDiversity: distinctCount(independent.map((item) => item.model)) };
}

function normalizeMembers(members, threshold) {
  return (Array.isArray(members) ? members : []).map((member, index) => {
    const score = Number(member?.evidenceScore);
    return { id: String(member?.id || index), weight: validWeight(member?.weight),
      source: normalizeKey(member?.sourceId || member?.source),
      model: normalizeKey(member?.modelId || member?.model),
      group: normalizeKey(member?.independenceGroup),
      silent: member?.status === 'SILENT' || member?.status === 'UNAVAILABLE',
      abstain: member?.status === 'ABSTAIN' || member?.abstain === true,
      support: Number.isFinite(score) && score >= threshold && member?.status !== 'ABSTAIN' };
  });
}

function selectIndependent(members) {
  const groups = new Map();
  for (const member of members) {
    const key = member.group || member.source || member.model || member.id;
    const previous = groups.get(key);
    if (!previous || member.weight > previous.weight || member.support && !previous.support) groups.set(key, member);
  }
  return [...groups.values()];
}

function distinctCount(values) { return new Set(values.filter(Boolean)).size; }
function normalizeKey(value) { return typeof value === 'string' && value.trim() ? value.trim().toLowerCase() : null; }
function validWeight(value) { return Number.isFinite(value) && value > 0 ? value : 1; }
function finiteOption(value, fallback) { return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback; }

module.exports = { senseIndependentQuorum };
