'use strict';

/**
 * ClinicalTherapy Service — proportionate therapy delivery with iatrogenic effect modeling.
 *
 * Therapies are selected to match the diagnosed pathology and scaled by severity.
 * Every therapy carries iatrogenic risk — unintended side effects that accumulate
 * in the clinical state.
 */

const {
  getClinicalState, refreshClinicalState, recordImmuneEvent,
} = require('./clinicalStateService');
const { PATHOLOGY_DEFINITIONS } = require('./immuneSurveillanceService');

function clamp01(value, fallback = 0) {
  const resolved = Number(value);
  if (!Number.isFinite(resolved)) return fallback;
  return Math.max(0, Math.min(1, resolved));
}

const THERAPIES = {
  cell_cycle_inhibition: {
    maxDosage: 1.0, baseIatrogenicRisk: 0.2, cellCycleEffect: 'arrested',
    wellnessDelta: -0.05,
    efficacyCurve: (sev, dos) => clamp01(sev * 0.8 * dos),
    iatrogenicManifestations: (dos) => [
      { type: 'mitotic_delay', severity: clamp01(dos * 0.3) },
      { type: 'transient_senescence', severity: clamp01(dos * 0.15) },
    ],
  },
  plasmid_suppression: {
    maxDosage: 1.0, baseIatrogenicRisk: 0.15, wellnessDelta: -0.03,
    plasmidReduction: (dos) => clamp01(0.6 * dos),
    efficacyCurve: (sev, dos) => clamp01(sev * 0.7 * dos),
    iatrogenicManifestations: (dos) => [
      { type: 'horizontal_transfer_blocked', severity: clamp01(dos * 0.2) },
      { type: 'capability_atrophy', severity: clamp01(dos * 0.1) },
    ],
  },
  quarantine: {
    maxDosage: 1.0, baseIatrogenicRisk: 0.25, wellnessDelta: -0.1,
    cellCycleEffect: 'arrested',
    efficacyCurve: (sev, dos) => clamp01(sev * 0.95 * dos),
    iatrogenicManifestations: (dos) => [
      { type: 'isolation_stress', severity: clamp01(dos * 0.35) },
      { type: 'communication_deprivation', severity: clamp01(dos * 0.25) },
      { type: 'operational_freeze', severity: dos },
    ],
  },
  immune_stimulation: {
    maxDosage: 1.0, baseIatrogenicRisk: 0.3, wellnessDelta: -0.08,
    immuneBoost: (dos) => clamp01(dos * 0.5),
    inflammatoryDelta: (dos) => clamp01(dos * 0.2),
    efficacyCurve: (sev, dos) => clamp01(sev * 0.6 * dos),
    iatrogenicManifestations: (dos) => [
      { type: 'autoimmune_risk', severity: clamp01(dos * 0.25) },
      { type: 'inflammatory_spike', severity: clamp01(dos * 0.2) },
    ],
  },
  immunosuppressive_wash: {
    maxDosage: 1.0, baseIatrogenicRisk: 0.25, wellnessDelta: -0.05,
    inflammatoryDelta: (dos) => -clamp01(dos * 0.7),
    efficacyCurve: (sev, dos) => clamp01(sev * 0.85 * dos),
    iatrogenicManifestations: (dos) => [
      { type: 'opportunistic_infection_risk', severity: clamp01(dos * 0.3) },
      { type: 'transient_immune_gap', severity: clamp01(dos * 0.2) },
    ],
  },
  apoptosis_induction: {
    maxDosage: 0.5, baseIatrogenicRisk: 0.5, wellnessDelta: -0.3,
    apoptosisRisk: (dos) => clamp01(dos * 0.4),
    efficacyCurve: (sev, dos) => clamp01(sev * 0.9 * dos),
    iatrogenicManifestations: (dos) => [
      { type: 'collateral_apoptosis_risk', severity: clamp01(dos * 0.4) },
      { type: 'tissue_disruption', severity: clamp01(dos * 0.3) },
    ],
  },
  senolytic: {
    maxDosage: 0.7, baseIatrogenicRisk: 0.2, wellnessDelta: -0.05,
    cellCycleEffect: 'G0',
    efficacyCurve: (sev, dos) => clamp01(sev * 0.6 * dos),
    iatrogenicManifestations: (dos) => [
      { type: 'senescent_clearance_stress', severity: clamp01(dos * 0.2) },
    ],
  },
  epigenetic_reset: {
    maxDosage: 0.8, baseIatrogenicRisk: 0.15, wellnessDelta: -0.04,
    efficacyCurve: (sev, dos) => clamp01(sev * 0.5 * dos),
    iatrogenicManifestations: (dos) => [
      { type: 'expression_instability', severity: clamp01(dos * 0.2) },
      { trait_loss: 'transient_silencing', severity: clamp01(dos * 0.1) },
    ],
  },
  supportive_care: {
    maxDosage: 1.0, baseIatrogenicRisk: 0.02, wellnessDelta: 0.05,
    efficacyCurve: (sev, dos) => clamp01(0.3 * dos),
    iatrogenicManifestations: () => [],
  },
  watchful_waiting: {
    maxDosage: 0.1, baseIatrogenicRisk: 0.01, wellnessDelta: 0,
    efficacyCurve: (sev) => clamp01(0.1 * (1 - sev)),
    iatrogenicManifestations: () => [],
  },
};

