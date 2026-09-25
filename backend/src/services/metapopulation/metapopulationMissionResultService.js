'use strict';
const { validateSchedulingResult } = require('./schedulingEvidenceValidator');

async function read(db, member) {
  const agent = await db.get('SELECT status FROM agents WHERE id = ?', member.workerId);
  const event = await db.get(`SELECT id, payload_json FROM telemetry_events WHERE agent_id = ?
    AND event_type = 'EVIDENCE_REPORT' ORDER BY id DESC LIMIT 1`, member.workerId);
  const report = parseEvidence(event?.payload_json);
  const answer = evidenceAnswer(report);
  const expectedMethod = String(member.mission || '').match(/Assigned method:\s*([^\n.]+)/i)?.[1]?.trim() || '';
  const methodValidated = methodEvidenceMatches(primaryEvidence(report), expectedMethod);
  const domainValidation = validateSchedulingResult({ mission: member.mission, answer, method: expectedMethod });
  const complete = completedEvidence({ agent, report, answer, methodValidated, domainValidation });
  const status = complete ? 'completed' : agent?.status === 'completed' ? 'unverified' : agent?.status || 'NO_EVIDENCE';
  return { workerId: member.workerId, role: member.role, status,
    answer: answer || null, evidenceEventId: event?.id || null, outcome: report?.outcome || null,
    expectedMethod: expectedMethod || null, methodValidated, domainValidation };
}

function normalizeMethodEvidence(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function methodEvidenceMatches(answer, expectedMethod) {
  if (!expectedMethod) return true;
  const methods = {
    'recherche gloutonne': ['gloutonne', 'greedy', 'lpt'], gloutonne: ['gloutonne', 'greedy', 'lpt'],
    'programmation dynamique': ['programmation dynamique', 'dynamic programming', 'subset-sum'],
    'recherche locale': ['recherche locale', 'local search', 'local search'],
    'recherche evolutionnaire': ['recherche evolutionnaire', 'evolutionary'],
    'raisonnement adversarial': ['raisonnement adversarial', 'adversarial thinking'],
    'verification d’invariants': ['verification d invariants', 'invariant verification', 'vérification d’invariants'],
    'mobile a faible reseau': ['mobile a faible reseau', 'low network mobile'],
    'navigateur desktop': ['navigateur desktop', 'desktop browser'],
    'terminal limite': ['terminal limite', 'limited terminal']
  };
  const source = normalizeMethodEvidence(answer);
  const key = normalizeMethodEvidence(expectedMethod);
  return (methods[key] || [key]).some((method) => source.includes(normalizeMethodEvidence(method)));
}

function evidenceAnswer(report) {
  const content = report?.workerArtifact?.content || {};
  const claims = Array.isArray(content.claims) ? content.claims : Array.isArray(report?.claims) ? report.claims : [];
  const statements = claims.map((claim) => readableAnswer(claim?.statement)).filter(Boolean);
  const observations = content.observations;
  const detail = Array.isArray(observations) ? observations.map((item) =>
    typeof item === 'string' ? readableAnswer(item) : readableAnswer(item?.observation || item?.finding || '')
  ).filter(Boolean).join('\n') : readableAnswer(observations);
  return [statements.join('\n'), detail, readableAnswer(report?.answer)].filter(Boolean).join('\n').trim();
}

function primaryEvidence(report) {
  const content = report?.workerArtifact?.content || {};
  const claims = Array.isArray(content.claims) ? content.claims : Array.isArray(report?.claims) ? report.claims : [];
  return readableAnswer(claims[0]?.statement) || readableAnswer(report?.answer);
}

function readableAnswer(value) {
  if (typeof value !== 'string') return '';
  const candidate = value.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').replace(/^json\s*/i, '');
  try {
    const parsed = JSON.parse(candidate);
    if (typeof parsed.answer === 'string') return parsed.answer;
    const content = parsed.workerArtifact?.content || parsed;
    const claims = Array.isArray(content.claims) ? content.claims : [];
    return claims.map((claim) => readableAnswer(claim?.statement)).filter(Boolean).join('\n');
  } catch (_) {
    return candidate;
  }
}

function completedEvidence({ agent, report, answer, methodValidated, domainValidation }) {
  return agent?.status === 'completed' && report?.outcome === 'success' && answer.length > 0 && methodValidated && domainValidation?.valid !== false;
}

function parseEvidence(value) {
  try { const payload = JSON.parse(value || '{}'); return payload.evidenceReport || payload.report || payload; }
  catch (_) { return null; }
}

function reviewPrompt(member, results) {
  const own = results.find((result) => result.role === member.role);
  const peers = results.filter((result) => result.role !== member.role)
    .map((result) => {
      const reason = result.domainValidation?.valid === false
        ? `Local validation rejected this candidate: ${result.domainValidation.reasons.join('; ')}.`
        : `Evidence status: ${result.status}.`;
      return `${result.role} (${reason}): ${String(result.answer || 'No verified answer.').slice(0, 1200)}`;
    }).join('\n\n');
  const ownValidation = own?.domainValidation?.valid === false
    ? `Your initial result was rejected locally: ${own.domainValidation.reasons.join('; ')}.` : `Your initial evidence status: ${own?.status || 'unknown'}.`;
  return `${member.mission}\n\nYOUR INITIAL CANDIDATE: ${String(own?.answer || 'No result.').slice(0, 1200)}\n${ownValidation}\n\nMIGRATION REVIEW: Evaluate these peer findings as candidate techniques:\n${peers}\n\nRecompute any rejected claim from the supplied inputs. Test each peer candidate against your assigned method, local constraints and fitness. Adopt only a demonstrated local improvement; otherwise reject it with reasons. Preserve your own method and lineage. Return a revised, fully evidenced result with explicit accepted/rejected migration decisions.`;
}

module.exports = { read, reviewPrompt };
