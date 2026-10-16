'use strict';

const { topologyExpression, nestExpression, parallelExpression,
  sequenceExpression, competeExpression, federateExpression,
  bridgeExpression } = require('./expression/morphologyExpression');
const { registry: defaultAdapterRegistry } = require('./adapters/topologyAdapterService');

const COMPOSITE_OPERATORS = Object.freeze(['NEST', 'PARALLEL', 'SEQUENCE', 'COMPETE', 'FEDERATE', 'BRIDGE']);
const SYMMETRIC_OPERATORS = Object.freeze(['PARALLEL', 'SEQUENCE', 'COMPETE', 'FEDERATE']);
const UNEXPLORED_COMPOSITE_OPERATORS = Object.freeze([
  { operator: 'GATE', reason: 'GATE requiert un triplet condition/then/else non dérivable d’une paire de topologies.' },
  { operator: 'WRAP', reason: 'WRAP requiert un environnement d’exécution explicite non dérivable d’une paire de topologies.' }
]);

function buildCompositeCandidates(ctx) {
  const tasks = buildCompositeTasks({ components: ctx.components, registry: ctx.registry,
    relationContext: ctx.input.relationContext || {} });
  const output = [];
  const examinedByOperator = {};
  let examined = 0;
  for (const task of tasks) {
    if (examined >= ctx.ceiling) break;
    examined += 1;
    examinedByOperator[task.operator] = (examinedByOperator[task.operator] || 0) + 1;
    const candidate = compositeCandidateFor({ ...ctx, task });
    if (candidate) output.push(candidate);
  }
  return {
    candidates: output.sort((left, right) => left.candidateId.localeCompare(right.candidateId)),
    stats: compositeStats({ tasks, output, examined, examinedByOperator, ceiling: ctx.ceiling })
  };
}

function compositeStats(ctx) {
  return {
    examined: ctx.examined, ceiling: ctx.ceiling, potential: ctx.tasks.length,
    truncated: ctx.tasks.length > ctx.examined,
    examinedByOperator: ctx.examinedByOperator, candidatesByOperator: countByOperator(ctx.output),
    operators: [...COMPOSITE_OPERATORS], unexploredOperators: [...UNEXPLORED_COMPOSITE_OPERATORS]
  };
}

