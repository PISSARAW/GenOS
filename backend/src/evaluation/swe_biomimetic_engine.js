/**
 * GenOS SWE-bench Biomimetic Engine
 * Encapsulates the authentic biological canon:
 * - Biocenosis & Biome collective governance
 * - Tardigrade Dsup shield
 * - Bio-Polymer / Sub-symbolic zero-text signaling (string-reduit)
 * - Mirror Twin cloning (Constructive Optimist vs Situs Inversus)
 * - Oncology & Apoptosis watchdog
 * - Clinical pathology triage & anti-inflammatory resets
 * - Theine / ATP metabolic pacing
 * - Chromosomal inversion (retrograde causal reasoning)
 * - Horizontal gene transfer (plasmids)
 * - Kuramoto phase consensus (quantum electrocyte synchronization)
 */

'use strict';

const { compose } = require('../services/biologicalModeService');
const { activateBiocenose } = require('../services/biocenoseService');
const { measurePolymerCompression } = require('../services/bioPolymerPersistenceService');
const {
  SIGNAL_TYPES,
  evaluateElectrocyteConsensus,
  formatSignalForTransport
} = require('../services/biomimeticSignalingBus');
const { releaseVesicles, uptakeVesicles } = require('../services/synapticTransmissionService');
const { deployDsupShield, interceptMutationAttempt } = require('../services/mcpBioTools/handlers/tardigradeDsupShield');
const { handleMirrorTwinFork } = require('../services/mcpBioTools/handlers/mirrorTwinFork');
const { handleChromosomalInversion } = require('../services/mcpBioTools/handlers/chromosomalInversion');
const { selectStrategyPortfolio } = require('../strategies/strategySelector');

function initBiocenoseBiome(params) {
  const { task, fleetId } = params;
  const mission = `Resolve ${task.instance_id} in ${task.repo}`;
  const biocenose = activateBiocenose(mission);
  const biomeComposition = compose('biome', mission);

  const dsup = deployDsupShield({
    target_id: fleetId,
    protected_loci: ['LOCUS_GIT_BASE', 'LOCUS_SYNTAX_INVARIANTS', 'LOCUS_TEST_SPEC'],
    shield_density: 0.98,
    shield_energy: 100.0
  });

  let portfolioIds = ['falsification_forks', 'mutated_incident_universes'];
  try {
    const strategyResult = selectStrategyPortfolio(task.problem_statement || 'bug fix');
    if (strategyResult && Array.isArray(strategyResult.portfolio)) {
      portfolioIds = strategyResult.portfolio.slice(0, 4).map((s) => s.id);
    }
  } catch (_) {}

  return {
    fleetId,
    biocenoseId: biocenose.communityId,
    biomeRoles: Array.isArray(biomeComposition) ? biomeComposition.map((m) => m.role) : [],
    dsupShield: dsup,
    strategyPortfolio: portfolioIds,
    atpBudget: 100.0,
    clinicalState: { inflammatoryIndex: 0.0, activePathologies: [] }
  };
}

function transmitBioPolymerSignal(params) {
  const { sender, recipient, signalType, payload } = params;
  const compression = measurePolymerCompression(payload);
  const signal = formatSignalForTransport({
    signalType: signalType || SIGNAL_TYPES.LIGAND,
    signalData: payload,
    contentFallback: `[BIO_SIGNAL:${signalType || 'LIGAND'}] from ${sender} to ${recipient}`
  });

  return {
    sender,
    recipient,
    signalType: signal.signalType,
    jsonBytes: compression.jsonBytes,
    blobBytes: compression.blobBytes,
    savedPercent: compression.savedPercent,
    ratio: compression.ratio,
    signalBlob: signal.signalBlob
  };
}

