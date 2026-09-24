'use strict';

/**
 * ImmuneSurveillance Service — detect, quarantine, biopsy, diagnose, therapy orchestration.
 *
 * Analogous to the adaptive immune system: constant surveillance of agent
 * clinical state, detection of anomalies, quarantine of suspect mutations,
 * biopsy (detailed evidence gathering), diagnosis (classification), and
 * proportionate therapy selection.
 */

const {
  getClinicalState, refreshClinicalState, recordImmuneEvent,
} = require('./clinicalStateService');

function clamp01(value, fallback = 0) {
  const resolved = Number(value);
  if (!Number.isFinite(resolved)) return fallback;
  return Math.max(0, Math.min(1, resolved));
}

const PATHOLOGY_DEFINITIONS = {
  mutation_drift: {
    detect: (state) => state.vitals.dissonance > 0.6 && state.wellnessScore < 0.5,
    severity: (state) => clamp01(state.vitals.dissonance),
    evidence: (state) => ['dissonance:' + state.vitals.dissonance.toFixed(2)],
    therapy: 'epigenetic_reset', minConfidence: 0.4,
  },
  plasmid_overload: {
    detect: (state) => state.plasmidLoad > 0.7,
    severity: (state) => clamp01(state.plasmidLoad),
    evidence: (state) => ['plasmid_load:' + state.plasmidLoad.toFixed(2)],
    therapy: 'plasmid_suppression', minConfidence: 0.5,
  },
  immune_exhaustion: {
    detect: (state) => state.immuneTiter < 0.3 && state.pathogenBurden > 0.5,
    severity: (state) => clamp01(1 - state.immuneTiter),
    evidence: (state) => ['immune_titer:' + state.immuneTiter.toFixed(2), 'pathogen:' + state.pathogenBurden.toFixed(2)],
    therapy: 'immune_stimulation', minConfidence: 0.4,
  },
  iatrogenic_toxicity: {
    detect: (state) => state.iatrogenicLoad > 0.6,
    severity: (state) => clamp01(state.iatrogenicLoad),
    evidence: (state) => ['iatrogenic_load:' + state.iatrogenicLoad.toFixed(2)],
    therapy: 'supportive_care', minConfidence: 0.3,
  },
  cell_cycle_malignancy: {
    detect: (state) => state.cellCycleState === 'M' && state.wellnessScore < 0.3,
    severity: (state) => clamp01(1 - state.wellnessScore),
    evidence: (state) => ['cell_cycle:' + state.cellCycleState, 'wellness:' + state.wellnessScore.toFixed(2)],
    therapy: 'cell_cycle_inhibition', minConfidence: 0.5,
  },
  cognitive_metastasis: {
    detect: (state) => state.vitals.cognitiveIntegrity < 0.2 && state.wellnessScore < 0.2,
    severity: (state) => clamp01(1 - state.vitals.cognitiveIntegrity),
    evidence: (state) => ['cognitive_integrity:' + state.vitals.cognitiveIntegrity.toFixed(2)],
    therapy: 'quarantine', minConfidence: 0.6,
  },
  inflammatory_cytokine_storm: {
    detect: (state) => state.inflammatoryIndex > 0.8,
    severity: (state) => clamp01(state.inflammatoryIndex),
    evidence: (state) => ['inflammatory_index:' + state.inflammatoryIndex.toFixed(2)],
    // Un orage cytokinique exige un immunosuppresseur (jamais de stimulation).
    therapy: 'immunosuppressive_wash', minConfidence: 0.4,
  },
  quarantine_breach: {
    detect: (state) => state.pathogenBurden > 0.8 && state.immuneTiter < 0.3,
    severity: (state) => clamp01(state.pathogenBurden),
    evidence: (state) => ['pathogen_burden:' + state.pathogenBurden.toFixed(2)],
    therapy: 'quarantine', minConfidence: 0.5,
  },
  senescence_escape: {
    detect: (state) => state.cellCycleState === 'senescent' && state.vitals.energy > 0.7,
    severity: (state) => clamp01(state.vitals.energy),
    evidence: (state) => ['senescence_with_high_energy:' + state.vitals.energy.toFixed(2)],
    therapy: 'senolytic', minConfidence: 0.5,
  },
};

