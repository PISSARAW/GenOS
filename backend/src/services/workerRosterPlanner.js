'use strict';

const { KINDS, KIND_CAPABILITIES, resolveWorkerKind } = require('./agents/workerKindService');

function defaultAutoKinds(task) {
  const text = String(task || '').toLowerCase();
  if (/security|sécurité|attack|attaque|adversarial/.test(text)) return ['red_worker', 'verifier_worker', 'bounded_worker'];
  if (/proof|formal|théor|math|preuve|formel|calcul/.test(text)) return ['math_worker', 'formal_worker', 'verifier_worker'];
  if (/measure|benchmark|experiment|mesur|expérience|expériment/.test(text)) return ['experimental_worker', 'scout_cell', 'verifier_worker'];
  if (/teach|training|formation|enseigne|pédagog/.test(text)) return ['teaching_worker', 'scout_cell', 'verifier_worker'];
  if (/create|crée|création|design|creative|artistique/.test(text)) return ['creative_worker', 'synthesis_worker', 'verifier_worker'];
  if (/recover|recovery|restore|récupér|restaur/.test(text)) return ['recovery_worker', 'forensic_worker', 'verifier_worker'];
  if (/research|search|observe|étud|recherche|observe|explore/.test(text)) return ['scout_cell', 'adaptive_worker', 'synthesis_worker'];
  return ['bounded_worker', 'adaptive_worker', 'verifier_worker'];
}

function kindsForPolicy(policy, task, count) {
  if (policy.mode === 'all_registered') return repeatKinds(Object.keys(KINDS), count);
  if (policy.mode === 'mix') return quotaKinds(policy.quotas, count);
  return repeatKinds(permittedKinds(policy, task), count);
}

function permittedKinds(policy, task) {
  if (policy.kinds.length) return policy.kinds;
  if (policy.mode !== 'allowlist') return defaultAutoKinds(task);
  throw Object.assign(new Error('Worker type allowlist requires at least one registered kind.'), { code: 'WORKER_TYPE_POLICY_INVALID' });
}

function repeatKinds(kinds, count) {
  if (!kinds.length || !Number.isSafeInteger(count) || count < 1) {
    throw Object.assign(new Error('Worker roster requires at least one valid worker kind and worker.'), { code: 'WORKER_ROSTER_EMPTY' });
  }
  return Array.from({ length: count }, (_, index) => kinds[index % kinds.length]);
}

function quotaKinds(quotas, count) {
  const selected = Object.entries(quotas).flatMap(([kind, quantity]) => Array(Number(quantity)).fill(kind));
  if (selected.length !== count) {
    throw Object.assign(new Error(`Worker type quotas total ${selected.length}, but ${count} workers were requested.`), {
      code: 'WORKER_TYPE_QUOTA_CARDINALITY_MISMATCH', quotaWorkers: selected.length, requestedWorkers: count
    });
  }
  return selected;
}

function assignmentList(roster) {
  return Object.entries(roster.explicitAssignments || {}).map(([role, assignment]) => ({
    ...(assignment && typeof assignment === 'object' ? assignment : {}), role
  }));
}

function plannedAssignment(input) {
  const { kind, index, task, supplied } = input;
  const selected = resolveWorkerKind(supplied?.workerKind || supplied?.worker_kind || kind, supplied?.role);
  assertAssignmentCapabilities(supplied, selected);
  return { ...supplied, label: supplied?.label || `${selected}-${index + 1}`,
    role: supplied?.role || selected, workerKind: selected,
    hypothesis: supplied?.hypothesis || `Execute an independent, bounded part of the mission: ${task}`,
    capabilities: supplied?.capabilities || KIND_CAPABILITIES[selected],
    selectionReason: supplied?.selectionReason || 'selected_from_registered_worker_type_policy' };
}

function assertAssignmentCapabilities(supplied, selected) {
  const required = supplied?.workerRequirements?.requiredCapabilities || [];
  const available = KIND_CAPABILITIES[selected] || [];
  const missing = required.filter((capability) => !available.includes(capability));
  if (missing.length) {
    throw Object.assign(new Error(`Worker kind '${selected}' lacks required capabilities: ${missing.join(', ')}.`), {
      code: 'WORKER_KIND_CAPABILITY_MISMATCH', missingCapabilities: missing
    });
  }
  if (supplied?.methodContract) require('./agents/workerKindService')
    .assertMethodCompatibility(selected, supplied.methodContract);
}

function buildWorkerRoster(roster, task, defaults) {
  if (!roster) return defaults;
  const supplied = assignmentList(roster);
  const typePolicy = roster.typePolicy || { mode: 'auto', kinds: [], quotas: {} };
  const requested = requestedWorkerCount(roster, typePolicy, supplied, defaults);
  assertExplicitAssignments({ roster, supplied, requested });
  const selectedKinds = kindsForPolicy(typePolicy, task, requested);
  if (typePolicy.mode === 'all_registered' && new Set(selectedKinds).size !== Object.keys(KINDS).length) {
    throw Object.assign(new Error('The worker roster does not cover every registered worker kind.'), { code: 'WORKER_TYPE_COVERAGE_INCOMPLETE' });
  }
  return selectedKinds.map((kind, index) => plannedAssignment({ kind, index, task, supplied: supplied[index] }));
}

function requestedWorkerCount(roster, typePolicy, supplied, defaults) {
  if (roster.requestedWorkers) return roster.requestedWorkers;
  if (typePolicy.mode === 'all_registered') return Object.keys(KINDS).length;
  return typePolicy.kinds.length || supplied.length || defaults.length;
}

function assertExplicitAssignments(context) {
  const { roster, supplied, requested } = context;
  if (!roster.exact || !supplied.length || supplied.length === requested) return;
  throw Object.assign(new Error(`Explicit assignments contain ${supplied.length} roles, but ${requested} workers were requested.`), {
    code: 'WORKER_ASSIGNMENT_CARDINALITY_MISMATCH', assignedWorkers: supplied.length, requestedWorkers: requested
  });
}

module.exports = { buildWorkerRoster, defaultAutoKinds, kindsForPolicy, quotaKinds };
