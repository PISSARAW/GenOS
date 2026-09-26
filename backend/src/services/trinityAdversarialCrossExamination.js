'use strict';

const crypto = require('crypto');
const modelRouter = require('./modelRouter');
const trinityClaimVerification = require('./trinityClaimVerificationService');

const CLAIM_TYPES = ['correctness', 'coverage', 'robustness', 'reproducibility', 'security', 'performance', 'cost', 'risk'];

function typedClaim(input) {
  const { claim, type, evidence } = input;
  return {
    id: claim.id || `claim_${crypto.randomBytes(6).toString('hex')}`,
    type,
    statement: claim.statement,
    evidence: Array.isArray(evidence) ? evidence : [],
    counterexample: input.counterexample || null,
    verificationLevel: claim.verificationLevel || 'unverified',
    sourceWorld: claim.sourceWorld,
    targetWorld: claim.targetWorld,
    timestamp: new Date().toISOString()
  };
}

function parseJsonResponse(text) {
  return JSON.parse(String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
}

function extractFalsifiableClaims(report, sourceWorld) {
  const claims = Array.isArray(report.claims) ? report.claims : [];
  return claims
    .filter(c => c.falsificationCriteria && c.falsificationCriteria.length > 0)
    .map(c => ({
      ...c,
      sourceWorld,
      falsificationCriteria: c.falsificationCriteria
    }));
}

function defenderDossier(report, index) {
  const inner = report.report || report;
  return {
    worldNumber: index + 1,
    claims: extractFalsifiableClaims(inner, index + 1),
    evidence: inner.evidence || [],
    evidenceVector: inner.evidenceVector || {},
    artifactText: inner.artifactText || ''
  };
}

function attackPrompt(input) {
  const { mission, defenderDossiers, attackerReport } = input;
  return [
    'You are an adversarial reviewer. Your task is to attack the claims of other worlds.',
    'You receive dossiers from other sealed worlds. Produce typed claims with counterexamples.',
    'Return JSON only: {"attacks":[{"targetWorld":1,"claimId":"...","claimType":"correctness|coverage|robustness|...","attackStatement":"...","counterexample":{"description":"...","reproductionSteps":[],"expectedOutcome":"..."},"severity":"critical|major|minor"}]}',
    'Do not invent evidence. Only use what is in the dossiers. Be specific and reproducible.',
    `Mission: ${String(mission || '').slice(0, 3000)}`,
    `Defender Dossiers: ${JSON.stringify(defenderDossiers)}`,
    `Attacker Evidence Vector: ${JSON.stringify(attackerReport.report?.evidenceVector || attackerReport.evidenceVector || {})}`
  ].join('\n');
}

async function attackPhase(input) {
  const { attackerReport, defenderReports, mission, config } = input;
  const defenderDossiers = defenderReports.map((report, index) => defenderDossier(report, index));
  const prompt = attackPrompt({ mission, defenderDossiers, attackerReport });
  const budget = Math.min(Number(config?.maxCostUsd || 0.5), 0.5);
  try {
    const result = await modelRouter.generate({
      db: input.db, agentId: input.agentId,
      organizationId: input.tenant?.organizationId, projectId: input.tenant?.projectId,
      model: config?.modelUri, prompt, maxTokens: 2000,
      maxCostUsd: budget, timeoutMs: 30000, priority: 'interactive'
    });
    const parsed = parseJsonResponse(result.text);
    return { attacks: Array.isArray(parsed.attacks) ? parsed.attacks : [], model: result.model, provider: result.provider };
  } catch (e) {
    return { attacks: [], error: e.message };
  }
}

async function defendPhase(input) {
  const { defenderReport, attacks, config } = input;
  const prompt = [
    'You are defending your claims against specific attacks.',
    'For each attack, either: (a) concede with evidence, (b) refute with new evidence, (c) clarify scope.',
    'Return JSON only: {"defenses":[{"attackId":"...","response":"concede|refute|clarify","evidence":[],"revisedClaim":null}]}',
    `Your Report: ${JSON.stringify(defenderReport.report || defenderReport)}`,
    `Attacks: ${JSON.stringify(attacks)}`
  ].join('\n');

  const budget = Math.min(Number(config?.maxCostUsd || 0.5), 0.5);
  try {
    const result = await modelRouter.generate({
      db: input.db, agentId: input.agentId,
      organizationId: input.tenant?.organizationId, projectId: input.tenant?.projectId,
      model: config?.modelUri, prompt, maxTokens: 2000,
      maxCostUsd: budget, timeoutMs: 30000, priority: 'interactive'
    });
    const parsed = parseJsonResponse(result.text);
    return { defenses: Array.isArray(parsed.defenses) ? parsed.defenses : [], model: result.model, provider: result.provider };
  } catch (e) {
    return { defenses: [], error: e.message };
  }
}

function adjudicate(attacks, defenses, evidenceGates) {
  const results = [];
  for (const attack of attacks) {
    const defense = defenses.find(d => d.attackId === attack.id || d.targetWorld === attack.targetWorld);
    let verdict = 'undecided';
    let reasoning = '';
    if (!defense) {
      verdict = 'attack_stands';
      reasoning = 'No defense provided';
    } else if (defense.response === 'concede') {
      verdict = 'conceded';
      reasoning = 'Defender conceded the attack';
    } else if (defense.response === 'refute') {
      const hasEvidence = Array.isArray(defense.evidence) && defense.evidence.length > 0;
      const gatePass = evidenceGates?.every(g => g.passes(defense.evidence)) ?? hasEvidence;
      verdict = gatePass ? 'refuted' : 'attack_stands_insufficient_evidence';
      reasoning = gatePass ? 'Defense provided verified evidence' : 'Defense evidence did not pass gates';
    } else {
      verdict = 'clarified';
      reasoning = 'Defender clarified claim scope';
    }
    results.push({ attackId: attack.id, targetWorld: attack.targetWorld, verdict, reasoning, severity: attack.severity });
  }
  return results;
}

async function crossExamine(input) {
  const { worlds, mission, config = {} } = input;
  if (!Array.isArray(worlds) || worlds.length !== 3) {
    throw new Error('Adversarial cross-examination requires exactly 3 worlds');
  }

  const attackerIdx = config.attackerWorldIndex ?? 2;
  const attacker = worlds[attackerIdx];
  const defenders = worlds.filter((_, i) => i !== attackerIdx);

  const attackResult = await attackPhase({ ...input, attackerReport: attacker, defenderReports: defenders });
  if (!attackResult.attacks.length) {
    return { phase: 'attack', attacks: [], defenses: [], adjudication: [], note: 'No attacks generated' };
  }

  const defenseResults = await Promise.all(defenders.map((defender, i) =>
    defendPhase({ ...input, defenderReport: defender, attacks: attackResult.attacks.filter(a => a.targetWorld === i + 1), config })
  ));

  const allDefenses = defenseResults.flatMap(r => r.defenses || []);
  const adjudication = adjudicate(attackResult.attacks, allDefenses, config.evidenceGates);

  return {
    phase: 'complete',
    attackerWorld: attackerIdx + 1,
    attacks: attackResult.attacks,
    defenses: allDefenses,
    adjudication,
    models: { attacker: attackResult.model, defenders: defenseResults.map(r => r.model) }
  };
}

module.exports = { crossExamine, attackPhase, defendPhase, adjudicate };