'use strict';

async function read(db, member) {
  const [agent, event] = await Promise.all([
    db.get('SELECT status FROM agents WHERE id = ?', member.workerId),
    db.get(`SELECT id, payload_json FROM telemetry_events WHERE agent_id = ?
      AND event_type = 'EVIDENCE_REPORT' ORDER BY id DESC LIMIT 1`, member.workerId)
  ]);
  return resultFromEvidence({ member, agent, event });
}

async function readAll(db, members) {
  await Promise.all((members || []).map(async (member) => {
    const generic = await read(db, member);
    member.result = { ...generic, ...(member.result || {}) };
  }));
  return members;
}

function resultFromEvidence(context) {
  const { member, agent, event } = context;
  const report = parseEvidence(event?.payload_json);
  const answer = reportAnswer(report);
  const verified = agent?.status === 'completed' && report?.outcome === 'success' && Boolean(answer);
  return {
    workerId: member.workerId,
    role: member.role,
    status: resultStatus(agent, verified),
    verified,
    answer: answer || null,
    evidenceEventId: event?.id || null,
    outcome: report?.outcome || null
  };
}

function resultStatus(agent, verified) {
  if (verified) return 'completed';
  return agent?.status === 'completed' ? 'unverified' : agent?.status || 'missing';
}

function parseEvidence(value) {
  try {
    const payload = JSON.parse(value || '{}');
    return payload.evidenceReport || payload.report || payload;
  } catch (_) {
    return null;
  }
}

function reportAnswer(report) {
  const content = report?.workerArtifact?.content || {};
  const claims = Array.isArray(report?.claims) ? report.claims
    : Array.isArray(content.claims) ? content.claims : [];
  const statements = claims.map((claim) => text(claim?.statement)).filter(Boolean);
  return [text(report?.answer), text(content.answer), ...statements].filter(Boolean).join('\n').trim();
}

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

module.exports = { read, readAll };
