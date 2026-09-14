const { calculateLevenshtein } = require('./resilienceDrift');

const MUTATION_SYNONYMS = {
  'always': ['strictly', 'consistently', 'systematically'],
  'never': ['under no circumstance', 'avoid', 'prohibit'],
  'verify': ['falsify', 'cross-examine', 'validate thoroughly'],
  'analyze': ['decompose', 'dissect', 'scrutinize'],
  'execute': ['run cautiously', 'enact with verification', 'dispatch'],
  'fast': ['deliberate', 'optimized', 'budget-conscious'],
  'safe': ['adversarial-hardened', 'resilient', 'fail-safe'],
  'explore': ['broaden search', 'branch out', 'diverge']
};

function selectSynonym(word, context) {
  const clean = word.toLowerCase().replace(/[^a-z]/g, '');
  const alternatives = MUTATION_SYNONYMS[clean];
  if (!alternatives) return null;
  let hash = 0;
  const key = `${context.seed}:${context.index}:${clean}`;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  if ((hash / 0xffffffff) >= context.rate) return null;
  const alt = alternatives[hash % alternatives.length];
  const escaped = clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return word.replace(new RegExp(escaped, 'i'), alt);
}

function selectDirective(seed) {
  const directives = [
    '\n[Somatic Hypermutation Directive: Favor exploratory alternatives and verify assumptions before committing.]',
    '\n[Somatic Hypermutation Directive: Test edge-case hypotheses and avoid repetitive tool loops.]',
    '\n[Somatic Hypermutation Directive: Re-evaluate constraints from an adversarial perspective.]'
  ];
  let dirHash = 0;
  for (let i = 0; i < seed.length; i++) dirHash = (dirHash * 31 + seed.charCodeAt(i)) >>> 0;
  return directives[dirHash % directives.length];
}

function mutatePromptWords(text, seed, rate) {
  const words = text.split(/(\s+)/);
  let count = 0;
  const mutated = words.map((word, index) => {
    const replacement = selectSynonym(word, { seed, index, rate });
    if (!replacement) return word;
    count += 1;
    return replacement;
  });
  return { text: mutated.join(''), count };
}

function somaticHypermutationPrompt(prompt = '', mutationRate = 0.2, options = {}) {
  const text = String(prompt || '');
  if (!text.trim()) return { originalLength: 0, mutatedLength: 0, mutatedPrompt: text, mutatedCount: 0, drift: 0 };
  const rate = Math.max(0.01, Math.min(0.8, Number(mutationRate || 0.2)));
  const seed = options.seed ? String(options.seed) : `mut_${Date.now()}`;
  const mutations = mutatePromptWords(text, seed, rate);
  let result = mutations.text;
  let mutatedCount = mutations.count;
  if (mutatedCount === 0 || options.forcePerturbation) {
    result += selectDirective(seed);
    mutatedCount += 1;
  }
  return {
    originalLength: text.length,
    mutatedLength: result.length,
    mutatedPrompt: result,
    mutatedCount,
    drift: calculateLevenshtein(text, result)
  };
}

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function firstDefined(value, fallback) {
  return value === undefined ? fallback : value;
}

function finiteNumber(value, fallback) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function normalizeApoptosisArgs(args) {
  const primary = args[0];
  if (isPlainObject(primary)) return normalizeApoptosisObject(primary);
  return normalizeApoptosisPositional(args);
}

function normalizeApoptosisObject(primary) {
  return {
    agentId: primary.agentId || primary.agent_id || 'agent-unknown',
    triggerMetrics: primary.triggerMetrics || primary.metrics || {},
    db: primary.db || null,
    policy: primary.policy || {}
  };
}

function normalizeApoptosisPositional(args) {
  return {
    agentId: args[0],
    triggerMetrics: firstDefined(args[1], {}),
    db: firstDefined(args[2], null),
    policy: firstDefined(args[3], {})
  };
}

function deriveApoptosisMetrics(context) {
  const metrics = context.triggerMetrics;
  const policy = context.policy;
  const consecutiveFailures = Math.max(0, Math.floor(finiteNumber(metrics.consecutiveFailures, 0)));
  const hasExplicitDivergence = metrics.semanticDivergence !== undefined && metrics.semanticDivergence !== null;
  const rawDivergence = hasExplicitDivergence ? Number(metrics.semanticDivergence) : null;
  const semanticDivergence = rawDivergence !== null ? Math.max(0, Math.min(1, rawDivergence)) : 0.0;
  const hallucinations = Math.max(0, Math.floor(finiteNumber(metrics.hallucinations, 0)));
  const tokensBurned = Math.max(0, finiteNumber(metrics.tokensBurned, 0));
  const costUsd = Math.max(0, finiteNumber(metrics.costUsd, 0));
  const maxFailures = Math.max(0, Math.floor(finiteNumber(policy.maxConsecutiveFailures, 3)));
  const divergenceThreshold = Math.max(0, Math.min(1, finiteNumber(policy.divergenceThreshold, 0.55)));
  const maxCostUsd = Number(policy.maxCostUsd);
  const repetitionFlag = finiteNumber(metrics.repetitionScore, 0) > 0.15 || hallucinations >= 1;
  const errorsPenalty = consecutiveFailures * 2.5;
  const repetitionPenalty = repetitionFlag ? 5.0 : 0.0;
  const driftPenalty = semanticDivergence > 0.35 ? 6.0 : 0.0;
  const penalty = errorsPenalty + repetitionPenalty + driftPenalty;
  const relief = finiteNumber(metrics.progressScore, 0) * 3.0;
  const initialDissonance = finiteNumber(metrics.dissonanceLevel, 0.0);
  const dissonanceLevel = Math.max(0, Number((initialDissonance + penalty - relief).toFixed(4)));
  const maxDissonanceThreshold = finiteNumber(policy.maxDissonanceThreshold, 50.0);
  return {
    agent: context.agentId || 'agent-unknown',
    consecutiveFailures,
    hasExplicitDivergence,
    rawDivergence,
    semanticDivergence,
    hallucinations,
    tokensBurned,
    costUsd,
    maxFailures,
    divergenceThreshold,
    maxCostUsd,
    dissonanceLevel,
    maxDissonanceThreshold
  };
}

