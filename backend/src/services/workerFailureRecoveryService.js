const MAX_RECOVERY_ATTEMPTS = 3;

function compact(value, max = 4000) {
  const text = String(value || '').trim();
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function classifyFailure(event = {}) {
  const payload = event.payload || {};
  const declared = String(payload.failure?.category || payload.category || '').toLowerCase();
  if (declared) return declared;
  const text = `${event.detail || ''} ${payload.failure?.reason || ''} ${payload.stderr || ''}`.toLowerCase();
  if (/permission|forbidden|policy|not allowed|unauthori/.test(text)) return 'capability_mismatch';
  if (/mutat|malform|apoptos|syntax|chaperon/.test(text)) return 'mutated_output';
  if (/contradict|counterexample|falsif|invalid hypothesis|wrong assumption/.test(text)) return 'falsified_hypothesis';
  if (/timeout|temporar|rate limit|connection|unavailable|econn|deadlock/.test(text)) return 'transient_runtime';
  if (/missing (tool|dependency)|unsupported|cannot execute|command not found/.test(text)) return 'capability_mismatch';
  return event.eventType === 'WORKER_TASK_FAILED' ? 'unresolved_task' : 'runtime_failure';
}

function proofOfNoAnswer(payload = {}) {
  const proof = payload.noAnswerProof || payload.no_answer_proof;
  if (!proof || typeof proof !== 'object') return null;
  const evidence = Array.isArray(proof.evidence) ? proof.evidence.map(String).filter(Boolean) : [];
  return evidence.length ? { ...proof, evidence } : null;
}

function classifyFinalReport(report = {}, isWorker = true) {
  if (!isWorker) return { outcome: 'success' };
  const noAnswerProof = proofOfNoAnswer(report);
  if (report.outcome === 'no_answer' && noAnswerProof) return { outcome: 'no_answer', noAnswerProof };
  if (
    report.outcome === 'failed'
    || report.outcome === 'no_answer'
    || (!report.outcome && (!Array.isArray(report.claims) || report.claims.length === 0))
  ) {
    return {
      outcome: 'failed',
      failure: report.failure && typeof report.failure === 'object'
        ? report.failure
        : { category: 'unresolved_task', reason: 'Worker returned no verified claim.', evidence: [] }
    };
  }
  return { outcome: 'success' };
}

function failureReport(event = {}, mission = {}) {
  const payload = event.payload || {};
  return {
    schema: 'genos.worker-failure/v1',
    workerId: mission.agentId || mission.id,
    orchestratorId: mission.orchestratorAgentId,
    mission: compact(mission.originalMission || mission.prompt || mission.currentTask),
    category: classifyFailure(event),
    reason: compact(payload.failure?.reason || event.detail || 'Worker did not produce a verified answer.'),
    evidence: Array.isArray(payload.failure?.evidence) ? payload.failure.evidence.map(String).filter(Boolean) : [],
    uncertainties: Array.isArray(payload.evidenceReport?.uncertainties)
      ? payload.evidenceReport.uncertainties.map(String).filter(Boolean)
      : [],
    noAnswerProof: proofOfNoAnswer(payload),
    attempt: Math.max(0, Number(mission.recoveryAttempt || 0)),
    maxAttempts: Math.max(1, Number(mission.recoveryMaxAttempts || MAX_RECOVERY_ATTEMPTS)),
    sourceEvent: event.eventType,
    sourceEventId: event.id
  };
}

function decideRecovery(report) {
  if (report.noAnswerProof) {
    return {
      action: 'conclude_no_answer', terminal: true, retry: false,
      reason: 'The worker supplied an evidence-backed proof that the requested answer does not exist within the stated scope.'
    };
  }
  if (report.attempt >= report.maxAttempts) {
    return {
      action: 'escalate_unresolved', terminal: true, retry: false,
      reason: 'The bounded recovery budget is exhausted without an answer or a proof of impossibility. Human or higher-level orchestrator review is required.'
    };
  }
  if (['capability_mismatch', 'policy_block', 'missing_capability'].includes(report.category)) {
    return {
      action: 'replace_worker', terminal: false, retry: true, identity: 'new', role: 'recovery_specialist',
      reason: 'The failure indicates that the current worker profile or permitted capabilities do not fit the mission.'
    };
  }
  if (report.category === 'mutated_output') {
    return {
      action: 'mutate_worker', terminal: false, retry: true, identity: 'new', role: 'recovery_specialist',
      reason: 'The previous worker output mutated or suffered structural apoptosis; triggering cognitive molting with structural chaperone guidance.'
    };
  }
  if (['falsified_hypothesis', 'contradictory_evidence'].includes(report.category)) {
    return {
      action: 'fork_worker', terminal: false, retry: true, identity: 'new', role: 'independent_reviewer',
      reason: 'The current hypothesis was falsified; an isolated counter-branch should test a materially different hypothesis.'
    };
  }
  if (report.attempt === 0) {
    return {
      action: 'mutate_worker', terminal: false, retry: true, identity: 'same',
      reason: 'The first failure can be retried by changing the method while preserving the worker specialization.'
    };
  }
  if (report.attempt === 1) {
    return {
      action: 'fork_worker', terminal: false, retry: true, identity: 'new', role: 'independent_reviewer',
      reason: 'The mutated approach failed; an independent branch should challenge its assumptions.'
    };
  }
  return {
    action: 'replace_worker', terminal: false, retry: true, identity: 'new', role: 'recovery_specialist',
    reason: 'Two approaches failed; replace the worker profile for the final bounded attempt.'
  };
}

function recoveryPrompt(report, decision) {
  const parts = [
    report.mission,
    '',
    `Recovery attempt ${report.attempt + 1}/${report.maxAttempts}.`,
    `Previous worker failure category: ${report.category}.`,
    `Previous failure: ${report.reason}`
  ];
  if (report.reason && report.reason.includes('[SIGNAL IMMUNITAIRE : DOULEUR COGNITIVE]')) {
    parts.push('INSTRUCTION DE RÉPARATION IMMUNITAIRE (CANALISATION ÉPIGÉNÉTIQUE) :');
    parts.push(report.reason);
  }
  parts.push(report.evidence.length ? `Evidence already obtained: ${JSON.stringify(report.evidence)}` : 'No conclusive evidence was obtained.');
  parts.push(`Orchestrator decision: ${decision.action}. ${decision.reason}`);
  parts.push('Use a materially different method. Return either a verified answer, a structured failure report, or a rigorous noAnswerProof with concrete evidence. Never claim that no answer exists merely because the retry budget is exhausted.');
  return parts.join('\n');
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
