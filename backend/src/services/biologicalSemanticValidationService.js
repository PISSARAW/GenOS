'use strict';

async function validate(db, members) {
  const reports = await Promise.all(members.map((member) => readReport(db, member)));
  const claims = reports.flatMap((report) => report.claims);
  const conflicts = findConflicts(claims);
  const coveredWorkers = new Set(claims.map((claim) => claim.workerId)).size;
  return {
    status: conflicts.length ? 'conflicts_detected' : hasFullCoverage(members.length, coveredWorkers) ? 'complete' : 'incomplete',
    workerCount: members.length, coveredWorkers, claims, conflicts,
    unresolvedConflictCount: conflicts.length
  };
}

function hasFullCoverage(workerCount, coveredWorkers) {
  return workerCount > 0 && coveredWorkers === workerCount;
}

async function readReport(db, member) {
  const row = await db.get(`SELECT id, payload_json FROM telemetry_events
    WHERE agent_id = ? AND event_type = 'EVIDENCE_REPORT' ORDER BY id DESC LIMIT 1`, member.workerId);
  const payload = parse(row?.payload_json);
  const report = payload?.evidenceReport || payload?.report || payload;
  const content = report?.workerArtifact?.content || report?.content || report;
  const source = Array.isArray(content?.semanticClaims) ? content.semanticClaims : [];
  return { workerId: member.workerId, claims: source.map((claim) => normalizeClaim(claim, member.workerId)).filter(Boolean) };
}

function normalizeClaim(claim, workerId) {
  const subject = clean(claim?.subject);
  const predicate = clean(claim?.predicate);
  const value = canonical(claim?.value);
  const evidence = strings(claim?.evidence || claim?.evidenceRefs);
  if (!subject || !predicate || value === null || evidence.length === 0) return null;
  return { subject, predicate, value, workerId, evidence };
}

function findConflicts(claims) {
  const grouped = new Map();
  for (const claim of claims) {
    const key = `${claim.subject}\u0000${claim.predicate}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(claim);
  }
  return [...grouped.values()].flatMap(conflictingPairs);
}

function conflictingPairs(group) {
  const pairs = [];
  for (let left = 0; left < group.length; left += 1) {
    for (let right = left + 1; right < group.length; right += 1) {
      if (group[left].workerId !== group[right].workerId && group[left].value !== group[right].value) {
        pairs.push({ type: 'RESPONSE_CLAIM_CONFLICT', left: group[left], right: group[right], resolved: false });
      }
    }
  }
  return pairs;
}

function canonical(value) {
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (['required', 'mandatory', 'obligatoire', 'true'].includes(normalized)) return 'true';
  if (['optional', 'facultatif', 'optionnel', 'false'].includes(normalized)) return 'false';
  return normalized || null;
}

function strings(value) {
  return (Array.isArray(value) ? value : []).filter((item) => typeof item === 'string' && item.trim());
}

function clean(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function parse(value) {
  try { return JSON.parse(value || '{}'); } catch { return {}; }
}

module.exports = { validate };