async function loadScanState(db, agentId, context) {
  if (context && Object.keys(context).length > 0) {
    return refreshClinicalState(db, agentId, context);
  }
  return getClinicalState(db, agentId);
}

async function surveillanceScan(db, agentId, context = {}) {
  // Seuils atteignables: sans observations, relit l'état persisté au lieu de
  // réinitialiser (refreshClinicalState avec contexte vide remettrait les
  // charges à zéro et aucun seuil ne pourrait jamais se déclencher).
  const state = await loadScanState(db, agentId, context);
  if (!state) return { state, detections: [], quarantine: false };

  const detections = [];
  for (const [pType, def] of Object.entries(PATHOLOGY_DEFINITIONS)) {
    try {
      if (def.detect(state)) {
        const severity = def.severity(state);
        const confidence = clamp01(severity * 0.7 + 0.3);
        if (confidence >= def.minConfidence) {
          detections.push({
            pathologyType: pType, severity, confidence,
            evidence: def.evidence(state), recommendedTherapy: def.therapy,
          });
        }
      }
    } catch (_) { /* skip this pathology */ }
  }

  const quarantine = detections.some(
    d => (d.pathologyType === 'cognitive_metastasis' || d.pathologyType === 'quarantine_breach') && d.confidence > 0.6
  );

  await recordImmuneEvent(db, agentId, {
    clinicalStateId: state.id,
    eventType: detections.length > 0 ? 'anomaly_detected' : 'surveillance_scan',
    eventData: { detectionCount: detections.length, quarantine, wellness: state.wellnessScore },
    severity: quarantine ? 'warning' : 'info',
  });

  return { state, detections, quarantine };
}

function gatherVitalEvidence(state) {
  return [
    { field: 'vitals', value: state.vitals, weight: 0.3 },
    { field: 'cell_cycle', value: state.cellCycleState, weight: 0.15 },
    { field: 'immune_titer', value: state.immuneTiter, weight: 0.2 },
    { field: 'iatrogenic_load', value: state.iatrogenicLoad, weight: 0.1 },
    { field: 'plasmid_load', value: state.plasmidLoad, weight: 0.1 },
    { field: 'inflammatory_index', value: state.inflammatoryIndex, weight: 0.15 },
  ];
}

async function gatherTreatmentEvidence(db, agentId) {
  const recentTreatments = await db.all(
    `SELECT therapy_type, status, efficacy_score FROM treatments WHERE agent_id = ? ORDER BY prescribed_at DESC LIMIT 5`, agentId
  );
  return { field: 'treatment_history', value: recentTreatments, weight: 0.2 };
}

async function gatherEventEvidence(db, agentId) {
  const recentEvents = await db.all(
    `SELECT event_type, severity FROM immune_events WHERE agent_id = ? ORDER BY created_at DESC LIMIT 10`, agentId
  );
  return { field: 'immune_event_history', value: recentEvents, weight: 0.15 };
}

async function biopsy(db, agentId, pathologyType) {
  const state = await getClinicalState(db, agentId);
  if (!state) return { ok: false, error: 'no_clinical_state' };

  const biopsyId = `biopsy_${agentId}_${Date.now()}`;
  const evidence = gatherVitalEvidence(state);
  evidence.push(await gatherTreatmentEvidence(db, agentId));
  evidence.push(await gatherEventEvidence(db, agentId));

  const biopsyRef = `pathology_${agentId}_${Date.now()}`;
  await db.run(
    `INSERT INTO pathologies (id, agent_id, clinical_state_id, pathology_type, severity, confidence, evidence_json, biopsy_ref, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'biopsied')`,
    biopsyRef, agentId, state.id, pathologyType,
    state.wellnessScore < 0.3 ? 0.8 : 0.5, 0.7, JSON.stringify(evidence), biopsyId
  );

  await recordImmuneEvent(db, agentId, {
    clinicalStateId: state.id, eventType: 'biopsy_collected',
    eventData: { pathologyType, biopsyRef, evidenceCount: evidence.length }, severity: 'info',
  });

  return { ok: true, biopsyId, biopsyRef, evidence, state };
}

