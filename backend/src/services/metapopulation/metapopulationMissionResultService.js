'use strict';
const { validateSchedulingResult } = require('./schedulingEvidenceValidator');
const migrationService = require('./metapopulationMigrationService');

async function read(db, member) {
  const agent = await db.get('SELECT status FROM agents WHERE id = ?', member.workerId);
  const event = await db.get(`SELECT id, payload_json FROM telemetry_events WHERE agent_id = ?
    AND event_type = 'EVIDENCE_REPORT' ORDER BY id DESC LIMIT 1`, member.workerId);
  const report = parseEvidence(event?.payload_json);
  const answer = evidenceAnswer(report);
  const expectedMethod = String(member.mission || '').match(/Assigned method:\s*([^\n.]+)/i)?.[1]?.trim() || '';
  const methodValidated = methodEvidenceMatches(primaryEvidence(report), expectedMethod);
  const schedulingValidation = validateSchedulingResult({ mission: member.mission, answer, method: expectedMethod });
  const domainValidation = requireFixtureValidation(member.mission, schedulingValidation);
  const structured = structuredReport(report);
  const review = migrationService.reviewContext(member.mission);
  const baselineValidation = validateSchedulingResult({ mission: member.mission,
    answer: review.baselineAnswer, method: expectedMethod });
  const migrationDecisions = migrationService.validateReviewDecisions({
    decisions: structured.migrationDecisions, candidates: review.candidates,
    baselineValidation, finalValidation: domainValidation
  });
  const complete = completedEvidence({ agent, report, answer, methodValidated, domainValidation });
  const status = complete ? 'completed' : agent?.status === 'completed' ? 'unverified' : agent?.status || 'NO_EVIDENCE';
  return { workerId: member.workerId, role: member.role, status,
    answer: answer || null, evidenceEventId: event?.id || null, outcome: report?.outcome || null,
    expectedMethod: expectedMethod || null, methodValidated, domainValidation,
    transferableIdeas: structured.transferableIdeas, migrationDecisions };
}

function requireFixtureValidation(mission, validation) {
  if (!String(mission || '').includes('Comparative mission fixture') || validation?.applicable) return validation;
  return { applicable: true, valid: false, reasons: ['No deterministic evaluator is registered for this fixture domain.'] };
}

function structuredReport(report) {
  const content = report?.workerArtifact?.content || {};
  const parsed = [report?.answer, report?.claims?.[0]?.statement, content.claims?.[0]?.statement]
    .map(parseStructuredAnswer).find(Boolean) || {};
  return {
    transferableIdeas: report?.transferableIdeas || content.transferableIdeas || parsed.transferableIdeas || [],
    migrationDecisions: report?.migrationDecisions || content.migrationDecisions || parsed.migrationDecisions || []
  };
}

function parseStructuredAnswer(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string') return null;
  const source = value.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try {
    const parsed = JSON.parse(source);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch (_) {
    return null;
  }
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
  return agent?.status === 'completed' && report?.outcome === 'success' && answer.length > 0
    && methodValidated && domainValidation?.valid !== false
    && (!domainValidation?.applicable || domainValidation.valid === true);
}

function parseEvidence(value) {
  try { const payload = JSON.parse(value || '{}'); return payload.evidenceReport || payload.report || payload; }
  catch (_) { return null; }
}

function reviewPrompt(member, results) {
  return migrationService.reviewPrompt(member, results);
}

module.exports = { read, reviewPrompt };
