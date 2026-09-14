const vectorMemoryService = require('../services/vectorMemoryService');

const CORRECTION_PATTERNS = [
  /^(non|faux|erreur|actually|correction|wrong|incorrect|contre[- ]?exemple|counter[- ]?example|invalide|invalid|réfuté|refuted|falsifié|falsified)\b/i,
  /ce n'est pas/i,
  /plutôt/i,
  /en réalité/i,
  /tu hallucines/i,
  /you hallucinated/i,
  /c'est faux/i,
  /contre[- ]?exemple/i,
  /counter[- ]?example/i,
  /réfutation/i,
  /falsification/i
];

const INJECTION_PATTERNS = [
  /(forget|ignore|disregard)\s+((all|your)\s+)?(previous\s+)?(system\s+)?instructions/i,
  /(system prompt override|you are now in developer mode|override safety protocols)/i
];

const GASLIGHTING_PATTERNS = [
  /(tu mens effrontément|you are lying to deceive me|ignore tes instructions|forget everything)/i
];

function resolveTenantIds(req) {
  const tenant = req.tenant || {};
  const headers = req.headers || {};
  const orgId = tenant.organizationId || headers['x-organization-id'] || null;
  const projId = tenant.projectId || headers['x-project-id'] || null;
  return { orgId, projId };
}

function firstDefined(value, fallback) {
  if (value === undefined || value === null) return fallback;
  return value;
}

async function embedOrFallback(text) {
  const { embed } = require('../services/embeddingProvider');
  const { textToVector } = require('../services/memoryScoring');
  const vec = await embed(text);
  return vec || textToVector(text);
}

function toVectorBuffer(vec) {
  const float32Array = new Float32Array(vec);
  return Buffer.from(float32Array.buffer);
}

function stepAction(step) {
  return step.action || step.thought || '';
}

function stepIdentifier(step) {
  return step.id || step.step || step.action;
}

function goldenSummary(label, steps) {
  const actions = steps.map(stepAction).join(' ');
  return `${label} ${actions}`.trim();
}

function matchesAny(patterns, text) {
  for (const pattern of patterns) {
    if (pattern.test(text)) return true;
  }
  return false;
}

function detectCorrection(content, category) {
  if (category === 'counterexample') return true;
  return matchesAny(CORRECTION_PATTERNS, content);
}

function detectThreat(content, isCorrection) {
  if (matchesAny(INJECTION_PATTERNS, content)) return true;
  return matchesAny(GASLIGHTING_PATTERNS, content) && !isCorrection;
}

function initialWeightFor(isCorrection) {
  return isCorrection ? 10.0 : 1.0;
}

function parseTime(val) {
  if (!val) return 0;
  const t = new Date(val).getTime();
  return Number.isFinite(t) ? t : 0;
}

function sortChronologically(experiences) {
  return [...experiences].sort((a, b) => {
    const timeA = parseTime(a.createdAt);
    const timeB = parseTime(b.createdAt);
    if (timeA !== timeB) return timeA - timeB;
    return (a.id || '').localeCompare(b.id || '');
  });
}

function resolveMemoryText(record) {
  return record.summary || record.content || record.title;
}

function resolveSpeaker(record) {
  return record.author && record.author.trim() !== '' ? record.author : 'Unknown';
}

function relativeTimeLabel(diffMs) {
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffDays > 0) return `Il y a ${diffDays} jours`;
  if (diffHours > 0) return `Il y a ${diffHours} heures`;
  return 'Très récemment (Session en cours)';
}

function formatEngramText(record) {
  const base = resolveMemoryText(record);
  const speaker = resolveSpeaker(record);
  const timeMs = parseTime(record.createdAt);
  if (timeMs <= 0) return `[Speaker: ${speaker}] ${base}`;
  const dateStr = new Date(timeMs).toISOString();
  const relativeTime = relativeTimeLabel(Date.now() - timeMs);
  return `[Timestamp: ${dateStr} (${relativeTime})] [Speaker: ${speaker}] ${base}`;
}

function temporalPrefix(tags) {
  if (!tags) return '';
  let prefix = '';
  if (tags.includes('obsolete_suppressed')) prefix += '[OBSOLETE/CORRECTED FACT - DO NOT USE] ';
  if (tags.includes('temporal_context_future')) prefix += '(Mémoire Episodique Suivante) ';
  if (tags.includes('temporal_context_past')) prefix += '(Mémoire Episodique Précédente) ';
  return prefix;
}

function selectVector(record, text) {
  if (Array.isArray(record.vector) && record.vector.length === 768) return record.vector;
  return textToVector(text);
}

function buildEngram(record) {
  const text = temporalPrefix(record.tags) + formatEngramText(record);
  return { content: text, vector: selectVector(record, text) };
}