async function diagnose(db, agentId, biopsyRef) {
  const pathology = await db.get('SELECT * FROM pathologies WHERE id = ? AND agent_id = ?', biopsyRef, agentId);
  if (!pathology) return { ok: false, error: 'biopsy_not_found' };

  let evidence = [];
  try { evidence = JSON.parse(pathology.evidence_json || '[]'); } catch (_) {}

  const confidence = computeDiagnosisConfidence(pathology, evidence);
  const confirmed = confidence > 0.5 && pathology.severity > 0.3;

  await db.run(`UPDATE pathologies SET status = ?, confidence = ? WHERE id = ?`,
    confirmed ? 'confirmed' : 'suspected', confidence, biopsyRef);

  const therapy = PATHOLOGY_DEFINITIONS[pathology.pathologyType]?.therapy || 'watchful_waiting';
  await recordImmuneEvent(db, agentId, {
    clinicalStateId: pathology.clinical_state_id, eventType: 'diagnosis_rendered',
    eventData: { pathologyType: pathology.pathologyType, confirmed, confidence, recommendedTherapy: therapy },
    severity: confirmed ? 'warning' : 'info',
  });

  return { ok: true, biopsyRef, pathologyType: pathology.pathologyType, confirmed, confidence, severity: pathology.severity, recommendedTherapy: therapy };
}

function computeDiagnosisConfidence(pathology, evidence) {
  const evidenceScore = evidence.reduce((sum, e) => {
    const v = typeof e.value === 'number' ? clamp01(e.value) : 0;
    return sum + v * (e.weight || 0);
  }, 0);
  return clamp01(pathology.confidence * 0.5 + evidenceScore * 0.5);
}

async function quarantine(db, agentId, opts) {
  const { reason, context = {} } = opts || {};
  const state = await getClinicalState(db, agentId);
  if (!state) return { ok: false, error: 'no_clinical_state' };

  await recordImmuneEvent(db, agentId, {
    clinicalStateId: state.id, eventType: 'quarantine_initiated',
    eventData: { reason, ...context }, severity: 'warning',
  });

  await db.run("UPDATE agents SET status = 'blocked', updated_at = CURRENT_TIMESTAMP WHERE id = ?", agentId);
  await db.run("UPDATE clinical_states SET cell_cycle_state = 'arrested', updated_at = CURRENT_TIMESTAMP WHERE agent_id = ?", agentId);
  return { ok: true, agentId, reason, previousState: state.cellCycleState };
}

async function immuneResponse(db, agentId, context = {}) {
  const scan = await surveillanceScan(db, agentId, context);
  const responses = [];

  for (const detection of scan.detections) {
    const biopsyResult = await biopsy(db, agentId, detection.pathologyType);
    if (!biopsyResult.ok) continue;

    const diagnosis = await diagnose(db, agentId, biopsyResult.biopsyRef);
    if (!diagnosis.ok) continue;

    let quarantineResult = null;
    if (scan.quarantine && diagnosis.confirmed) {
      quarantineResult = await quarantine(db, agentId, {
        reason: `Confirmed ${diagnosis.pathologyType}`,
        context: { confidence: diagnosis.confidence },
      });
    }
    responses.push({ detection, diagnosis, quarantine: quarantineResult });
  }

  return { state: scan.state, responses, quarantine: scan.quarantine };
}

module.exports = {
  PATHOLOGY_DEFINITIONS, surveillanceScan, biopsy, diagnose, quarantine, immuneResponse,
};