'use strict';

const REQUIRED_FIELDS = Object.freeze({
  scout_observation: ['observations'], dossier: ['claims'],
  verification_report: ['testedClaim', 'verificationMethod', 'verdict', 'reproductionSteps', 'evidence'],
  experiment_record: ['hypothesis', 'protocol', 'measurements'],
  formal_certificate: ['claim', 'solver', 'result', 'solverReceipt'],
  synthesis_dossier: ['synthesis', 'sources'],
  creative_candidate: ['candidate', 'assumptions', 'falsificationTest'],
  clinical_report: ['caseScope', 'differentialConsiderations', 'uncertainty', 'safetyNote'],
  causal_dossier: ['causalChain', 'evidence'], training_packet: ['prerequisites', 'steps', 'evidence']
});

const CONTENT_TEMPLATES = Object.freeze({
  scout_observation: { observations: [{ observation: '<observation>', sourceRefs: ['<source-ref>'], confidence: 0.5, uncertainties: [] }] },
  dossier: { claims: [{ statement: '<claim>', evidence: ['<source-ref>'] }] },
  verification_report: { testedClaim: '<claim>', verificationMethod: '<method>', verdict: 'reject', reproductionSteps: ['<step>'], evidence: ['<reproduction-ref>'] },
  experiment_record: { hypothesis: '<hypothesis>', protocol: ['<step>'], measurements: [{ metric: '<metric>', value: 0, unit: '<unit>', evidence: ['<measurement-ref>'] }] },
  formal_certificate: { claim: '<exact-claim>', solver: '<solver-name>', result: '<solver-result>', solverReceipt: { id: '<receipt-id>', claim: '<exact-claim>', solver: '<solver-name>', result: '<solver-result>', evidence: ['<receipt-ref>'] } },
  synthesis_dossier: { synthesis: '<synthesis>', sources: ['<source-ref>'], disagreements: [] },
  creative_candidate: { candidate: '<candidate>', assumptions: ['<assumption>'], falsificationTest: '<test>' },
  clinical_report: { caseScope: 'synthetic_educational', differentialConsiderations: ['<general-consideration>'], uncertainty: '<uncertainty>', safetyNote: 'No individual diagnosis or treatment advice.' },
  causal_dossier: { causalChain: [{ from: '<event-ref>', to: '<event-ref>', relation: '<causal-link>', evidence: ['<receipt-ref>'] }], evidence: ['<receipt-ref>'] },
  training_packet: { prerequisites: ['<prerequisite>'], steps: ['<step>'], evidence: ['<source-ref>'] }
});

function artifactInstruction(contract) {
  const required = contract?.evidence?.requiredArtifacts || [];
  if (!required.length) return '';
  const kind = contract.identity?.workerKind;
  const custom = customInstruction(kind, contract);
  if (custom) return custom;
  const rhizome = rhizomeArtifactInstruction(contract, required);
  if (rhizome) return rhizome;
  const artifact = { type: required[0], content: templateForWorker(contract, required[0]) };
  if (required.every((type) => type === 'dossier')) {
    return `Return one JSON object matching this contract: ${JSON.stringify({ outcome: 'success', claims: CONTENT_TEMPLATES.dossier.claims })}. The top-level claims form the dossier; cite source references in evidence.`;
  }
  return `Return one JSON object matching this contract: ${JSON.stringify({ outcome: 'success', claims: CONTENT_TEMPLATES.dossier.claims, workerArtifact: { ...artifact, provenance: { sourceRefs: ['<source-ref>'] } } })}. Keep the artifact under workerArtifact; its type must be ${artifact.type}. Do not put type or content at the root. Include source references in claims.evidence and workerArtifact.provenance.`;
}

