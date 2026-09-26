'use strict';

const crypto = require('crypto');
const modelRouter = require('./modelRouter');
const { hashWorkspace } = require('./trinitySnapshotService');

const INTERVENTION_TYPES = ['favorable', 'adverse', 'custom'];

function parseIntervention(text) {
  const lines = String(text || '').split('\n');
  return foldInterventionLines(lines).filter(i => i.description.length > 10);
}

function foldInterventionLines(lines) {
  const interventions = [];
  let current = null;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('INTERVENTION:')) {
      if (current) interventions.push(current);
      current = startIntervention(trimmed);
    } else if (current && trimmed) {
      current.description += ' ' + trimmed;
    }
  }
  if (current) interventions.push(current);
  return interventions;
}

function startIntervention(trimmed) {
  const parts = trimmed.split(':').slice(1).join(':').trim().split('|');
  return {
    type: partAt(parts, 0, 'custom'),
    dimension: partAt(parts, 1, 'assumption'),
    description: partAt(parts, 2, ''),
    expectedEffect: partAt(parts, 3, '')
  };
}

function partAt(parts, index, fallback) {
  return parts[index]?.trim() || fallback;
}

async function generateInterventions(input) {
  const { mission, baselineReport, config } = input;
  const prompt = [
    'Generate 2 counterfactual interventions for a Trinity experiment: one favorable, one adverse.',
    'Each intervention changes ONE key assumption/dimension from the baseline.',
    'Return JSON only: {"interventions":[{"type":"favorable|adverse","dimension":"...","description":"...","expectedEffect":"..."},{"type":"favorable|adverse","dimension":"...","description":"...","expectedEffect":"..."}]}',
    'Dimensions: requirements, constraints, technology, timeline, team, architecture, data, regulations.',
    `Mission: ${String(mission || '').slice(0, 3000)}`,
    `Baseline Evidence Vector: ${JSON.stringify(baselineReport?.evidenceVector || {})}`,
    `Baseline Claims: ${JSON.stringify((baselineReport?.claims || []).slice(0, 5))}`
  ].join('\n');

  const budget = Math.min(Number(config?.maxCostUsd || 0.3), 0.3);
  try {
    const result = await modelRouter.generate({
      db: input.db, agentId: input.agentId,
      organizationId: input.tenant?.organizationId, projectId: input.tenant?.projectId,
      model: config?.modelUri, prompt, maxTokens: 1000,
      maxCostUsd: budget, timeoutMs: 20000, priority: 'interactive'
    });
    const parsed = JSON.parse(String(result.text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
    return { interventions: Array.isArray(parsed.interventions) ? parsed.interventions : [], model: result.model };
  } catch (e) {
    return { interventions: [], error: e.message };
  }
}

function applyIntervention(snapshot, intervention) {
  const forked = {
    ...snapshot,
    counterfactual: {
      ...snapshot.counterfactual,
      interventions: [...(snapshot.counterfactual?.interventions || []), intervention],
      forkedAt: new Date().toISOString(),
      parentSnapshotId: snapshot.id
    }
  };
  forked.id = `cf-${crypto.randomBytes(8).toString('hex')}`;
  return forked;
}

function computeDelta(baseline, counterfactual) {
  const baselineVec = baseline.evidenceVector || {};
  const cfVec = counterfactual.evidenceVector || {};
  const dims = new Set([...Object.keys(baselineVec), ...Object.keys(cfVec)]);
  const delta = {};
  for (const dim of dims) {
    const b = Number(baselineVec[dim]) || 0;
    const c = Number(cfVec[dim]) || 0;
    delta[dim] = Number((c - b).toFixed(4));
  }
  return delta;
}

function identifyResponsibleVariables(delta, interventions) {
  const responsible = [];
  for (const [dim, change] of Object.entries(delta)) {
    if (Math.abs(change) > 0.05) {
      responsible.push({
        dimension: dim,
        change,
        linkedInterventions: interventions.filter(i => i.dimension === dim || i.description.includes(dim))
      });
    }
  }
  return responsible.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
}

async function runCounterfactualTrinity(input) {
  const { mission, baselineWorlds, config = {} } = input;
  const baseline = baselineWorlds[0];
  const interventions = config.interventions || (await generateInterventions({ ...input, baselineReport: baseline })).interventions;

  if (interventions.length < 2) {
    throw new Error('Counterfactual requires at least 2 interventions (favorable + adverse)');
  }

  const favorable = interventions.find(i => i.type === 'favorable') || interventions[0];
  const adverse = interventions.find(i => i.type === 'adverse') || interventions[1];

  const favorableMission = `${mission}\n\nCOUNTERFACTUAL INTERVENTION (FAVORABLE): ${favorable.description}\nTreat conclusions as conditional on this intervention.`;
  const adverseMission = `${mission}\n\nCOUNTERFACTUAL INTERVENTION (ADVERSE): ${adverse.description}\nTreat conclusions as conditional on this intervention.`;

  return {
    experimentalDesignId: `counterfactual-v1-${crypto.randomBytes(8).toString('hex')}`,
    baselineMission: mission,
    interventions: { favorable, adverse },
    worldMissions: {
      baseline: mission,
      favorable: favorableMission,
      adverse: adverseMission
    },
    invariants: config.invariants || ['hard_constraints', 'budget_limits', 'evidence_gates'],
    analysisPlan: {
      deltaComputation: 'evidence_vector_difference',
      causalAttribution: 'intervention_linked_dimensions',
      synthesis: 'compare_baseline_favorable_adverse'
    }
  };
}

async function analyzeCounterfactualResults(input) {
  const { baselineReport, favorableReport, adverseReport, interventions } = input;
  const favorableDelta = computeDelta(baselineReport, favorableReport);
  const adverseDelta = computeDelta(baselineReport, adverseReport);
  const responsible = identifyResponsibleVariables(
    { ...favorableDelta, ...adverseDelta },
    [interventions.favorable, interventions.adverse]
  );

  return {
    baselineEvidenceVector: baselineReport.evidenceVector || {},
    favorableDelta,
    adverseDelta,
    responsibleVariables: responsible,
    sensitivity: {
      mostSensitive: responsible[0]?.dimension || null,
      leastSensitive: responsible[responsible.length - 1]?.dimension || null,
      maxImpact: responsible[0] ? Math.abs(responsible[0].change) : 0
    },
    conclusion: responsible.length > 0
      ? `Key drivers: ${responsible.slice(0, 3).map(r => r.dimension).join(', ')}`
      : 'No significant counterfactual effects detected'
  };
}

module.exports = {
  runCounterfactualTrinity,
  analyzeCounterfactualResults,
  generateInterventions,
  applyIntervention,
  computeDelta,
  identifyResponsibleVariables
};