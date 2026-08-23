const telemetry = require('./telemetryObserver');

const SILENCE_PATTERNS = [
  /\b(?:work|run|continue|proceed)\s+silently\b/i,
  /\b(?:be|stay)\s+(?:completely\s+)?(?:silent|quiet)\b/i,
  /\b(?:silent|quiet)\s+mode\b/i,
  /\b(?:do not|don'?t)\s+(?:send|give|provide|report)\s+(?:me\s+)?(?:progress\s+)?updates?\b/i,
  /\bno\s+(?:progress\s+)?updates?\b/i,
  /\b(?:reste|travaille|continue)\s+(?:en\s+)?silence\b/i,
  /\b(?:sois|soyez|reste|restez)\s+silencieu(?:x|se)\b/i,
  /\bmode\s+silencieux\b/i,
  /\b(?:ne\s+)?(?:me\s+)?(?:tiens|tenez)\s+pas\s+au\s+courant\b/i,
  /\bsans\s+(?:compte[- ]rendu|mise à jour|mises à jour|notification)\b/i
];

function silenceRequested(mission, explicit = false) {
  if (explicit === true) return true;
  return SILENCE_PATTERNS.some((pattern) => pattern.test(String(mission || '')));
}

function reportingPolicy(mission, explicit = false) {
  const silent = silenceRequested(mission, explicit);
  return { silent, audience: 'user', channel: 'studio_sse', mode: silent ? 'silent' : 'milestones' };
}

function report(input = {}, observer = telemetry) {
  if (input.silent === true) return { reported: false, silent: true };
  const orchestratorId = String(input.orchestratorId || '').trim();
  const message = String(input.message || '').trim().slice(0, 1200);
  if (!orchestratorId) throw Object.assign(new Error('orchestratorId is required for a user progress update.'), { code: 'PROGRESS_ORCHESTRATOR_REQUIRED' });
  if (!message) throw Object.assign(new Error('A user-facing progress message is required.'), { code: 'PROGRESS_MESSAGE_REQUIRED' });
  const phase = String(input.phase || 'working').trim();
  const requestedProgress = Number(input.progressPercent);
  const items = (value) => Array.isArray(value) ? value.slice(0, 10).map((item) => String(item).slice(0, 500)) : [];
  const event = observer.emitEvent({
    eventType: 'ORCHESTRATOR_USER_UPDATE',
    agentId: orchestratorId,
    action: phase.toUpperCase(),
    detail: message,
    severity: input.severity || (phase === 'blocked' ? 'warning' : 'info'),
    status: phase,
    payload: {
      audience: 'user', phase,
      progressPercent: input.progressPercent == null || !Number.isFinite(requestedProgress) ? null : Math.max(0, Math.min(100, requestedProgress)),
      completed: items(input.completed),
      next: items(input.next),
      blockers: items(input.blockers),
      sourceAgentId: input.sourceAgentId || orchestratorId
    }
  });
  return { reported: true, silent: false, event };
}

function milestoneFromEvent(event = {}, context = {}) {
  const terminal = new Set(['AGENT_COMPLETED', 'AGENT_FAILED', 'AGENT_RUNTIME_ERROR', 'AGENT_HALTED', 'WORKER_TASK_FAILED', 'WORKER_NO_ANSWER_PROVEN']);
  if (!terminal.has(event.eventType)) return null;
  const success = event.eventType === 'AGENT_COMPLETED';
  const noAnswer = event.eventType === 'WORKER_NO_ANSWER_PROVEN';
  const claims = event.payload?.evidenceReport?.claims || event.payload?.claims || [];
  const summary = claims.map((claim) => claim?.statement).filter(Boolean).slice(0, 2).join(' ');
  const actor = context.agentName || context.agentId || 'The agent';
  return {
    phase: success ? 'completed' : noAnswer ? 'blocked' : 'blocked',
    severity: success ? 'info' : 'warning',
    message: success
      ? `${actor} finished${summary ? `: ${summary}` : '.'}`
      : noAnswer
        ? `${actor} proved that no answer exists in the assigned scope.`
        : `${actor} stopped before completion: ${event.detail || 'the runtime reported a failure.'}`,
    completed: success ? [context.task || 'assigned work'] : [],
    blockers: success ? [] : [event.detail || event.eventType]
  };
}

module.exports = { silenceRequested, reportingPolicy, report, milestoneFromEvent };
