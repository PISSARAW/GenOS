'use strict';
const DEFAULT_STALE_MS = 90_000;
const DEFAULT_EVIDENCE_STALE_MS = 15 * 60_000;
function classifySilence(input = {}) {
  if (input.connected === false) return 'DISCONNECTED';
  const heartbeat = input.heartbeat;
  if (!heartbeat) return 'UNKNOWN';
  if (isCrashed(input, heartbeat)) return 'CRASHED';
  return classifyFreshness(input, heartbeat);
}
function isCrashed(input, heartbeat) {
  return input.runtimeState === 'CRASHED' || heartbeat.runtime_state === 'CRASHED';
}
function classifyFreshness(input, heartbeat) {
  const occurred = Date.parse(heartbeat.occurred_at);
  const now = input.now ? Date.parse(input.now) : Date.now();
  if (!Number.isFinite(occurred) || !Number.isFinite(now)) return 'UNKNOWN';
  if (now - occurred > (input.staleAfterMs || DEFAULT_STALE_MS)) return 'STALLED';
  if (heartbeat.health === 'UNKNOWN') return 'UNKNOWN';
  return classifyEvidence(input, heartbeat, now);
}
function classifyEvidence(input, heartbeat, now) {
  const evidence = Date.parse(heartbeat.last_evidence_at);
  if (!Number.isFinite(evidence) || now - evidence > (input.evidenceStaleAfterMs || DEFAULT_EVIDENCE_STALE_MS)) return 'NO_NEW_INFORMATION';
  return 'HEALTHY_SILENCE';
}
module.exports = { classifySilence, DEFAULT_STALE_MS, DEFAULT_EVIDENCE_STALE_MS };