function selectTherapy(pathologyType, severity) {
  const def = PATHOLOGY_DEFINITIONS[pathologyType];
  const therapyType = def?.therapy || 'watchful_waiting';
  const therapy = THERAPIES[therapyType] || THERAPIES.watchful_waiting;
  const dosage = clamp01(Math.min(severity * 1.2, therapy.maxDosage));
  return { therapyType, dosage, therapy };
}

function checkContraindications(clinicalState, therapyType) {
  const contras = [];
  if (clinicalState.iatrogenicLoad > 0.7) {
    contras.push({ type: 'high_iatrogenic_burden', severity: clinicalState.iatrogenicLoad });
  }
  if (clinicalState.wellnessScore < 0.15 && therapyType === 'apoptosis_induction') {
    contras.push({ type: 'moribund_apoptosis_contraindicated', severity: 0.9 });
  }
  if (clinicalState.inflammatoryIndex > 0.7 && therapyType === 'immune_stimulation') {
    contras.push({ type: 'cytokine_storm_risk', severity: 0.8 });
  }
  if (clinicalState.immuneTiter < 0.2 && therapyType === 'cell_cycle_inhibition') {
    contras.push({ type: 'immunocompromised_mitotic_arrest', severity: 0.7 });
  }
  return contras;
}

function isContraindicated(contraindications) {
  return contraindications.some(c => c.severity > 0.8);
}

function buildStateUpdates(therapy, state, adjustedDosage) {
  const updates = {};
  if (therapy.cellCycleEffect) updates.cellCycleState = therapy.cellCycleEffect;
  if (therapy.immuneBoost) updates.immuneTiter = clamp01(state.immuneTiter + therapy.immuneBoost(adjustedDosage));
  if (therapy.plasmidReduction) updates.plasmidLoad = clamp01(state.plasmidLoad - therapy.plasmidReduction(adjustedDosage));
  if (therapy.apoptosisRisk) {
    updates.vitals = { ...state.vitals, apoptosisRisk: clamp01((state.vitals.apoptosisRisk || 0) + therapy.apoptosisRisk(adjustedDosage)) };
  }
  return updates;
}

