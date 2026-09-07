/**
 * Evidence-bound hallucination monitor.
 *
 * This service intentionally does not infer factual truth from prose.  It
 * counts only explicit, machine-observable evidence failures: a runtime
 * declares an unverified claim, a claim has no receipt/evidence, or a local
 * code proposal lacks proof or has failing tests.  That keeps the sentinel
 * auditable and avoids treating ordinary uncertainty as a hallucination.
 */

const { detectPlaceholderOrHallucination } = require('./epistemics');

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function isMeaningfulEvidenceItem(item) {
  if (item === null || item === undefined) return false;
  if (typeof item === 'string') {
    const trimmed = item.trim();
    if (!trimmed) return false;
    if (detectPlaceholderOrHallucination(trimmed).isPlaceholder) return false;
    if (/^(?:none|n\/a|null|undefined|todo|unverified|fake|dummy|mock)(?:\b|[:\s])/i.test(trimmed)) return false;
    return true;
  }
  if (typeof item === 'number' || typeof item === 'boolean') {
    return true;
  }
  if (typeof item === 'object') {
    if (Array.isArray(item)) {
      return item.some(isMeaningfulEvidenceItem);
    }
    const keys = Object.keys(item);
    if (keys.length === 0) return false;
    return keys.some((k) => isMeaningfulEvidenceItem(item[k]));
  }
  return false;
}

function evidencePresent(value) {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) {
    return value.length > 0 && value.some(isMeaningfulEvidenceItem);
  }
  return isMeaningfulEvidenceItem(value);
}

function extractClaims(payload) {
  if (!payload || typeof payload !== 'object') return [];
  const list = [];
  const seen = new Set();
  const add = (c) => {
    if (c && typeof c === 'object') {
      const key = `${c.statement || c.claim || c.id || JSON.stringify(c)}`;
      if (!seen.has(key)) {
        seen.add(key);
        list.push(c);
      }
    }
  };
  if (Array.isArray(payload.claims)) payload.claims.forEach(add);
  if (Array.isArray(payload.evidenceReport?.claims)) payload.evidenceReport.claims.forEach(add);
  if (Array.isArray(payload.report?.claims)) payload.report.claims.forEach(add);
  if (Array.isArray(payload.result?.claims)) payload.result.claims.forEach(add);
  if (Array.isArray(payload.data?.claims)) payload.data.claims.forEach(add);
  return list;
}

function extractUnverifiedClaims(payload) {
  if (!payload || typeof payload !== 'object') return [];
  const list = [];
  const seen = new Set();
  const add = (c) => {
    const key = typeof c === 'string' ? c : JSON.stringify(c);
    if (!seen.has(key)) {
      seen.add(key);
      list.push(c);
    }
  };
  if (Array.isArray(payload.unverifiedClaims)) payload.unverifiedClaims.forEach(add);
  if (Array.isArray(payload.evidenceReport?.unverifiedClaims)) payload.evidenceReport.unverifiedClaims.forEach(add);
  if (Array.isArray(payload.report?.unverifiedClaims)) payload.report.unverifiedClaims.forEach(add);
  if (Array.isArray(payload.result?.unverifiedClaims)) payload.result.unverifiedClaims.forEach(add);
  if (Array.isArray(payload.data?.unverifiedClaims)) payload.data.unverifiedClaims.forEach(add);
  return list;
}

function inspectEvent(event = {}) {
  const payload = event.payload || {};
  const reasons = [];
  const observations = [];
  const declared = Number(payload.hallucinations || 0);
  if (event.eventType === 'HALLUCINATION_DETECTED' || event.eventType === 'UNVERIFIED_CLAIM' || payload.hallucinationDetected === true) {
    reasons.push('runtime reported an unverified claim');
    observations.push(1);
  }
  if (declared > 0) {
    reasons.push(`runtime reported ${declared} hallucination${declared === 1 ? '' : 's'}`);
    observations.push(declared);
  }

  const unverifiedClaims = extractUnverifiedClaims(payload);
  if (unverifiedClaims.length) {
    reasons.push(`${unverifiedClaims.length} claim(s) explicitly lack evidence`);
    observations.push(unverifiedClaims.length);
  }

  const claims = extractClaims(payload);
  const unsupportedClaims = claims.filter((claim) => claim && !evidencePresent(claim.evidence || claim.receipts || claim.sourceRefs));
  if (unsupportedClaims.length) {
    reasons.push(`${unsupportedClaims.length} structured claim(s) lack evidence or receipts`);
    observations.push(unsupportedClaims.length);
  }

  const proposal = payload.proposal || payload.evidenceReport?.proposal || payload.report?.proposal;
  if (proposal) {
    if (!evidencePresent(proposal.proposal?.evidence || proposal.evidence)) {
      reasons.push('local code proposal has no evidence statement');
      observations.push(1);
    }
    const tests = asArray(proposal.tests);
    if (!tests.length) {
      reasons.push('local code proposal has no executed tests');
      observations.push(1);
    } else if (tests.some((test) => Number(test.exitCode) !== 0)) {
      reasons.push('local code proposal has failing tests');
      observations.push(1);
    }
  }

  return { detected: reasons.length > 0, count: observations.length ? Math.max(...observations) : 0, reasons };
}

async function recordObservation(db, event) {
  const observation = inspectEvent(event);
  if (!observation.detected || !event.agentId) return { monitored: false, ...observation, total: 0 };
  const agent = await db.get('SELECT hallucination_monitoring FROM agents WHERE id = ?', event.agentId);
  if (!agent?.hallucination_monitoring) return { monitored: false, ...observation, total: 0 };
  await db.run(
    'UPDATE agents SET hallucination_count = hallucination_count + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    observation.count, event.agentId
  );
  const updated = await db.get('SELECT hallucination_count FROM agents WHERE id = ?', event.agentId);
  return { monitored: true, ...observation, total: Number(updated?.hallucination_count || 0) };
}

module.exports = {
  inspectEvent,
  recordObservation,
  evidencePresent,
  extractClaims,
  extractUnverifiedClaims
};
