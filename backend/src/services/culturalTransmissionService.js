'use strict';

const TRANSMISSION_MODES = {
  imitation: { label: 'Imitation', fidelity: 0.6, cost: 0.1 },
  demonstration: { label: 'Démonstration', fidelity: 0.8, cost: 0.3 },
  teaching: { label: 'Enseignement', fidelity: 0.9, cost: 0.5 },
  apprenticeship: { label: 'Apprentissage', fidelity: 0.95, cost: 0.7 },
  artifact_use: { label: "Artefact", fidelity: 0.5, cost: 0.05 },
};

function getMode(mode) {
  return TRANSMISSION_MODES[mode] || TRANSMISSION_MODES.imitation;
}

function createTransmission(opts) {
  opts = opts || {};
  const mode = getMode(opts.mode);
  return {
    id: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    sourceAgentId: opts.sourceAgentId,
    targetAgentId: opts.targetAgentId,
    artifactId: opts.artifactId,
    mode: opts.mode || 'imitation',
    fidelity: opts.fidelity || mode.fidelity,
    cost: opts.cost || mode.cost,
    timestamp: new Date().toISOString(),
    status: 'pending',
    context: opts.context || {},
    outcome: null,
  };
}

function computeEfficiency(transmission, artifact, skills) {
  const mode = getMode(transmission.mode);
  const skillGap = Math.max(0, (skills.sourceSkill || 0.5) - (skills.targetSkill || 0.3));
  const artifactQuality = (artifact && (artifact.quality || artifact.confidence)) || 0.5;
  return mode.fidelity * artifactQuality * (1 + skillGap);
}

function simulateTransmission(opts) {
  const transmission = opts.transmission;
  const artifact = opts.artifact;
  const skills = opts.skills || {};

  const efficiency = computeEfficiency(transmission, artifact, skills);
  const success = Math.random() < efficiency;
  const mode = getMode(transmission.mode);
  const targetSkill = skills.targetSkill || 0.3;

  return {
    ...transmission,
    status: success ? 'transmitted' : 'failed',
    outcome: buildOutcome({ efficiency, success, mode, artifact, targetSkill }),
    completedAt: new Date().toISOString(),
  };
}

function buildOutcome(opts) {
  const quality = (opts.artifact && (opts.artifact.quality || opts.artifact.confidence)) || 0.5;
  return {
    efficiency: opts.efficiency,
    skillGap: 0,
    artifactQuality: quality,
    success: opts.success,
    newSkillLevel: opts.success ? Math.min(1, opts.targetSkill + 0.1 * opts.mode.fidelity) : opts.targetSkill,
  };
}

function createCulturalArtifact(opts) {
  opts = opts || {};
  return {
    id: `cult_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    agentId: opts.agentId,
    type: opts.type,
    content: opts.content,
    lineage: opts.lineage || [opts.agentId],
    provenance: opts.provenance || { createdBy: opts.agentId, createdAt: new Date().toISOString() },
    quality: opts.quality || 0.5,
    usageCount: 0,
    successCount: 0,
    innovation: opts.innovation || null,
    createdAt: new Date().toISOString(),
    active: true,
  };
}

function cloneArtifact(artifact) {
  return JSON.parse(JSON.stringify(artifact));
}

function assignMutationId(mutated) {
  mutated.id = `cult_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function updateMutatedFields(mutated, artifact, context) {
  mutated.lineage = [...(artifact.lineage || []), artifact.agentId];
  mutated.provenance = {
    mutatedFrom: artifact.id,
    mutationType: context && context.mutationType,
    mutatedAt: new Date().toISOString(),
    context,
  };
  mutated.quality = Math.max(0, artifact.quality - 0.05);
  mutated.usageCount = 0;
  mutated.successCount = 0;
  mutated.createdAt = new Date().toISOString();
}

function mutateArtifact(opts) {
  const artifact = opts.artifact;
  const context = opts.context;
  const mutated = cloneArtifact(artifact);
  assignMutationId(mutated);
  updateMutatedFields(mutated, artifact, context);
  return mutated;
}

module.exports = {
  TRANSMISSION_MODES,
  createTransmission,
  simulateTransmission,
  createCulturalArtifact,
  mutateArtifact,
};
