'use strict';

function argumentIds(input) {
  const list = Array.isArray(input.arguments) ? input.arguments : [];
  return [...new Set(list.map((item) => String(item.argumentId || '')).filter(Boolean))];
}

function attackEdges(input) {
  const list = Array.isArray(input.attacks) ? input.attacks : [];
  return list
    .map((edge) => ({ from: String(edge.from || ''), to: String(edge.to || '') }))
    .filter((edge) => edge.from && edge.to && edge.from !== edge.to);
}

function attackersOf(id, edges) {
  return edges.filter((edge) => edge.to === id).map((edge) => edge.from);
}

function groundedLabelling(input = {}) {
  const ids = argumentIds(input);
  const edges = attackEdges(input);
  const labels = new Map(ids.map((id) => [id, 'UNDEC']));
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of ids) {
      if (labels.get(id) !== 'UNDEC') continue;
      const attackers = attackersOf(id, edges);
      if (!attackers.length) {
        labels.set(id, 'IN');
        changed = true;
      } else if (attackers.every((attacker) => labels.get(attacker) === 'OUT')) {
        labels.set(id, 'IN');
        changed = true;
      } else if (attackers.some((attacker) => labels.get(attacker) === 'IN')) {
        labels.set(id, 'OUT');
        changed = true;
      }
    }
  }
  return { labels: Object.fromEntries(labels), undecided: ids.filter((id) => labels.get(id) === 'UNDEC') };
}

function detectCycles(input = {}) {
  const ids = argumentIds(input);
  const edges = attackEdges(input);
  const outgoing = new Map(ids.map((id) => [id, []]));
  for (const edge of edges) {
    if (outgoing.has(edge.from)) outgoing.get(edge.from).push(edge.to);
  }
  const cyclic = new Set();
  for (const start of ids) visitCycle({ start, outgoing, cyclic });
  return { cyclicArgumentIds: [...cyclic], cycleCount: cyclic.size > 0 ? countCycles({ ids, outgoing }) : 0 };
}

function visitCycle(input) {
  const { start, outgoing, cyclic } = input;
  const stack = [[start, 0]];
  const onPath = new Set([start]);
  while (stack.length) {
    const [node, childIndex] = stack[stack.length - 1];
    const children = outgoing.get(node) || [];
    if (childIndex >= children.length) {
      stack.pop();
      onPath.delete(node);
      continue;
    }
    stack[stack.length - 1][1] += 1;
    const child = children[childIndex];
    if (onPath.has(child)) {
      for (const member of onPath) cyclic.add(member);
      cyclic.add(child);
    } else if (!cyclic.has(child)) {
      stack.push([child, 0]);
      onPath.add(child);
    }
  }
}

function countCycles(input) {
  const { ids, outgoing } = input;
  const visited = new Set();
  let count = 0;
  for (const id of ids) {
    if (!visited.has(id) && reachesSelf({ id, outgoing, visited })) count += 1;
  }
  return count;
}

function reachesSelf(input) {
  const { id, outgoing, visited } = input;
  const stack = [...(outgoing.get(id) || [])];
  while (stack.length) {
    const node = stack.pop();
    if (node === id) {
      visited.add(id);
      return true;
    }
    if (!visited.has(node)) {
      visited.add(node);
      stack.push(...(outgoing.get(node) || []));
    }
  }
  return false;
}

function supportMap(input) {
  const list = Array.isArray(input.supports) ? input.supports : [];
  const map = new Map();
  for (const entry of list) {
    const claimId = String(entry.claimId || '');
    const argumentId = String(entry.argumentId || '');
    if (!claimId || !argumentId) continue;
    if (!map.has(claimId)) map.set(claimId, []);
    map.get(claimId).push(argumentId);
  }
  return map;
}

function adjudicate(input = {}) {
  const claims = Array.isArray(input.claims) ? input.claims : [];
  const { labels } = groundedLabelling(input);
  const supports = supportMap(input);
  const edges = attackEdges(input);
  return claims.map((claim) => adjudicateClaim({ claim, labels, supports, edges }));
}

function adjudicateClaim(input) {
  const { claim, labels, supports, edges } = input;
  const claimId = String(claim.claimId || '');
  const supporting = supports.get(claimId) || [];
  const supportingIn = supporting.filter((id) => labels[id] === 'IN');
  const attackersIn = supporting.flatMap((id) => attackersOf(id, edges)).filter((id) => labels[id] === 'IN');
  const burdenMet = supportingIn.length > 0 && attackersIn.length === 0;
  return {
    claimId,
    status: burdenMet ? 'ACCEPTED' : attackersIn.length > 0 ? 'REJECTED' : 'UNDECIDED',
    burdenOfProof: burdenMet ? 'MET' : 'UNMET',
    groundedSupport: supportingIn,
    groundedAttackers: [...new Set(attackersIn)],
    contradiction: supportingIn.length > 0 && attackersIn.length > 0
  };
}

module.exports = { groundedLabelling, detectCycles, adjudicate };
