'use strict';

const { contractFor } = require('./topologyCapabilityService');
const { CAPABILITY_TOOLS, normalizeToolName, derivePolicyLease } = require('./toolLeasePolicy');

function uniqueSorted(arr) { return [...new Set(arr || [])].sort(); }
function normId(v) { return String(v || '').trim().toLowerCase().replace(/[^a-z0-9:]/g, ''); }

function conceptMatchesRole(concept, role) {
  if (!role) return true;
  return (concept.compatible_roles || []).length === 0 || (concept.compatible_roles || []).includes(role);
}

function conceptInTopology(concept, contract, req) {
  const caps = concept.capabilities || [];
  const tMatch = (concept.compatible_topologies || []).includes(contract && contract.mode);
  return tMatch || req.some(r => caps.includes(r)) || !req.length;
}

function computeAvailable(ctx) {
  const c = contractFor({ mode: ctx.mode, organization: ctx.topology });
  const req = c ? c.required : [];
  const out = [];
  for (const [k, concept] of Object.entries(ctx.capabilityGraph || {})) {
    if (!concept || !conceptMatchesRole(concept, ctx.role)) continue;
    if (!conceptInTopology(concept, c, req)) continue;
    out.push({ id: k, capabilities: concept.capabilities || [] });
  }
  return uniqueSorted(out.map(a => a.id)).map(id => out.find(a => a.id === id));
}

function computeConsidered(plan) {
  if (!plan) return [];
  const ids = new Set();
  for (const t of plan.requiredTools || []) ids.add(normId(t));
  for (const c of plan.consideredCapabilities || []) ids.add(normId(c));
  for (const d of plan.decisions || []) if (d.considered) for (const i of d.considered) ids.add(normId(i));
  return [...ids].sort();
}

function computeRejected(plan) {
  if (!plan) return [];
  return (plan.decisions || []).filter(d => d.status === 'rejected' && d.id)
    .map(d => ({ id: normId(d.id), reason: d.reason || 'no_reason' }));
}

function computeGranted(ctx, plan) {
  const lease = derivePolicyLease({
    executionMode: ctx.role === 'orchestrator' ? 'orchestrator' : 'worker',
    role: ctx.role || 'worker',
    capabilities: plan && plan.capabilityContract ? plan.capabilityContract.required : [],
    plan: plan || {}
  });
  return uniqueSorted(lease.map(t => normId(t)));
}

function computeExecuted(tools) { return uniqueSorted((tools || []).map(t => normId(t))); }

function computeSuccessful(ev) {
  const s = new Set();
  for (const e of ev || []) {
    if (((e.valid || e.produced_evidence) && e.tool) || (e.status === 'success' && e.tool)) s.add(normId(e.tool));
  }
  return [...s].sort();
}

function computeUseful(ev, plan) {
  const u = new Set();
  for (const e of ev || []) if (e.contributed_to_progress && e.tool) u.add(normId(e.tool));
  if (plan && plan.decisions) for (const d of plan.decisions) if (d.used_for_progress && d.tool) u.add(normId(d.tool));
  return [...u].sort();
}

function computeMissing(considered, ev) {
  const set = new Set(considered);
  const h = new Set();
  for (const e of ev || []) {
    if (e.suggested_capability && !set.has(normId(e.suggested_capability))) h.add(normId(e.suggested_capability));
    if (e.missing_capability_hint && !set.has(normId(e.missing_capability_hint))) h.add(normId(e.missing_capability_hint));
  }
  return [...h].sort();
}

function checkLease(cap, ctx) {
  const tools = cap.capabilities.flatMap(c => CAPABILITY_TOOLS[c] || []);
  if (!tools.length) return { denied: false };
  const lease = derivePolicyLease({
    executionMode: ctx.role === 'orchestrator' ? 'orchestrator' : 'worker',
    role: ctx.role || 'worker', capabilities: cap.capabilities, plan: ctx.plan || {}
  });
  return { denied: tools.every(t => !lease.includes(normalizeToolName(t))), blocked: tools.filter(t => !lease.includes(normalizeToolName(t))) };
}

function computeUnavailable(available, ctx) {
  const u = [];
  for (const cap of available) {
    const lr = checkLease(cap, ctx);
    if (lr.denied) { u.push({ id: cap.id, reason: 'lease_denied', blocked_tools: lr.blocked }); continue; }
    const sr = cap.sandbox_requirements || [];
    if (sr.length && !ctx.sandboxProvided) u.push({ id: cap.id, reason: 'sandbox_mismatch', requires: sr });
  }
  return u;
}

function checkFlailing(m, s, a) {
  if (m.executed > 5 && s.effectivenessScore < 0.3) a.push({ type: 'flailing', severity: 'high', detail: `High execution (${m.executed}) but low effectiveness (${s.effectivenessScore}).` });
}

function checkBlindPlanner(m, a) {
  if (m.available > 3 && m.considered / Math.max(1, m.available) < 0.3) a.push({ type: 'blind_planner', severity: 'medium', detail: `Only ${m.considered}/${m.available} capabilities considered.` });
}

