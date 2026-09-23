const config = require('../config/orchestratorConfig');

const MAX_RECOVERY_ATTEMPTS = 3;

function compact(value, max = 4000) {
  const text = String(value || '').trim();
  return text.length <= max ? text : text.slice(0, max - 1) + '...';
}

const FAILURE_PATTERNS = Object.freeze([
  { pattern: /\b(?:mutated output|mutation|apoptosis|chaperone repair|malformed json)\b/, category: 'mutated_output' },
  { pattern: /contradict|counterexample|falsif|invalid hypothesis|wrong assumption/, category: 'falsified_hypothesis' },
  { pattern: /test failure|failed test|assertion|invariant|regression|exit code [1-9]|npm test|cargo test|pytest/, category: 'test_failure' },
  { pattern: /permission|forbidden|policy|not allowed|unauthori|missing (tool|dependency)|unsupported|cannot execute|command not found/, category: 'capability_mismatch' },
  { pattern: /timeout|temporar|rate limit|connection|unavailable|econn|deadlock/, category: 'transient_runtime' },
]);

function matchFailureCategory(text) {
  const lower = text.toLowerCase();
  for (const { pattern, category } of FAILURE_PATTERNS) {
    if (pattern.test(lower)) return category;
  }
  return null;
}

function classifyFailure(event = {}) {
  const payload = event.payload || {};
  const declared = String(payload.failure?.category || payload.category || '').toLowerCase();
  if (declared) return declared;
  const text = (event.detail || '') + ' ' + (payload.failure?.reason || '') + ' ' + (payload.stderr || '');
  return matchFailureCategory(text) || (event.eventType === 'WORKER_TASK_FAILED' ? 'unresolved_task' : 'runtime_failure');
}

function proofOfNoAnswer(payload = {}) {
  const proof = payload.noAnswerProof || payload.no_answer_proof;
  if (!proof || typeof proof !== 'object') return null;
  const method = typeof proof.method === 'string' ? proof.method.trim() : '';
  if (!method) return null;
  const evidence = Array.isArray(proof.evidence)
    ? proof.evidence.map((e) => String(e || '').trim()).filter(Boolean)
    : [];
  return evidence.length ? { ...proof, method, evidence } : null;
}

function hasClaimWithoutEvidence(claims) {
  return claims.some((c) => {
    if (!c) return true;
    if (Array.isArray(c.evidence)) return c.evidence.length === 0;
    if (typeof c.evidence === 'string') return !c.evidence.trim();
    return true;
  });
}

function makeFailure(reason, category = 'unresolved_task') {
  return { outcome: 'failed', failure: { category, reason, evidence: [] } };
}

function classifyNoAnswer(report) {
  const noAnswerProof = proofOfNoAnswer(report);
  if (report.outcome === 'no_answer' && noAnswerProof) return { outcome: 'no_answer', noAnswerProof };
  return null;
}

function classifyNoAnswer(report) {
  const noAnswerProof = proofOfNoAnswer(report);
  if (report.outcome === 'no_answer' && noAnswerProof) return { outcome: 'no_answer', noAnswerProof };
  return null;
}

function classifyClaims(report) {
  const claims = Array.isArray(report.claims) ? report.claims : [];
  if (report.outcome === 'no_answer' || claims.length === 0) return makeFailure(claims.length === 0 ? 'Worker returned no verified claim.' : 'Worker did not produce verified proof.');
  if (hasClaimWithoutEvidence(claims)) return makeFailure('Worker returned claims lacking verifiable evidence.');
  return null;
}

function classifyFinalReport(report = {}, isWorker = true) {
  const noAnswer = classifyNoAnswer(report);
  if (noAnswer) return noAnswer;
  if (report.outcome === 'failed') return { outcome: 'failed', failure: report.failure && typeof report.failure === 'object' ? report.failure : makeFailure(isWorker ? 'Worker reported mission failure.' : 'Orchestrator reported mission failure.') };
  const claimsResult = classifyClaims(report);
  if (claimsResult) return claimsResult;
  return { outcome: 'success' };
}

function reportFailureReason(payload, event) {
  return compact(payload.failure?.reason || event.detail || 'Worker did not produce a verified answer.');
}