function customInstruction(kind, contract) {
  if (kind === 'resident_daemon') return schemaInstruction('Report only observations from the assigned territory, with a timestamp and source references.', { territoryReport: { territoryId: '<assigned-territory>', observedAt: '<ISO-8601>', sourceRefs: ['<source-ref>'] } });
  if (kind === 'bounded_worker') return schemaInstruction('Complete only the assigned scope. Report its scope reference and references to completed outputs.', { scopeCompletion: { scopeRef: '<assigned-scope-ref>', completedRefs: ['<result-ref>'] } });
  if (kind === 'adaptive_worker') return schemaInstruction('Use only strategies declared by the contract and record each strategy decision with its reason and evidence.', { strategyTrace: [{ strategy: '<contract-strategy>', decision: 'retained', reason: '<reason>', evidence: ['<evidence-ref>'] }] });
  if (kind === 'specialist') return specialistInstruction(contract.mission?.specialtyNiche);
  if (kind === 'symbiotic_worker') return schemaInstruction(`Use only the host contract '${contract.mission.hostContractId}' and its declared capabilities.`, { hostContribution: { hostContractId: contract.mission.hostContractId, capability: '<host-capability>', contractCompliant: true, evidence: ['<receipt-ref>'] } });
  if (kind === 'sub_orchestrator') return schemaInstruction(`Coordinate no more than ${contract.limits?.maxChildren || 0} children. Report each child outcome with its evidence references.`, { childSummaries: [{ childId: '<child-id>', outcome: 'success', evidence: ['<child-receipt-ref>'] }] });
  if (kind === 'recovery_worker') return schemaInstruction('Return a dossier plus the executed recovery receipt. Do not claim restoration without a receipt.', { recoveryReceipt: { action: '<leased-action>', restoredState: '<restored-state>', receiptId: '<receipt-id>', evidence: ['<receipt-ref>'] } });
  if (kind === 'liaison_worker') return schemaInstruction('Return the dossier and explicit recipient-bound handoff. Keep the groups distinct and cite every transferred item.', { handoff: { sourceGroup: '<source-group>', targetGroup: '<target-group>', deliveredRefs: ['<source-ref>'] } });
  return '';
}

function schemaInstruction(text, fields) {
  return `${text} Schema: ${JSON.stringify({ outcome: 'success', claims: CONTENT_TEMPLATES.dossier.claims, ...fields })}`;
}

function specialistInstruction(niche) {
  const output = { outcome: 'success', claims: CONTENT_TEMPLATES.dossier.claims,
    specialtyAssessment: { niche, inScope: true, evidence: ['<scope-evidence-ref>'] } };
  return `Work only in the declared niche '${niche}'. If the task is outside it, return unresolved. Schema: ${JSON.stringify(output)}`;
}

function templateForWorker(contract, type) {
  const template = CONTENT_TEMPLATES[type];
  if (contract.identity?.workerKind !== 'red_worker' || type !== 'verification_report') return template;
  return { ...template, counterexamples: [{ claim: '<claim>', attack: '<attack>', reproductionSteps: ['<step>'], evidence: ['<receipt-ref>'] }] };
}

function rhizomeArtifactInstruction(contract, required) {
  const objective = contract?.mission?.objective || '';
  if (!/Mission Rhizome|Rhizome discovery branch/i.test(objective)) return '';
  const output = { outcome: 'success', claims: CONTENT_TEMPLATES.dossier.claims,
    answer: '<branch answer>', capabilities: [], unknownDependencies: [], interfaces: [], assumptions: [], evidence: [] };
  const type = required[0];
  if (type && type !== 'dossier') output.workerArtifact = { type, content: CONTENT_TEMPLATES[type], provenance: { sourceRefs: ['<source-ref>'] } };
  return `This is a Rhizome capability-mapping branch. Return one JSON object matching this schema: ${JSON.stringify(output)}. Keep the complete capability map at the top level, fill every listed field, cite only real references or label observations, and never invent evidence.`;
}

module.exports = { REQUIRED_FIELDS, CONTENT_TEMPLATES, artifactInstruction };
