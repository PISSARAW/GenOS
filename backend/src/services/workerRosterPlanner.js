'use strict';

const { KINDS, KIND_CAPABILITIES, resolveWorkerKind } = require('./agents/workerKindService');

const AUTO_KIND_RULES = [
  [/\b(delegate|délègue|decompose|décompose|sub[- ]?orchestrat|coordinate children)\b/, ['sub_orchestrator', 'liaison_worker', 'verifier_worker']],
  [/\b(handoff|relais|liaison|bridge|passation|entre équipes|between teams)\b/, ['liaison_worker', 'synthesis_worker', 'verifier_worker']],
  [/\b(synthetic|synthétique|educational vignette|cas éducatif|medical education|formation clinique)\b/, ['medical_worker', 'teaching_worker', 'verifier_worker']],
  [/\b(monitor|surveille|watch|daemon|territory|territoire|alerte)\b/, ['resident_daemon', 'scout_cell', 'verifier_worker']],
  [/\b(forensic|forensique|root cause|cause racine|causal|incident)\b/, ['forensic_worker', 'scout_cell', 'verifier_worker']],
  [/\b(specialist|spécialiste|expert|architect)\b/, ['specialist', 'verifier_worker', 'bounded_worker']],
  [/security|sécurité|attack|attaque|adversarial/, ['red_worker', 'verifier_worker', 'bounded_worker']],
  [/proof|formal|théor|math|preuve|formel|calcul/, ['bounded_worker', 'verifier_worker', 'red_worker']],
  [/measure|benchmark|experiment|mesur|expérience|expériment/, ['experimental_worker', 'scout_cell', 'verifier_worker']],
  [/teach|training|formation|enseigne|pédagog/, ['teaching_worker', 'scout_cell', 'verifier_worker']],
  [/create|crée|création|design|creative|artistique/, ['creative_worker', 'synthesis_worker', 'verifier_worker']],
  [/recover|recovery|restore|récupér|restaur/, ['recovery_worker', 'forensic_worker', 'verifier_worker']],
  [/research|search|observe|étud|recherche|observe|explore/, ['scout_cell', 'adaptive_worker', 'synthesis_worker']]
];

const NICHE_RULES = [
  [/security|sécurité|threat|menace/, 'security'],
  [/backend|frontend|software|logiciel|code|architect/, 'software_engineering'],
  [/data|donnée|database|base de données/, 'data_engineering'],
  [/design|ux|product|produit/, 'product_design'],
  [/allocation|scheduling|ordonnancement/, 'resource_allocation']
];

function defaultAutoKinds(task) {
  const text = String(task || '').toLowerCase();
  return AUTO_KIND_RULES.find(([pattern]) => pattern.test(text))?.[1]
    || ['bounded_worker', 'adaptive_worker', 'verifier_worker'];
}

function inferredNiche(task) {
  const text = String(task || '').toLowerCase();
  return NICHE_RULES.find(([pattern]) => pattern.test(text))?.[1] || null;
}

function firstTruthy(values) {
  return values.find(Boolean);
}

function fallbackValue(value, fallback) {
  return value || fallback;
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
  const selected = resolveWorkerKind(firstTruthy([supplied?.workerKind, supplied?.worker_kind, kind]), supplied?.role);
  assertAssignmentCapabilities(supplied, selected);
  const declaredNiche = firstTruthy([supplied?.nicheDomain, supplied?.specialtyNiche]);
  const nicheDomain = declaredNiche || inferSpecialistNiche(selected, task);
  return require('./workerAssignmentContract').preparePromptAssignment({ ...supplied,
    label: fallbackValue(supplied?.label, `${selected}-${index + 1}`),
    role: fallbackValue(supplied?.role, selected), workerKind: selected,
    hypothesis: fallbackValue(supplied?.hypothesis, `Execute an independent, bounded part of the mission: ${task}`),
    capabilities: fallbackValue(supplied?.capabilities, KIND_CAPABILITIES[selected]),
    ...(nicheDomain ? { nicheDomain } : {}),
    selectionReason: fallbackValue(supplied?.selectionReason, 'selected_from_registered_worker_type_policy') });
}

function inferSpecialistNiche(selected, task) {
  return selected === 'specialist' ? inferredNiche(task) : null;
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
  if (!roster) return defaults.map((supplied, index) => plannedAssignment({
    kind: resolveWorkerKind(supplied.workerKind, supplied.role), index, task, supplied
  }));
  const supplied = assignmentList(roster);
  const typePolicy = roster.typePolicy || { mode: 'auto', kinds: [], quotas: {} };
  if (typePolicy.mode === 'all_registered' && supplied.length !== Object.keys(KINDS).length) {
    throw Object.assign(new Error('Every registered worker kind requires one complete explicit assignment.'), {
      code: 'WORKER_TYPE_ASSIGNMENTS_REQUIRED', requiredAssignments: Object.keys(KINDS).length,
      suppliedAssignments: supplied.length
    });
  }
  const requested = requestedWorkerCount({ roster, typePolicy, supplied, defaults });
  assertExplicitAssignments({ roster, supplied, requested });
  const selectedKinds = kindsForPolicy(typePolicy, task, requested);
  const planned = selectedKinds.map((kind, index) => plannedAssignment({ kind, index, task, supplied: supplied[index] }));
  if (typePolicy.mode === 'all_registered' && new Set(planned.map((item) => item.workerKind)).size !== Object.keys(KINDS).length) {
    throw Object.assign(new Error('The worker roster does not cover every registered worker kind.'), { code: 'WORKER_TYPE_COVERAGE_INCOMPLETE' });
  }
  return planned;
}

function requestedWorkerCount({ roster, typePolicy, supplied, defaults }) {
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