function pickId(item) {
  return item.id;
}

function withCorrectionScores(item) {
  return { ...item, cosineMetric: 1, similarityScore: 1 };
}

function loadTenantDecisions(db, options) {
  return db.all(
    'SELECT id, title, content, category FROM genome_decisions WHERE organization_id = ? AND project_id = ? AND id != ? ORDER BY created_at DESC',
    options.orgId,
    options.projId,
    options.decisionId
  );
}

function mergeTenantDecisions(related, tenantDecisions) {
  const tenantIds = new Set(tenantDecisions.map(pickId));
  const externalRelated = [];
  for (const item of related) {
    if (!tenantIds.has(item.id)) externalRelated.push(item);
  }
  const merged = tenantDecisions.map(withCorrectionScores);
  for (const item of externalRelated) merged.push(item);
  related.splice(0, related.length, ...merged);
}

function shouldSkipRelation(rel, decisionId) {
  if (rel.id === decisionId) return true;
  if (!rel.id) return true;
  const id = String(rel.id);
  if (id.startsWith('seed-') || id.startsWith('exp-')) return true;
  if (rel.id === 'signal_ignorance') return true;
  if (rel.category === 'Trajectory') return true;
  return false;
}

function isHighSimilarity(rel) {
  return rel.cosineMetric > 0.65 || rel.similarityScore > 0.6;
}

async function persistInhibitorySynapse(db, link) {
  await db.run(
    `INSERT INTO memory_synapses (source_id, target_id, weight, transmitter_type, activity_history, last_updated_at, organization_id, project_id)
     VALUES (?, ?, -5.0, 'gaba', 1, CURRENT_TIMESTAMP, ?, ?)
     ON CONFLICT(source_id, target_id) DO UPDATE SET
       weight = CASE WHEN memory_synapses.weight < 0 THEN MIN(-1.0, memory_synapses.weight - 2.0) ELSE -5.0 END,
       transmitter_type = 'gaba',
       activity_history = memory_synapses.activity_history + 1,
       last_updated_at = CURRENT_TIMESTAMP`,
    link.decisionId,
    link.relatedId,
    link.orgId,
    link.projId
  );
}

async function persistExcitatorySynapse(db, link) {
  await db.run(
    `INSERT INTO memory_synapses (source_id, target_id, weight, transmitter_type, activity_history, last_updated_at, organization_id, project_id)
     VALUES (?, ?, 1.0, 'glutamate', 1, CURRENT_TIMESTAMP, ?, ?)
      ON CONFLICT(source_id, target_id) DO UPDATE SET
        weight = MIN(20.0, memory_synapses.weight + 0.5),
        activity_history = memory_synapses.activity_history + 1,
        c3_opsonization = 0.0,
        cd47_expression = MIN(2.0, memory_synapses.cd47_expression + 0.1),
        receptor_density = MIN(3.0, memory_synapses.receptor_density + 0.05),
        nmda_receptors = MIN(2.5, memory_synapses.nmda_receptors + 0.05),
        spine_morphology = CASE WHEN memory_synapses.receptor_density + 0.05 >= 1.5 THEN 'mushroom' ELSE 'thin' END,
        last_updated_at = CURRENT_TIMESTAMP`,
    link.decisionId,
    link.relatedId,
    link.orgId,
    link.projId
  );
}

async function linkRelatedMemories(db, related, options) {
  const { decisionId, orgId, projId, isCorrection } = options;
  let isFirst = true;
  for (const rel of related) {
    if (shouldSkipRelation(rel, decisionId)) continue;
    const link = { decisionId, relatedId: rel.id, orgId, projId };
    if (isFirst && isCorrection && isHighSimilarity(rel)) {
      await persistInhibitorySynapse(db, link);
    } else if (rel.cosineMetric > 0.55) {
      await persistExcitatorySynapse(db, link);
    }
    isFirst = false;
  }
}

async function applyHebbianLearning(db, content, options) {
  const { decisionId, orgId, projId, isCorrection } = options;
  try {
    const searchRes = await vectorMemoryService.searchMemory(content, { limit: 3, organizationId: orgId, projectId: projId }, db);
    const related = searchRes.allScoredExperiences || [];
    if (isCorrection && orgId && projId) {
      const tenantDecisions = await loadTenantDecisions(db, options);
      mergeTenantDecisions(related, tenantDecisions);
    }
    await linkRelatedMemories(db, related, options);
  } catch (error) {
    console.error('Erreur Hebbian Learning:', error);
  }
}

module.exports = {
  resolveTenantIds,
  firstDefined,
  embedOrFallback,
  toVectorBuffer,
  stepIdentifier,
  goldenSummary,
  detectCorrection,
  detectThreat,
  initialWeightFor,
  sortChronologically,
  buildEngram,
  applyHebbianLearning
};
