'use strict';

const { digest } = require('./contract');

function text(value, label) {
  const normalized = String(value || '').trim();
  if (!normalized) throw new Error(`${label}_REQUIRED`);
  return normalized;
}

function verified(option, minimumGain) {
  const evaluation = option?.evaluation;
  const effect = option?.measuredEffect;
  if (evaluation?.candidateHash !== option?.candidate?.candidateHash) return false;
  if (!evaluation.complete || evaluation.disputed || !evaluation.observations.realUserObserved) return false;
  if (!evaluation.dimensions.every(item => item.status === 'PASS')) return false;
  return Number.isFinite(effect?.delta) && effect.delta > minimumGain &&
    Boolean(effect.evidenceRef) && Boolean(effect.protocolRef);
}

function decide(input = {}) {
  if (input.baseline?.kind !== 'studio-interface-baseline') throw new Error('BASELINE_INVALID');
  const minimumGain = Number.isFinite(input.minimumGain) ? input.minimumGain : 0;
  const eligible = (input.options || []).filter(option => verified(option, minimumGain));
  eligible.sort((left, right) => right.measuredEffect.delta - left.measuredEffect.delta);
  const selected = eligible[0] || null;
  const result = {
    kind: 'studio-interface-decision', baselineHash: input.baseline.baselineHash,
    action: selected ? 'PROPOSE_CHANGE' : 'NO_CHANGE',
    candidateHash: selected?.candidate.candidateHash || null,
    evaluationHash: selected?.evaluation.evaluationHash || null,
    effectEvidenceRef: selected?.measuredEffect.evidenceRef || null,
    rejectedCandidateHashes: (input.options || []).filter(item => item !== selected)
      .map(item => item.candidate?.candidateHash).filter(Boolean),
    authorityRequired: Boolean(selected), promotionGranted: false, deploymentExecuted: false
  };
  return Object.freeze({ ...result, decisionHash: digest(result) });
}

function observeDrift(input = {}) {
  const signals = Array.isArray(input.signals) ? input.signals : [];
  const drifted = signals.filter(signal => Number.isFinite(signal.value) &&
    Number.isFinite(signal.threshold) && signal.value > signal.threshold && signal.evidenceRef);
  const action = drifted.length ? 'OPEN_DIAGNOSTIC' : 'NO_CHANGE';
  const result = {
    kind: 'studio-interface-drift-observation', baselineHash: text(input.baselineHash, 'BASELINE_HASH'),
    action, driftedSignals: drifted.map(item => item.name),
    evidenceRefs: drifted.map(item => item.evidenceRef),
    mutationAuthorized: false, deploymentAuthorized: false
  };
  return Object.freeze({ ...result, observationHash: digest(result) });
}

function changeDossier(input = {}) {
  const decision = input.decision;
  if (decision?.action !== 'PROPOSE_CHANGE') throw new Error('CHANGE_DECISION_REQUIRED');
  const authority = input.authority || {};
  if (authority.scope !== 'interface:deploy') throw new Error('DEPLOYMENT_AUTHORITY_REQUIRED');
  const rollback = input.rollback || {};
  if (rollback.baselineHash !== decision.baselineHash) throw new Error('ROLLBACK_BASELINE_CONFLICT');
  const dossier = {
    kind: 'studio-interface-change-dossier', decisionHash: decision.decisionHash,
    candidateHash: decision.candidateHash,
    authority: {
      actor: text(authority.actor, 'AUTHORITY_ACTOR'), scope: authority.scope,
      approvalRef: text(authority.approvalRef, 'APPROVAL_REF')
    },
    rollback: {
      baselineHash: rollback.baselineHash,
      restoreRef: text(rollback.restoreRef, 'ROLLBACK_RESTORE_REF'),
      reversibleScope: text(rollback.reversibleScope, 'ROLLBACK_SCOPE')
    },
    status: 'READY_FOR_AUTHORIZED_DEPLOYMENT', deploymentExecuted: false
  };
  return Object.freeze({ ...dossier, dossierHash: digest(dossier) });
}

module.exports = { decide, observeDrift, changeDossier };