function reportEvidence(payload) {
  return Array.isArray(payload.failure?.evidence) ? payload.failure.evidence.map(String).filter(Boolean) : [];
}

function reportUncertainties(payload) {
  return Array.isArray(payload.evidenceReport?.uncertainties) ? payload.evidenceReport.uncertainties.map(String).filter(Boolean) : [];
}

function reportCulprit(payload, mission) {
  return payload.culpritReport || payload.bisection?.culpritReport || mission.culpritReport || null;
}

function buildFailureReportFromMission(mission, event) {
  const payload = event.payload || {};
  return {
    workerId: mission.agentId || mission.id,
    orchestratorId: mission.orchestratorAgentId,
    mission: compact(mission.originalMission || mission.prompt || mission.currentTask),
    category: classifyFailure(event),
    reason: reportFailureReason(payload, event),
    evidence: reportEvidence(payload),
    uncertainties: reportUncertainties(payload),
    noAnswerProof: proofOfNoAnswer(payload),
    bisection: payload.bisection || mission.bisection || null,
    culpritReport: reportCulprit(payload, mission),
    attempt: Math.max(0, Number(mission.recoveryAttempt || 0)),
    maxAttempts: Math.max(1, Number(mission.recoveryMaxAttempts || MAX_RECOVERY_ATTEMPTS)),
    sourceEvent: event.eventType,
    sourceEventId: event.id
  };
}

function failureReport(event = {}, mission = {}) {
  return { schema: 'genos.worker-failure/v1', ...buildFailureReportFromMission(mission, event) };
}

function isOperationalFailure(category) {
  return ['capability_mismatch', 'policy_block', 'missing_capability', 'transient_runtime', 'mutated_output'].includes(category);
}

function isCapabilityMismatch(category) {
  return ['capability_mismatch', 'policy_block', 'missing_capability'].includes(category);
}

function isTestFailure(category) {
  return ['test_failure', 'regression', 'invariant_violation'].includes(category);
}

function isFalsifiedHypothesis(category) {
  return ['falsified_hypothesis', 'contradictory_evidence'].includes(category);
}

function decideNoAnswer(report) {
  if (report.noAnswerProof && !isOperationalFailure(report.category)) {
    return {
      action: 'conclude_no_answer', terminal: true, retry: false,
      reason: 'The worker supplied an evidence-backed proof that the requested answer does not exist within the stated scope.'
    };
  }
  return null;
}

function decideExhausted(report) {
  if (report.attempt >= report.maxAttempts) {
    return {
      action: 'escalate_unresolved', terminal: true, retry: false,
      reason: 'The bounded recovery budget is exhausted without an answer or a proof of impossibility. Human or higher-level orchestrator review is required.'
    };
  }
  return null;
}

function decideCapabilityMismatch(report) {
  if (isCapabilityMismatch(report.category)) {
    return {
      action: 'replace_worker', terminal: false, retry: true, identity: 'new', role: 'recovery_specialist',
      reason: 'The failure indicates that the current worker profile or permitted capabilities do not fit the mission.'
    };
  }
  return null;
}

function decideMutatedOutput(report) {
  if (report.category === 'mutated_output') {
    return {
      action: 'mutate_worker', terminal: false, retry: true, identity: 'new', role: 'recovery_specialist',
      reason: 'The previous worker output mutated or suffered structural apoptosis; triggering cognitive molting with structural chaperone guidance.'
    };
  }
  return null;
}

function decideTestFailure(report) {
  if (isTestFailure(report.category)) {
    return {
      action: 'bisect_and_rollback', terminal: false, retry: true, identity: 'new', role: 'recovery_specialist',
      reason: 'A test regression or invariant violation was detected; triggering causal bisection to isolate culprit step and restore pre-regression state.'
    };
  }
  return null;
}

function decideFalsifiedHypothesis(report) {
  if (isFalsifiedHypothesis(report.category)) {
    return {
      action: 'fork_worker', terminal: false, retry: true, identity: 'new', role: 'independent_reviewer',
      reason: 'The current hypothesis was falsified; an isolated counter-branch should test a materially different hypothesis.'
    };
  }
  return null;
}