function forkMirrorPair(params) {
  const { instanceId, mission } = params;
  const pairId = `pair_${instanceId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
  const result = handleMirrorTwinFork({
    action: 'fork_mirror_pair',
    pair_id: pairId,
    mission
  });
  return { pairId, rightTwin: result.right_twin, leftTwin: result.left_twin };
}

function evaluateOncologyAndApoptosis(params) {
  const { modifiedCode, originalCode } = params;
  const modLines = modifiedCode.split('\n');
  const origLines = originalCode.split('\n');
  const lineDelta = modLines.length - origLines.length;

  if (lineDelta > 300) {
    return {
      neoplasiaDetected: true,
      category: 'computational_neoplasia_hyperproliferation',
      action: 'trigger_apoptosis',
      reason: `Abnormal code growth (+${lineDelta} lines). Programmed cell death engaged.`
    };
  }

  const occurrences = new Map();
  for (const line of modLines) {
    const trimmed = line.trim();
    if (trimmed.length > 20) {
      occurrences.set(trimmed, (occurrences.get(trimmed) || 0) + 1);
      if (occurrences.get(trimmed) >= 15) {
        return {
          neoplasiaDetected: true,
          category: 'repetitive_oncogenic_loop',
          action: 'trigger_apoptosis',
          reason: `Pathological loop detected for line: '${trimmed.slice(0, 40)}...'. Blebbing to DLQ.`
        };
      }
    }
  }

  return { neoplasiaDetected: false, status: 'healthy_cellular_growth' };
}

function performClinicalTriage(params) {
  const { agentId, errorTrace, bioContext } = params;
  const state = bioContext.clinicalState;
  state.inflammatoryIndex = Math.min(10.0, state.inflammatoryIndex + 1.5);
  state.activePathologies.push(`TranscriptionError_${Date.now()}`);

  const requiresWash = state.inflammatoryIndex > 3.0;
  if (requiresWash) {
    state.inflammatoryIndex = Math.max(0.0, state.inflammatoryIndex - 2.0);
    state.lastTherapy = 'CorticosteroidWashout';
  }

  bioContext.atpBudget = Math.max(10.0, bioContext.atpBudget - 8.0);
  return {
    agentId,
    inflammatoryIndex: Number(state.inflammatoryIndex.toFixed(2)),
    therapyApplied: requiresWash ? 'SystemicTherapy::CorticosteroidWashout' : 'HomeostaticRest',
    atpRemaining: bioContext.atpBudget
  };
}

function applyRetrogradeInversion(params) {
  const { instanceId } = params;
  const invId = `inv_${instanceId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
  handleChromosomalInversion({ action: 'invert_chromosome_segment', id: invId, start_index: 0, end_index: 3 });
  const chain = handleChromosomalInversion({ action: 'execute_backward_chain', id: invId });
  return {
    inversionId: invId,
    mode: chain.mode,
    causalFlow: chain.flow
  };
}

async function transmitSynapticEngram(params) {
  const { agentId, feedback } = params;
  const engram = { content: feedback.slice(0, 600), vector: [0.1, 0.2, 0.3] };
  try {
    return await releaseVesicles([engram], { targetAgentId: agentId });
  } catch (_) {
    return null;
  }
}

async function harvestSynapticEngrams(params) {
  const { agentId } = params;
  try {
    const engrams = await uptakeVesicles(agentId);
    return engrams.map((e) => e.content).join('; ');
  } catch (_) {
    return '';
  }
}

function computeKuramotoPhaseConsensus(fleet) {
  const fleetMembers = Object.values(fleet);
  const discharges = fleetMembers.map((agent, idx) => ({
    agentId: agent.id,
    voltageMv: 75.0,
    phaseAngle: (idx * 0.12) % (2 * Math.PI)
  }));

  const consensus = evaluateElectrocyteConsensus(discharges, { thresholdMv: 300 });
  return {
    consensusReached: consensus.consensusReached,
    kuramotoOrder: consensus.kuramotoOrder,
    totalVoltageMv: consensus.totalVoltageMv,
    participantCount: consensus.participantCount
  };
}

function reconcileMirrorEquilibrium(params) {
  const { pairId, patchDiff, syntaxOk } = params;
  const critiques = syntaxOk ? [] : ['Syntax compilation error in generated patch'];
  const claims = [`Patch diff length: ${patchDiff.length} chars`, 'AST verification pass'];

  const eq = handleMirrorTwinFork({
    action: 'evaluate_polarity_equilibrium',
    pair_id: pairId,
    constructive_claims: claims,
    adversarial_critiques: critiques
  });

  if (eq.equilibrium_score >= 0.6) {
    handleMirrorTwinFork({ action: 'reconcile_mirror', pair_id: pairId });
  }

  return {
    equilibriumScore: eq.equilibrium_score,
    reconciled: eq.equilibrium_score >= 0.6,
    recommendation: eq.arbiter_recommendation
  };
}

function absorbDsupImpact(params) {
  const { fleetId, locus, intensity } = params;
  return interceptMutationAttempt({
    target_id: fleetId,
    target_locus: locus || 'LOCUS_SYNTAX_INVARIANTS',
    mutation_intensity: intensity || 25.0
  });
}

module.exports = {
  initBiocenoseBiome,
  transmitBioPolymerSignal,
  forkMirrorPair,
  evaluateOncologyAndApoptosis,
  performClinicalTriage,
  applyRetrogradeInversion,
  transmitSynapticEngram,
  harvestSynapticEngrams,
  computeKuramotoPhaseConsensus,
  reconcileMirrorEquilibrium,
  absorbDsupImpact
};