function checkTotalFailure(m, a) {
  if (m.executed > 0 && m.successful === 0) a.push({ type: 'total_failure', severity: 'critical', detail: `${m.executed} executed, zero valid evidence.` });
}

function checkMissed(m, a) {
  if (m.missing > 3) a.push({ type: 'missed_opportunities', severity: m.missing > 6 ? 'high' : 'medium', detail: `${m.missing} capabilities would have helped but were not considered.` });
}

function checkAccessStarvation(m, a) {
  if (m.unavailable / Math.max(1, m.available) > 0.5) a.push({ type: 'access_starvation', severity: 'medium', detail: `>${Math.round(m.unavailable / m.available * 100)}% capabilities unavailable.` });
}

function checkLowCoverage(s, m, a) {
  if (s.coverageScore < 0.2 && m.available > 2) a.push({ type: 'low_coverage', severity: 'medium', detail: `Coverage ${s.coverageScore} indicates poor exploration.` });
}

function checkSuccessWithoutProgress(m, a) {
  if (m.successful > m.useful && m.executed > 2) a.push({ type: 'success_without_progress', severity: 'low', detail: `${m.successful} valid but only ${m.useful} contributed to progress.` });
}

function detectAnomalies(r) {
  const a = [], m = r.metrics, s = r.scores;
  checkFlailing(m, s, a);
  checkBlindPlanner(m, a);
  checkTotalFailure(m, a);
  checkMissed(m, a);
  checkAccessStarvation(m, a);
  checkLowCoverage(s, m, a);
  checkSuccessWithoutProgress(m, a);
  return a;
}

function buildRecommendations(r) {
  const recs = [], m = r.metrics, s = r.scores;
  if (s.effectivenessScore < 0.5 && m.executed > 0) recs.push('Investigate failing tools: review lease/sandbox constraints.');
  if (m.available > 3 && m.considered < m.available / 2) recs.push('Expand capability consideration: planner using narrow subset.');
  if (m.missing > 0) recs.push(`Re-evaluate ${m.missing} missing capabilities suggested by evidence.`);
  if (m.executed > 5 && m.useful / m.executed < 0.3) recs.push('Reduce execution breadth: focus on progress-contributing tools.');
  return recs.length ? recs : ['Coverage and effectiveness within acceptable thresholds.'];
}

function buildMetrics(states) {
  return {
    available: states.available.length, considered: states.considered.length,
    rejected: states.rejected.length, granted: states.granted.length,
    executed: states.executed.length, successful: states.successful.length,
    useful: states.useful.length, missing: states.missing.length,
    unavailable: states.unavailable.length
  };
}

function buildScores(m) {
  return {
    coverageScore: Number(((m.considered / Math.max(1, m.available)) * (m.useful / Math.max(1, m.executed))).toFixed(4)),
    effectivenessScore: Number((m.successful / Math.max(1, m.executed)).toFixed(4)),
    missedOpportunities: m.missing
  };
}

function buildEmptyReport() {
  return {
    missionId: null, timestamp: new Date().toISOString(),
    topology: { mode: null, organization: null, role: null },
    metrics: { available: 0, considered: 0, rejected: 0, granted: 0, executed: 0, successful: 0, useful: 0, missing: 0, unavailable: 0 },
    scores: { coverageScore: 0, effectivenessScore: 0, missedOpportunities: 0 },
    states: { available: [], considered: [], rejected: [], granted: [], executed: [], successful: [], useful: [], missing: [], unavailable: [] },
    anomalies: [{ type: 'invalid_context', severity: 'critical', detail: 'No valid context provided.' }],
    recommendations: ['Provide a valid mission context.']
  };
}

function auditMission(ctx) {
  if (!ctx || typeof ctx !== 'object') return buildEmptyReport();

  const avail = computeAvailable(ctx);
  const considered = computeConsidered(ctx.plan);
  const rejected = computeRejected(ctx.plan);
  const granted = computeGranted(ctx, ctx.plan);
  const executed = computeExecuted(ctx.executedTools);
  const successful = computeSuccessful(ctx.evidence);
  const useful = computeUseful(ctx.evidence, ctx.plan);
  const missing = computeMissing(considered, ctx.evidence);
  const unavailable = computeUnavailable(avail, ctx);

  const states = {
    available: avail.map(a => a.id), considered, rejected, granted,
    executed, successful, useful, missing, unavailable
  };
  const m = buildMetrics(states);
  const s = buildScores(m);

  return {
    missionId: ctx.missionId || null, timestamp: new Date().toISOString(),
    topology: { mode: ctx.mode || null, organization: ctx.topology || null, role: ctx.role || null },
    metrics: m, scores: s, states,
    anomalies: detectAnomalies({ metrics: m, scores: s }),
    recommendations: buildRecommendations({ metrics: m, scores: s })
  };
}

module.exports = { auditMission, detectAnomalies };
