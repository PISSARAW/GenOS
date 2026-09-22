'use strict';

/**
 * @file mathematicalOrganismExplore.js
 * @description Explore and verify phases for MathematicalOrganismRuntime
 */

const crypto = require('node:crypto');
const { createFormalResult } = require('../formalResultService');
const { createProofArtifact } = require('./proofArtifact');

function allocate(runtime) {
  for (const [, niche] of runtime.nicheService.niches) {
    const pop = niche.population;
    if (!pop) continue;

    for (const [, lineage] of runtime.environment.lineages) {
      let assigned = false;
      for (const [, n] of runtime.nicheService.niches) {
        if (n.population?.lineages.has(lineage.id)) {
          assigned = true;
          break;
        }
      }
      if (!assigned) {
        runtime.nicheService.allocateToBestNiche(lineage);
      }
    }
  }
}

async function explore(runtime, questions) {
  const attempts = [];

  for (const [, niche] of runtime.nicheService.niches) {
    const pop = niche.population;
    if (!pop) continue;

    for (const [, lineage] of pop.lineages) {
      const goal = runtime.environment.problem.statement;
      const patches = runtime.forager.forage(goal, 3);
      const selectedStrategies = runtime.strategyRepertoire.selectForGoal(goal, 3);

      for (const strat of selectedStrategies) {
        const attempt = {
          id: `attempt-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
          lineageId: lineage.id,
          nicheId: niche.id,
          strategy: strat.name,
          goal,
          patches: patches.map(p => p.id),
          timestamp: new Date().toISOString(),
        };
        attempts.push(attempt);
        runtime.spent.tokens += 10;
      }
    }
  }

  return attempts;
}

async function verify(runtime, attempts) {
  if (!runtime.leanGate) {
    return attempts.map(a => ({ ...a, verified: false, reason: 'no_lean_gate' }));
  }

  const verified = [];

  for (const attempt of attempts) {
    const formalResult = createFormalResult({
      canonicalStatement: attempt.goal,
      status: 'formalized',
      evidence: { kind: 'proof', content: `Attempt using ${attempt.strategy}` },
      assumptions: [],
      validityDomain: { statement: 'general', constraints: [] },
      dependencies: [],
      provenance: {
        createdAt: new Date().toISOString(),
        actor: `lineage-${attempt.lineageId}`,
        source: { type: 'mathematical_organism', uri: `attempt:${attempt.id}`, digest: `sha256:${crypto.createHash('sha256').update(attempt.id).digest('hex')}` },
        inputs: [],
        transformations: [`strategy:${attempt.strategy}`],
      },
      producer: { model: 'mathematical_organism', version: '1.0' },
    });

    const artifact = createProofArtifact({
      id: attempt.id,
      type: 'obligation',
      statement: attempt.goal,
      domain: runtime.environment.problem.domain,
    });
    artifact.attachFormalResult(formalResult);

    const leanSource = generateLeanSource(attempt);
    let success = false;
    try {
      success = await artifact.verifyThroughLean(runtime.leanGate, leanSource);
    } catch (e) {
      // ProofArtifact throws for sorry/admit or other epistemic violations
      // Record as failure and continue
      recordFailure(runtime, attempt);
      continue;
    }

    if (success) {
      verified.push({ ...attempt, verified: true, artifact });
      recordSuccess(runtime, attempt);
    } else {
      recordFailure(runtime, attempt);
    }
  }

  return verified;
}

function generateLeanSource(attempt) {
  // Generate Lean source that states the actual goal, not trivial True.
  // A real system would use an autoformalizer to convert the goal to proper Lean syntax.
  // The key requirement: the theorem statement must match the canonicalStatement.
  const goal = attempt.goal || 'unspecified_goal';
  const safeGoal = goal.replace(/:/g, '').replace(/"/g, '\\"').substring(0, 200);
  return `theorem attempt : "${safeGoal}" := by sorry`;
}

function recordSuccess(runtime, attempt) {
  runtime.strategyRepertoire.recordOutcome(attempt.strategy, true);

  for (const [, niche] of runtime.nicheService.niches) {
    const lineage = niche.population?.lineages.get(attempt.lineageId);
    if (lineage) {
      const current = lineage.fitness || { P: 0, N: 0.5, I: 0.5, A: 0, T: 0.5, R: 0.5, C: 1 };
      lineage.fitness = {
        P: Math.min(1, current.P + 0.1),
        N: current.N,
        I: Math.min(1, current.I + 0.05),
        A: current.A,
        T: current.T,
        R: Math.min(1, current.R + 0.02),
        C: current.C,
      };
      niche.recordReturn(0.1, 1);
      break;
    }
  }
}

function recordFailure(runtime, attempt) {
  runtime.strategyRepertoire.recordOutcome(attempt.strategy, false);
  runtime.metrics.totalFailed++;
}

module.exports = { allocate, explore, verify, generateLeanSource };