'use strict';

const CONTRACTS = [
  { domain: 'logical_reasoning', artifact: 'formal_argument', pattern: /corbeaux|corbeau|fallace|inférence|inference|logical reasoning/i,
    instruction: 'Separate premises, deductive validity, inductive support, and necessity. State one concrete countermodel for each invalid inference; do not infer population facts from the sample.' },
  { domain: 'performance_diagnosis', artifact: 'diagnostic_matrix', pattern: /latence|lenteur|cpu|garbage collection|verrou|lock contention|ralentissement/i,
    instruction: 'Compare every named hypothesis in a table with predicted signals, contradictory observations, and a discriminating measurement. Keep the result conditional until a measurement is supplied.' },
  { domain: 'combinatorial_algorithm', artifact: 'weighing_tree', pattern: /12 pièces|12 pieces|balance à plateaux|balance a plateaux|three weighings|trois pesées/i,
    instruction: 'Return artifact.weighingTree as a three-level adaptive tree. Each node has weighing.left/right coin numbers and branches left_heavy, right_heavy, balance; each leaf has result.coin and result.direction (heavy or light). Include no prose claim of coverage without simulator verification.' },
  { domain: 'architecture_decision', artifact: 'criteria_matrix', pattern: /microservices|event sourcing|event-sourcing|cqrs|système financier|financial system/i,
    instruction: 'Compare each named option against the same criteria in a matrix. Mark unmeasured values null, attach evidence IDs to measured values, and explain dominance only from comparable measured values.' },
  { domain: 'multi_objective_planning', artifact: 'candidate_vectors', pattern: /planification.*trajet|plan.*route|consommation énergétique|energy consumption|pareto/i,
    instruction: 'List required decision variables and missing inputs before proposing plans. For each candidate, provide the actual plan and a measured objective vector; do not claim a Pareto front without at least two evidence-backed vectors.' }
];

function contractFor(mission) {
  const text = String(mission || '');
  return CONTRACTS.find((contract) => contract.pattern.test(text)) || {
    domain: 'software_engineering', artifact: 'technical',
    instruction: 'Return a concrete artifact, explicit acceptance checks, evidence IDs, uncertainties, and execution limits. Separate measured results from assumptions.'
  };
}

function promptInstruction(contract) {
  return `Mission contract (${contract.domain}; artifact=${contract.artifact}): ${contract.instruction}`;
}

module.exports = { CONTRACTS, contractFor, promptInstruction };