function decideFirstAttempt(report) {
  if (report.attempt === 0) {
    return {
      action: 'mutate_worker', terminal: false, retry: true, identity: 'same',
      reason: 'The first failure can be retried by changing the method while preserving the worker specialization.'
    };
  }
  return null;
}

function decideSecondAttempt(report) {
  if (report.attempt === 1) {
    return {
      action: 'fork_worker', terminal: false, retry: true, identity: 'new', role: 'independent_reviewer',
      reason: 'The mutated approach failed; an independent branch should challenge its assumptions.'
    };
  }
  return null;
}

function decideDefault(report) {
  return {
    action: 'replace_worker', terminal: false, retry: true, identity: 'new', role: 'recovery_specialist',
    reason: 'Two approaches failed; replace the worker profile for the final bounded attempt.'
  };
}

function decideRecovery(report) {
  return (
    decideNoAnswer(report) ||
    decideExhausted(report) ||
    decideCapabilityMismatch(report) ||
    decideMutatedOutput(report) ||
    decideTestFailure(report) ||
    decideFalsifiedHypothesis(report) ||
    decideFirstAttempt(report) ||
    decideSecondAttempt(report) ||
    decideDefault(report)
  );
}

function basePromptParts(report) {
  return [
    report.mission,
    '',
    'Recovery attempt ' + (report.attempt + 1) + '/' + report.maxAttempts + '.',
    'Previous worker failure category: ' + report.category + '.',
    'Previous failure: ' + report.reason
  ];
}

function immuneSignalParts(report) {
  if (report.reason && report.reason.includes('[SIGNAL IMMUNITAIRE : DOULEUR COGNITIVE]')) {
    return ['INSTRUCTION DE REPARATION IMMUNITAIRE (CANALISATION EPIGENETIQUE) :', report.reason];
  }
  return [];
}

function culpritParts(culprit) {
  if (!culprit) return [];
  return [
    'DIAGNOSTIC BISECTION CAUSALE (O(log N)) :',
    '- Pas fautif isolé : Étape ' + culprit.stepNumber + ' (Snapshot: ' + (culprit.snapshotHash || 'n/a') + ', Agent: ' + (culprit.culpritAgentId || 'worker') + ')',
    '- Cause racine : ' + (culprit.rootCauseSummary || culprit.actionDescription || "Violation d'invariant"),
    ...(culprit.targetFile ? ['- Fichier impacte : ' + culprit.targetFile] : []),
    '- Remédiation : Ce pas fautif a été annulé par rollback chirurgical. Ne pas répéter la même mutation.'
  ];
}

function evidenceParts(report) {
  return [report.evidence.length ? 'Evidence already obtained: ' + JSON.stringify(report.evidence) : 'No conclusive evidence was obtained.'];
}

function decisionParts(decision) {
  return ['Orchestrator decision: ' + decision.action + '. ' + decision.reason];
}

function footerParts() {
  return ['Use a materially different method. Return either a verified answer, a structured failure report, or a rigorous noAnswerProof with concrete evidence. Never claim that no answer exists merely because the retry budget is exhausted.'];
}

function buildRecoveryPromptParts(report, decision) {
  const culprit = report.culpritReport || report.bisection?.culpritReport;
  return [
    ...basePromptParts(report),
    ...immuneSignalParts(report),
    ...culpritParts(culprit),
    ...evidenceParts(report),
    ...decisionParts(decision),
    ...footerParts()
  ];
}

function applyPromptSizeGuard(prompt) {
  const maxChars = config.maxProcessOutputBytes() || 1024 * 1024;
  if (prompt.length > maxChars) {
    return prompt.slice(0, maxChars - 200) + '\n\n[PROMPT TRUNCATED: exceeded ' + maxChars + ' character limit]';
  }
  return prompt;
}

function recoveryPrompt(report, decision) {
  const parts = buildRecoveryPromptParts(report, decision);
  const prompt = parts.join('\n');
  return applyPromptSizeGuard(prompt);
}

module.exports = {
  MAX_RECOVERY_ATTEMPTS,
  classifyFailure,
  proofOfNoAnswer,
  classifyFinalReport,
  failureReport,
  decideRecovery,
  recoveryPrompt
};
