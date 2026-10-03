'use strict';

/**
 * Scout Colony Service — M10.
 *
 * Permet à un ResidentDaemon de spawn des ScoutCells bornées pour
 * la reconnaissance de territoire. Les ScoutCells sont en lecture
 * seule : observation + analyse, jamais écriture, commit, spawn.
 *
 * Invariants :
 *  - ScoutCell != autorité (read-only, pas de spawn/récursion) ;
 *  - colonie bornée (maxCells, budget, ttl) ;
 *  - preuves ancrées au HEAD du territoire observé.
 */

const { getPhenotype, getAuthorityProfile } = require('../../agents/phenotypeRegistryService');

const COLONY_ID_PATTERN = /^colony\.[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CELL_ID_PATTERN = /^scout\.[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DAEMON_ID_PATTERN = /^daemon\.[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TERRITORY_ID_PATTERN = /^territory\.[a-z0-9]+(?:-[a-z0-9]+)*$/;

const PARTITION_STRATEGIES = Object.freeze([
  'architecture', 'git-history', 'tests', 'by-path', 'by-symbol'
]);

const COLONY_STATES = Object.freeze([
  'FORMING', 'SCOUTING', 'AGGREGATING', 'DISSOLVING', 'DISSOLVED'
]);

const CELL_STATES = Object.freeze([
  'PENDING', 'RUNNING_STATIC', 'RUNNING_LLM', 'REPORTING', 'COMPLETE', 'EXHAUSTED'
]);

const DEFAULTS = Object.freeze({
  maxCells: 12, budget: 1000, ttlMs: 300000, llmRatio: 0.05
});

const SCOUT_PHENOTYPE_ID = 'ScoutCell';
const RESIDENT_DAEMON_ID = 'ResidentDaemon';

const colonyRegistry = new Map();
const cellRegistry = new Map();

function safeParse(text) {
  try {
    const parsed = JSON.parse(text || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) { return {}; }
}

function generateId(prefix) {
  return `${prefix}.${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function checkValidId(value, pattern) {
  return pattern.test(value || '');
}

function validateBasicInput(input) {
  if (!input || typeof input !== 'object') return ['input-object-required'];
  const errors = [];
  if (!checkValidId(input.territoryId, TERRITORY_ID_PATTERN)) errors.push('invalid-territoryId');
  if (!input.observationGoal || String(input.observationGoal).length < 5) errors.push('observationGoal-too-short');
  return errors;
}

function validateOptionalFields(input) {
  const errors = [];
  checkStrategyError(input, errors);
  checkMaxCellsError(input, errors);
  checkBudgetError(input, errors);
  checkTtlError(input, errors);
  checkLlmRatioError(input, errors);
  return errors;
}

function checkStrategyError(input, errors) {
  if (input.partitionStrategy && !PARTITION_STRATEGIES.includes(input.partitionStrategy)) {
    errors.push('invalid-partitionStrategy');
  }
}

function checkMaxCellsError(input, errors) {
  if (input.maxCells === undefined) return;
  const valid = Number.isInteger(input.maxCells) && input.maxCells >= 1 && input.maxCells <= 50;
  if (!valid) errors.push('invalid-maxCells');
}

function checkBudgetError(input, errors) {
  if (input.budget === undefined) return;
  const valid = Number.isInteger(input.budget) && input.budget >= 100;
  if (!valid) errors.push('invalid-budget');
}

function checkTtlError(input, errors) {
  if (input.ttl === undefined) return;
  const valid = Number.isInteger(input.ttl) && input.ttl >= 1000;
  if (!valid) errors.push('invalid-ttl');
}

function checkLlmRatioError(input, errors) {
  if (input.llmRatio === undefined) return;
  if (!Number.isFinite(input.llmRatio) || input.llmRatio < 0 || input.llmRatio > 1) {
    errors.push('invalid-llmRatio');
  }
}

function validateRequest(input) {
  const errors = validateBasicInput(input);
  if (errors.length === 0) {
    const optionalErrors = validateOptionalFields(input);
    if (optionalErrors.length > 0) return { ok: false, errors: optionalErrors };
  }
  return { ok: errors.length === 0, errors };
}

function spawnColony(ctx) {
  if (!ctx || !ctx.daemonId || !ctx.request) {
    return { spawned: false, errors: ['daemonId-and-request-required'] };
  }
  if (!checkValidId(ctx.daemonId, DAEMON_ID_PATTERN)) {
    return { spawned: false, errors: ['invalid-daemonId'] };
  }
  const validation = validateRequest(ctx.request);
  if (!validation.ok) return { spawned: false, errors: validation.errors };
  if (!getPhenotype(RESIDENT_DAEMON_ID)) {
    return { spawned: false, errors: ['daemon-phenotype-unknown'] };
  }
  const request = normalizeRequest(ctx.request);
  const colony = createColony(ctx.daemonId, request);
  colonyRegistry.set(colony.id, colony);
  return { spawned: true, colony: { ...colony } };
}

function createColony(daemonId, request) {
  const colonyId = generateId('colony');
  const createdAt = Date.now();
  return {
    id: colonyId, apiVersion: 'genos.daemon/v1', kind: 'ScoutColony',
    daemonId, territoryId: request.territoryId,
    observationGoal: request.observationGoal, partitionStrategy: request.partitionStrategy,
    maxCells: request.maxCells, budget: request.budget, ttlMs: request.ttl,
    llmRatio: request.llmRatio, state: 'FORMING', cellIds: [], findings: [],
    createdAt, expiresAt: createdAt + request.ttl
  };
}

function normalizeRequest(request) {
  return {
    territoryId: request.territoryId, observationGoal: request.observationGoal,
    partitionStrategy: request.partitionStrategy || 'architecture',
    maxCells: Math.min(request.maxCells || DEFAULTS.maxCells, 50),
    budget: request.budget || DEFAULTS.budget, ttl: request.ttl || DEFAULTS.ttlMs,
    llmRatio: request.llmRatio ?? DEFAULTS.llmRatio
  };
}

function partitionTerritory(ctx) {
  if (!ctx || !ctx.territory || !ctx.strategy) {
    return { partitioned: false, errors: ['territory-and-strategy-required'] };
  }
  if (!checkValidId(ctx.territory.id, TERRITORY_ID_PATTERN)) {
    return { partitioned: false, errors: ['invalid-territory-id'] };
  }
  const maxCells = Math.min(ctx.maxCells || DEFAULTS.maxCells, 50);
  const partitions = computePartitions(ctx.territory, ctx.strategy, maxCells);
  return { partitioned: true, strategy: ctx.strategy, partitionCount: partitions.length, partitions };
}

function computePartitions(territory, strategy, maxCells) {
  const base = getBasePartitions(territory, strategy);
  return base.length <= maxCells ? base : mergePartitions(base, maxCells);
}

function getBasePartitions(territory, strategy) {
  const partitions = {
    'architecture': [
      { id: 'partition.core', type: 'module', scope: 'src/core/' },
      { id: 'partition.services', type: 'module', scope: 'src/services/' },
      { id: 'partition.api', type: 'module', scope: 'src/api/' },
      { id: 'partition.utils', type: 'module', scope: 'src/utils/' },
      { id: 'partition.config', type: 'config', scope: 'config/' }
    ],
    'git-history': [
      { id: 'partition.recent', type: 'temporal', scope: 'last-7d' },
      { id: 'partition.stable', type: 'temporal', scope: '30d-90d' },
      { id: 'partition.legacy', type: 'temporal', scope: '>90d' }
    ],
    'tests': [
      { id: 'partition.unit', type: 'test-type', scope: '*.test.*' },
      { id: 'partition.integration', type: 'test-type', scope: '*.integration.*' },
      { id: 'partition.e2e', type: 'test-type', scope: '*.e2e.*' }
    ],
    'by-path': [
      { id: 'partition.backend', type: 'path', scope: 'backend/' },
      { id: 'partition.crates', type: 'path', scope: 'crates/' },
      { id: 'partition.mcp', type: 'path', scope: 'mcp/' }
    ],
    'by-symbol': [
      { id: 'partition.functions', type: 'symbol', scope: 'function-decl' },
      { id: 'partition.classes', type: 'symbol', scope: 'class-decl' },
      { id: 'partition.imports', type: 'symbol', scope: 'import-graph' }
    ]
  };
  return partitions[strategy] || [{ id: 'partition.default', type: 'full', scope: '/' }];
}

function mergePartitions(partitions, maxCells) {
  const merged = [];
  const chunkSize = Math.ceil(partitions.length / maxCells);
  for (let i = 0; i < partitions.length; i += chunkSize) {
    const chunk = partitions.slice(i, i + chunkSize);
    merged.push({
      id: `partition.merged-${i}`, type: 'merged',
      scope: chunk.map((p) => p.scope).join(','),
      mergedFrom: chunk.map((p) => p.id)
    });
  }
  return merged;
}

async function runScoutCell(ctx) {
  const preCheck = checkCellPreconditions(ctx);
  if (preCheck.error) return preCheck.error;
  if (typeof ctx.analyze !== 'function') {
    return { ran: false, errors: ['evidence-backed-analyzer-required'] };
  }
  const result = await ctx.analyze({ territory: ctx.territory, goal: ctx.goal });
  const validation = validateAnalysisResult(result, ctx.territory);
  if (!validation.ok) return { ran: false, errors: validation.errors };
  const cellState = createCellState(ctx, result);
  cellRegistry.set(ctx.cellId, cellState);
  cellState.state = 'COMPLETE';
  cellState.completedAt = Date.now();
  return {
    ran: true, cellId: ctx.cellId, headSha: cellState.headSha,
    provenanceRecordIds: cellState.provenanceRecordIds,
    findings: cellState.findings, tokensUsed: cellState.tokensUsed,
    analysisType: cellState.analysisType
  };
}

function checkCellPreconditions(ctx) {
  const errors = basicCellErrors(ctx);
  if (errors.length) return { error: { ran: false, errors } };
  const authority = getAuthorityProfile(SCOUT_PHENOTYPE_ID);
  if (!authority || authority.write || authority.spawn || authority.promote) {
    return { error: { ran: false, errors: ['scout-authority-violation'] } };
  }
  return { error: null };
}

function basicCellErrors(ctx) {
  if (!ctx || !ctx.cellId || !ctx.territory || !ctx.goal) return ['cellId-territory-goal-required'];
  return [
    checkValidId(ctx.cellId, CELL_ID_PATTERN) ? null : 'invalid-cellId',
    /^[a-f0-9]{40}$/.test(ctx.territory.headSha || '') ? null : 'territory-head-required'
  ].filter(Boolean);
}

function validateAnalysisResult(result, territory) {
  const errors = [
    ...analysisEnvelopeErrors(result, territory),
    ...analysisFindingErrors(result),
    ...analysisTokenErrors(result)
  ];
  return { ok: errors.length === 0, errors };
}

function analysisEnvelopeErrors(result, territory) {
  if (!result || typeof result !== 'object') return ['analysis-result-required'];
  return [
    result.headSha === territory.headSha ? null : 'analysis-head-mismatch',
    Array.isArray(result.provenanceRecordIds) && result.provenanceRecordIds.length ? null : 'analysis-provenance-required'
  ].filter(Boolean);
}

function analysisFindingErrors(result) {
  if (!Array.isArray(result?.findings) || result.findings.some((finding) => !finding || typeof finding !== 'object')) {
    return ['analysis-findings-invalid'];
  }
  return result.findings.some((finding) => !findingHasProvenance(finding, result))
    ? ['finding-provenance-required'] : [];
}

function analysisTokenErrors(result) {
  return Number.isFinite(result?.tokensUsed) && result.tokensUsed >= 0
    ? [] : ['analysis-token-count-invalid'];
}

function findingHasProvenance(finding, result) {
  if (finding.headSha !== result.headSha || !Array.isArray(finding.provenanceRecordIds)) return false;
  return finding.provenanceRecordIds.length > 0
    && finding.provenanceRecordIds.every((id) => result.provenanceRecordIds.includes(id));
}

function createCellState(ctx, result) {
  return {
    id: ctx.cellId, territoryId: ctx.territory.id, headSha: result.headSha,
    provenanceRecordIds: [...result.provenanceRecordIds], goal: ctx.goal,
    state: 'PENDING', findings: result.findings, tokensUsed: result.tokensUsed,
    analysisType: result.analysisType || 'injected', createdAt: Date.now(), completedAt: null
  };
}

function aggregateFindings(ctx) {
  if (!ctx || !ctx.colonyId) return { aggregated: false, errors: ['colonyId-required'] };
  if (!checkValidId(ctx.colonyId, COLONY_ID_PATTERN)) return { aggregated: false, errors: ['invalid-colonyId'] };
  const colony = getColony(ctx.colonyId);
  if (!colony || colony.state === 'DISSOLVED') return { aggregated: false, errors: ['colony-not-found'] };
  const findings = ctx.findings || colony.findings || [];
  const aggregated = mergeAndDeduplicate(findings);
  const territoryGraph = buildTerritoryGraph(aggregated);
  const brief = buildTerritoryBrief(colony, territoryGraph, aggregated);
  colony.findings = aggregated;
  colony.state = 'AGGREGATING';
  colonyRegistry.set(ctx.colonyId, colony);
  return { aggregated: true, colonyId: ctx.colonyId, findingCount: aggregated.length, brief };
}

function mergeAndDeduplicate(findings) {
  const seen = new Map();
  for (const f of findings) {
    const key = `${f.type}:${f.scope}:${f.observation}`;
    if (!seen.has(key)) seen.set(key, f);
  }
  return Array.from(seen.values());
}

function buildTerritoryGraph(findings) {
  const nodes = new Map();
  const edges = [];
  for (const f of findings) {
    const nodeId = `node.${f.type}.${Date.now().toString(36)}`;
    nodes.set(nodeId, { id: nodeId, type: f.type, scope: f.scope });
    edges.push({ from: f.scope, to: nodeId, relation: 'observed' });
  }
  return { nodes: Array.from(nodes.values()), edges };
}

function buildTerritoryBrief(colony, graph, findings) {
  return {
    territoryId: colony.territoryId, observationGoal: colony.observationGoal,
    colonyId: colony.id, state: colony.state, nodeCount: graph.nodes.length,
    edgeCount: graph.edges.length, findingCount: findings.length,
    analysisTypes: [...new Set(findings.map((f) => f.type))], generatedAt: Date.now()
  };
}

function dissolveColony(ctx) {
  if (!ctx || !ctx.colonyId) return { dissolved: false, errors: ['colonyId-required'] };
  if (!checkValidId(ctx.colonyId, COLONY_ID_PATTERN)) return { dissolved: false, errors: ['invalid-colonyId'] };
  const colony = colonyRegistry.get(ctx.colonyId);
  if (!colony) return { dissolved: false, errors: ['colony-not-found'] };
  exhaustCells(colony);
  colony.state = 'DISSOLVED';
  colony.dissolvedAt = Date.now();
  colony.dissolveReason = ctx.reason || 'ttl-expired';
  colonyRegistry.set(ctx.colonyId, colony);
  return { dissolved: true, colonyId: ctx.colonyId, reason: colony.dissolveReason, cellCount: colony.cellIds.length, finalFindingCount: colony.findings.length };
}

function exhaustCells(colony) {
  for (const cellId of colony.cellIds) {
    const cell = cellRegistry.get(cellId);
    if (cell) { cell.state = 'EXHAUSTED'; cellRegistry.set(cellId, cell); }
  }
}

function getColony(colonyId) {
  if (!colonyId || !checkValidId(colonyId, COLONY_ID_PATTERN)) return null;
  const colony = colonyRegistry.get(colonyId);
  if (!colony) return null;
  if (colony.state !== 'DISSOLVED' && colony.expiresAt <= Date.now()) {
    dissolveColony({ colonyId, reason: 'ttl-expired' });
  }
  return colonyRegistry.get(colonyId) || null;
}

function getCell(cellId) {
  if (!cellId || !checkValidId(cellId, CELL_ID_PATTERN)) return null;
  return cellRegistry.get(cellId) || null;
}

function listActiveColonies() {
  return Array.from(colonyRegistry.keys()).map(getColony)
    .filter((colony) => colony && colony.state !== 'DISSOLVED');
}

function clearRegistry() {
  colonyRegistry.clear();
  cellRegistry.clear();
}

module.exports = {
  spawnColony, partitionTerritory, runScoutCell, aggregateFindings, dissolveColony,
  getColony, getCell, listActiveColonies, clearRegistry,
  PARTITION_STRATEGIES, COLONY_STATES, CELL_STATES, DEFAULTS
};
