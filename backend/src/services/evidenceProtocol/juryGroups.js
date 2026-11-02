'use strict';

function sharesRoot(left, right) {
  return left.provenanceRoots.some((root) => right.provenanceRoots.includes(root));
}

function related(left, right) {
  return left.executionId === right.executionId || sharesRoot(left, right) ||
    left.dependsOn.includes(right.agentId) || right.dependsOn.includes(left.agentId);
}

function components(participants, relation) {
  const pending = new Set(participants.map((item) => item.agentId));
  const byId = new Map(participants.map((item) => [item.agentId, item]));
  const groups = [];
  while (pending.size) {
    const group = [pending.values().next().value];
    pending.delete(group[0]);
    for (let cursor = 0; cursor < group.length; cursor += 1) {
      for (const id of pending) {
        if (relation(byId.get(group[cursor]), byId.get(id))) {
          pending.delete(id);
          group.push(id);
        }
      }
    }
    groups.push(group.sort());
  }
  return groups.sort((left, right) => left[0] < right[0] ? -1 : 1);
}

function groupVerdict(ids, reveals) {
  const verdicts = new Set(ids.map((id) => reveals[id].verdict));
  return verdicts.size === 1 ? [...verdicts][0] : 'unknown';
}

function aggregateGroups(participants, reveals) {
  const groups = components(participants, related).map((ids) => ({
    verifierIds: ids, verdict: groupVerdict(ids, reveals),
  }));
  return {
    groups,
    executionGroups: components(participants, (left, right) => left.executionId === right.executionId),
    provenanceGroups: components(participants, sharesRoot),
    methodGroups: components(participants, (left, right) => left.methodId === right.methodId),
    supportGroups: groups.filter((group) => group.verdict === 'accept').length,
    rejectGroups: groups.filter((group) => group.verdict === 'reject').length,
    unresolvedGroups: groups.filter((group) => group.verdict === 'unknown').length,
    statisticalIndependence: 'not_established',
    basis: 'declared_execution_provenance_and_dependencies',
  };
}

module.exports = { aggregateGroups };