function countByOperator(output) {
  const counts = {};
  for (const candidate of output) {
    const key = candidate.operator || candidate.kind;
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function defaultsFirst(components) {
  const defaults = components.filter((item) => item.variant.variantId === 'default');
  const others = components.filter((item) => item.variant.variantId !== 'default');
  return [...defaults, ...others];
}

function buildCompositeTasks(ctx) {
  const ordered = defaultsFirst(ctx.components);
  const queues = {};
  for (const operator of COMPOSITE_OPERATORS) {
    queues[operator] = rankPairs({ pairs: pairsForOperator({ ordered, operator }),
      registry: ctx.registry, relationContext: ctx.relationContext });
  }
  return interleaveQueues({ queues });
}

function pairsForOperator(ctx) {
  const pairs = [];
  for (let first = 0; first < ctx.ordered.length; first += 1) {
    for (let second = 0; second < ctx.ordered.length; second += 1) {
      if (skipPair({ ordered: ctx.ordered, first, second, operator: ctx.operator })) continue;
      pairs.push({ operator: ctx.operator, first: ctx.ordered[first], second: ctx.ordered[second] });
    }
  }
  return pairs;
}

function pairRelation(ctx) {
  return ctx.registry.relations.get(ctx.pair.first.topologyId, ctx.pair.second.topologyId, ctx.relationContext || {});
}

function rankPairs(ctx) {
  return ctx.pairs
    .map((pair, index) => ({ pair, index, rank: pairRelation({ ...ctx, pair }).evidenceStatus === 'verified' ? 0 : 1 }))
    .sort((left, right) => left.rank - right.rank || left.index - right.index)
    .map((entry) => entry.pair);
}

function skipPair(ctx) {
  if (ctx.ordered[ctx.first].topologyId === ctx.ordered[ctx.second].topologyId) return true;
  if (SYMMETRIC_OPERATORS.includes(ctx.operator)) return ctx.first >= ctx.second;
  return false;
}

function interleaveQueues(ctx) {
  const tasks = [];
  let index = 0;
  let progress = true;
  while (progress) {
    progress = false;
    for (const operator of COMPOSITE_OPERATORS) {
      if (index < ctx.queues[operator].length) {
        tasks.push(ctx.queues[operator][index]);
        progress = true;
      }
    }
    index += 1;
  }
  return tasks;
}

function compositeCandidateFor(ctx) {
  const caps = ctx.helpers.candidateCapabilities(ctx.task.first.contract, ctx.task.first.variant, ctx.capabilitySet);
  const innerCaps = ctx.helpers.candidateCapabilities(ctx.task.second.contract, ctx.task.second.variant, ctx.capabilitySet);
  if (!caps.allowed || !innerCaps.allowed) return null;
  const adapter = ctx.task.operator === 'BRIDGE' ? verifiedAdapterFor({ ...ctx, from: ctx.task.first, to: ctx.task.second }) : null;
  if (ctx.task.operator === 'BRIDGE' && !adapter) return null;
  const expression = compositeExpression({ task: ctx.task, adapter, helpers: ctx.helpers });
  const validation = ctx.helpers.validateTypedExpression({ expression, input: ctx.input, registry: ctx.registry, contracts: ctx.contracts });
  if (!validation.valid) return null;
  return compositeCandidateRecord({ ...ctx, caps, innerCaps, expression, validation });
}

function compositeExpression(ctx) {
  const leaves = leafExpressions({ task: ctx.task });
  const identity = compositeIdentity({ task: ctx.task });
  if (ctx.task.operator === 'NEST') return ctx.helpers.buildExpression(nestExpression(leaves.first, leaves.second), identity);
  if (ctx.task.operator === 'BRIDGE') {
    return ctx.helpers.buildExpression(bridgeExpression({ source: leaves.first, target: leaves.second, adapter: { name: ctx.adapter.id } }), identity);
  }
  return ctx.helpers.buildExpression(childrenExpression({ task: ctx.task, leaves }), identity);
}

function leafExpressions(ctx) {
  return {
    first: topologyExpression(ctx.task.first.topologyId, ctx.task.first.variant.variantId),
    second: topologyExpression(ctx.task.second.topologyId, ctx.task.second.variant.variantId)
  };
}

function childrenExpression(ctx) {
  if (ctx.task.operator === 'PARALLEL') return parallelExpression([ctx.leaves.first, ctx.leaves.second]);
  if (ctx.task.operator === 'SEQUENCE') return sequenceExpression([ctx.leaves.first, ctx.leaves.second]);
  if (ctx.task.operator === 'COMPETE') return competeExpression([ctx.leaves.first, ctx.leaves.second]);
  return federateExpression([ctx.leaves.first, ctx.leaves.second], { quorum: 2 });
}

function compositeIdentity(ctx) {
  const task = ctx.task;
  return `${task.operator.toLowerCase()}:${task.first.topologyId}:${task.first.variant.variantId}:${task.second.topologyId}:${task.second.variant.variantId}`;
}

function compositeCandidateRecord(ctx) {
  const relation = ctx.registry.relations.get(ctx.task.first.topologyId, ctx.task.second.topologyId, ctx.input.relationContext || {});
  const eligibility = compositeEligibility({ ...ctx, relation });
  const prefix = ctx.task.operator === 'NEST' ? 'nested' : ctx.task.operator.toLowerCase();
  const leaf = `${ctx.task.first.topologyId}:${ctx.task.first.variant.variantId}:${ctx.task.second.topologyId}:${ctx.task.second.variant.variantId}`;
  return {
    candidateId: `${prefix}:${leaf}`,
    kind: ctx.task.operator === 'NEST' ? 'NESTED' : ctx.task.operator,
    operator: ctx.task.operator,
    topology: ctx.task.first.topologyId, variant: ctx.task.first.variant.variantId,
    members: [{ topology: ctx.task.first.topologyId, variant: ctx.task.first.variant.variantId },
      { topology: ctx.task.second.topologyId, variant: ctx.task.second.variant.variantId }],
    maturity: { topology: 'registered', variant: ctx.task.first.variant.maturity },
    relation, admissibility: eligibility.admissibility, admissibilityReason: eligibility.reason,
    executionEligible: eligibility.executionEligible,
    requiredCapabilities: [...new Set([...ctx.caps.requiredCapabilities, ...ctx.innerCaps.requiredCapabilities])].sort(),
    missingCapabilities: [], expression: ctx.expression, validation: ctx.validation,
    rationale: compositeRationale({ task: ctx.task })
  };
}

function compositeRationale(ctx) {
  const first = `${ctx.task.first.topologyId}/${ctx.task.first.variant.variantId}`;
  const second = `${ctx.task.second.topologyId}/${ctx.task.second.variant.variantId}`;
  const rationales = {
    NEST: `Composition NEST typée : ${first} contient ${second}.`,
    PARALLEL: `Composition PARALLEL typée : ${first} et ${second} s’exécutent en parallèle.`,
    SEQUENCE: `Composition SEQUENCE typée : ${first} puis ${second}.`,
    COMPETE: `Composition COMPETE typée : ${first} et ${second} se comparent.`,
    FEDERATE: `Composition FEDERATE typée : ${first} et ${second} forment un quorum.`,
    BRIDGE: `Composition BRIDGE typée : ${first} migre vers ${second} via un adaptateur vérifié.`
  };
  return rationales[ctx.task.operator] || `Composition ${ctx.task.operator} typée : ${first} et ${second}.`;
}

function compositeEligibility(ctx) {
  if (ctx.task.operator === 'NEST') return nestEligibility(ctx);
  if (ctx.task.operator === 'BRIDGE') return bridgeEligibility(ctx);
  return symmetricEligibility(ctx);
}

function relationGate(ctx) {
  if (ctx.relation.relation === 'FORBIDDEN') return { admissibility: 'rejected', executionEligible: false, reason: 'La relation des topologies interdit cette composition.' };
  if (ctx.relation.evidenceStatus !== 'verified') return { admissibility: 'exploratory_only', executionEligible: false, reason: 'La relation des topologies ne possède pas de preuve vérifiée.' };
  return null;
}

function nestEligibility(ctx) {
  const gate = relationGate(ctx);
  if (gate) return gate;
  if (ctx.relation.adapterRequired && !verifiedAdapterFor({ ...ctx, from: ctx.task.second, to: ctx.task.first })) {
    return { admissibility: 'exploratory_only', executionEligible: false, reason: 'Un adaptateur vérifié de la topologie interne vers son hôte est requis.' };
  }
  if (ctx.relation.relation === 'SYNERGISTIC') return { admissibility: 'execution_eligible', executionEligible: true, reason: 'La relation synergique est vérifiée.' };
  if (ctx.relation.relation !== 'COMPATIBLE_WITH_ADAPTER') return { admissibility: 'exploratory_only', executionEligible: false, reason: 'La relation ne déclare pas une compatibilité vérifiée pour NEST.' };
  if (!ctx.relation.adapterRequired) return { admissibility: 'execution_eligible', executionEligible: true, reason: 'La relation compatible est vérifiée et ne requiert pas d’adaptateur.' };
  return { admissibility: 'execution_eligible', executionEligible: true, reason: 'La relation et l’adaptateur interne vers hôte sont vérifiés.' };
}

function bridgeEligibility(ctx) {
  const gate = relationGate(ctx);
  if (gate) return gate;
  if (!verifiedAdapterFor({ ...ctx, from: ctx.task.first, to: ctx.task.second })) {
    return { admissibility: 'exploratory_only', executionEligible: false, reason: 'Un adaptateur vérifié de la source vers la cible est requis.' };
  }
  return { admissibility: 'execution_eligible', executionEligible: true, reason: 'La relation et l’adaptateur source vers cible sont vérifiés.' };
}

function symmetricEligibility(ctx) {
  const gate = relationGate(ctx);
  if (gate) return gate;
  if (ctx.relation.adapterRequired && !symmetricAdapterPresent(ctx)) {
    return { admissibility: 'exploratory_only', executionEligible: false, reason: 'Un adaptateur vérifié entre les deux topologies est requis.' };
  }
  if (ctx.relation.relation === 'SYNERGISTIC') return { admissibility: 'execution_eligible', executionEligible: true, reason: `La relation synergique est vérifiée pour ${ctx.task.operator}.` };
  if (ctx.relation.relation !== 'COMPATIBLE_WITH_ADAPTER') return { admissibility: 'exploratory_only', executionEligible: false, reason: `La relation ne déclare pas une compatibilité vérifiée pour ${ctx.task.operator}.` };
  return { admissibility: 'execution_eligible', executionEligible: true, reason: `La relation compatible est vérifiée pour ${ctx.task.operator}.` };
}

function symmetricAdapterPresent(ctx) {
  return Boolean(verifiedAdapterFor({ ...ctx, from: ctx.task.first, to: ctx.task.second })
    || verifiedAdapterFor({ ...ctx, from: ctx.task.second, to: ctx.task.first }));
}

function verifiedAdapterFor(ctx) {
  const adapterRegistry = ctx.input.adapterRegistry || defaultAdapterRegistry;
  if (!adapterRegistry || typeof adapterRegistry.get !== 'function') return null;
  const adapter = adapterRegistry.get(ctx.from.topologyId, ctx.to.topologyId);
  return adapter && adapter.evidenceStatus === 'verified' ? adapter : null;
}

module.exports = { COMPOSITE_OPERATORS, UNEXPLORED_COMPOSITE_OPERATORS, buildCompositeCandidates };