async function persistTreatment(db, params) {
  const { agentId, stateId, diagnosis, therapyType, adjustedDosage, iatrogenicRisk, manifestations, efficacy } = params;
  const treatmentId = `treat_${agentId}_${Date.now()}`;
  await db.run(
    `INSERT INTO treatments (id, agent_id, pathology_id, clinical_state_id, therapy_type, dosage, iatrogenic_risk, iatrogenic_manifestations_json, efficacy_score, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
    treatmentId, agentId, diagnosis.biopsyRef || null, stateId,
    therapyType, adjustedDosage, iatrogenicRisk, JSON.stringify(manifestations), efficacy
  );
  return treatmentId;
}

async function applyTherapy(db, agentId, options) {
  const { diagnosis } = options || {};
  const state = await getClinicalState(db, agentId);
  if (!state) return { ok: false, error: 'no_clinical_state' };

  const { therapyType, dosage, therapy } = selectTherapy(diagnosis.pathologyType, diagnosis.severity);
  const contraindications = checkContraindications(state, therapyType);

  if (isContraindicated(contraindications)) {
    await recordImmuneEvent(db, agentId, {
      clinicalStateId: state.id, eventType: 'therapy_completed',
      eventData: { therapyType, status: 'contraindicated', contraindications }, severity: 'warning',
    });
    return { ok: false, status: 'contraindicated', contraindications };
  }

  const adjustedDosage = contraindications.length > 0 ? dosage * 0.5 : dosage;
  const iatrogenicRisk = clamp01(therapy.baseIatrogenicRisk * adjustedDosage * (1 + state.iatrogenicLoad * 0.5));
  const manifestations = therapy.iatrogenicManifestations ? therapy.iatrogenicManifestations(adjustedDosage) : [];
  const efficacy = therapy.efficacyCurve(diagnosis.severity, adjustedDosage);

  const updates = buildStateUpdates(therapy, state, adjustedDosage);
  updates.iatrogenicDelta = iatrogenicRisk * 0.3;
  if (therapy.inflammatoryDelta) {
    updates.inflammatoryIndex = clamp01(state.inflammatoryIndex + therapy.inflammatoryDelta(adjustedDosage));
  }

  const treatmentId = await persistTreatment(db, {
    agentId, stateId: state.id, diagnosis, therapyType,
    adjustedDosage, iatrogenicRisk, manifestations, efficacy
  });
  const newClinicalState = await refreshClinicalState(db, agentId, updates);

  if (therapy.wellnessDelta) {
    const newIntegrity = clamp01((state.vitals.cognitiveIntegrity || 0.8) + therapy.wellnessDelta);
    await refreshClinicalState(db, agentId, { vitals: { ...newClinicalState.vitals, cognitiveIntegrity: newIntegrity } });
  }

  await recordImmuneEvent(db, agentId, {
    clinicalStateId: state.id, eventType: 'therapy_initiated',
    eventData: { therapyType, dosage: adjustedDosage, iatrogenicRisk, efficacy, manifestations: manifestations.length },
    severity: iatrogenicRisk > 0.3 ? 'warning' : 'info',
  });

  const finalState = await getClinicalState(db, agentId);
  const wellnessAfter = computeNewWellness(finalState);
  await db.run(
    `UPDATE treatments SET status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE id = ?`,
    treatmentId
  );

  await recordImmuneEvent(db, agentId, {
    clinicalStateId: state.id, eventType: 'therapy_completed',
    eventData: { therapyType, efficacy, iatrogenicRisk, treatmentId }, severity: 'info',
  });

  return { ok: true, treatmentId, therapyType, dosage: adjustedDosage, iatrogenicRisk, manifestations, efficacy, wellnessAfter, contraindications };
}

function computeNewWellness(state) {
  const stressPenalty = clamp01(state.vitals.stress) * 0.3;
  const burdenPenalty = state.pathogenBurden * 0.25 + state.inflammatoryIndex * 0.2 + state.iatrogenicLoad * 0.15 + state.plasmidLoad * 0.1;
  const base = clamp01(state.vitals.cognitiveIntegrity) * 0.3 + clamp01(state.vitals.budgetRatio) * 0.2 + clamp01(state.immuneTiter) * 0.2;
  return clamp01(base - stressPenalty - burdenPenalty + 0.3, 0.5);
}

async function getTreatmentHistory(db, agentId, limit = 10) {
  if (!db || !agentId) return [];
  return db.all(
    `SELECT * FROM treatments WHERE agent_id = ? ORDER BY prescribed_at DESC LIMIT ?`,
    agentId, limit
  );
}

async function getActiveTreatments(db, agentId) {
  if (!db || !agentId) return [];
  return db.all(
    `SELECT * FROM treatments WHERE agent_id = ? AND status = 'active'`, agentId
  );
}

module.exports = {
  THERAPIES, selectTherapy, checkContraindications, applyTherapy, getTreatmentHistory, getActiveTreatments,
};