function anyTrigger(triggers) {
  return triggers.failureTrigger || triggers.semanticTrigger || triggers.hallucinationTrigger || triggers.costTrigger || triggers.dissonanceTrigger;
}

function selectApoptosisReason(metrics, triggers) {
  if (triggers.dissonanceTrigger) return `Cognitive conscience dissonance threshold exceeded (${metrics.dissonanceLevel} >= ${metrics.maxDissonanceThreshold})`;
  if (triggers.failureTrigger) return `Consecutive tool failure threshold exceeded (${metrics.consecutiveFailures} >= ${metrics.maxFailures})`;
  if (triggers.semanticTrigger) return `Semantic mission divergence detected (Score: ${metrics.semanticDivergence} < ${metrics.divergenceThreshold})`;
  if (triggers.hallucinationTrigger) return `Unverified hallucination limit breached (${metrics.hallucinations} >= 2)`;
  if (triggers.costTrigger) return `Execution cost limit breached (${metrics.costUsd} >= ${metrics.maxCostUsd} USD)`;
  return 'No termination criteria met';
}

function resolveApoptosisDecision(metrics) {
  const triggers = {
    failureTrigger: metrics.consecutiveFailures >= metrics.maxFailures,
    semanticTrigger: metrics.hasExplicitDivergence && metrics.rawDivergence > 0 && (metrics.rawDivergence < metrics.divergenceThreshold || metrics.rawDivergence > 0.85),
    hallucinationTrigger: metrics.hallucinations >= 2,
    costTrigger: Number.isFinite(metrics.maxCostUsd) && metrics.maxCostUsd >= 0 && metrics.costUsd >= metrics.maxCostUsd,
    dissonanceTrigger: metrics.dissonanceLevel >= metrics.maxDissonanceThreshold
  };
  triggers.shouldTerminate = anyTrigger(triggers);
  triggers.primaryReason = selectApoptosisReason(metrics, triggers);
  return triggers;
}

async function loadRecentTelemetry(db, agent) {
  if (!db) return [];
  const events = await db.all(
    'SELECT event_type, action, detail, severity, created_at FROM telemetry_events WHERE agent_id = ? ORDER BY id DESC LIMIT 3',
    agent
  );
  return events.reverse().map((event, index) => ({
    step: index + 1,
    tool: event.action || event.event_type,
    status: String(event.severity || 'info').toUpperCase(),
    detail: event.detail || ''
  }));
}

function buildAutopsyReport(metrics, decision, lastActions) {
  const shouldTerminate = decision.shouldTerminate;
  return {
    reportId: `autopsy_${metrics.agent}_${Date.now()}`,
    agentId: metrics.agent,
    timestamp: new Date().toISOString(),
    apoptosisExecuted: shouldTerminate,
    triggerReason: decision.primaryReason,
    metricsSnapshot: {
      dissonanceLevel: metrics.dissonanceLevel,
      maxDissonanceThreshold: metrics.maxDissonanceThreshold,
      consecutiveFailures: metrics.consecutiveFailures,
      tokensBurned: metrics.tokensBurned,
      costUsd: metrics.costUsd,
      semanticDivergence: metrics.semanticDivergence,
      hallucinations: metrics.hallucinations
    },
    terminalCallStack: shouldTerminate ? ['Termination requested by resilience policy.'] : [],
    lastActions,
    failingInvariant: shouldTerminate ? decision.primaryReason : null,
    recommendedPromptPatch: shouldTerminate ? 'Review the recorded telemetry and adjust the mission guardrails before restarting.' : null
  };
}

async function markAgentApoptotic(db, agent, shouldTerminate) {
  if (!db || !shouldTerminate) return;
  try {
    await db.run(
      `UPDATE agents SET status = 'apoptosis', is_apoptotic = 1, current_task = 'Terminated by Apoptosis Sentinel', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      agent
    );
  } catch (error) {
  }
}

async function evaluateApoptosisReport(context) {
  const metrics = deriveApoptosisMetrics(context);
  const decision = resolveApoptosisDecision(metrics);
  const lastActions = await loadRecentTelemetry(context.db, metrics.agent);
  const report = buildAutopsyReport(metrics, decision, lastActions);
  await markAgentApoptotic(context.db, metrics.agent, decision.shouldTerminate);
  return report;
}

async function evaluateApoptosis(...args) {
  return evaluateApoptosisReport(normalizeApoptosisArgs(args));
}

module.exports = {
  somaticHypermutationPrompt,
  evaluateApoptosis
};
