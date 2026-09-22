'use strict';

/**
 * @file mathematicalOrganismExplore.js
 * @description Explore and verify phases for MathematicalOrganismRuntime
 */

const crypto = require('node:crypto');
const { createFormalResult } = require('../formalResultService');
const { createProofArtifact } = require('./proofArtifact');
const { createFormalizationArtifact } = require('./formalizationArtifact');

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
    const formalization = createFormalizationArtifact({
      naturalStatement: attempt.goal,
      formalStatement: attempt.goal,
    });
    artifact.attachFormalResult(formalResult, formalization);

    const leanSource = formalization.generateLeanSource({ proofBody: '  simp' });
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
  // Generate Lean source that states the actual goal using a proof term.
  // The Lean kernel must compile this exact theorem with a proof.
  // The statement must match the canonicalStatement for verification to pass.
  // A real autoformalizer would convert the goal to proper Lean syntax with a valid proof.
  const goal = attempt.goal || 'unspecified_goal';
  // NOTE: We preserve the original goal statement including colons (e.g., ∀ n : Nat).
  // The statementFingerprint check in verifyThroughLean ensures the proven statement
  // matches the canonicalStatement. Stripping colons would break the fingerprint invariant.
  const safeGoal = goal.replace(/\"/g, '\\"').substring(0, 200);
  // Structure: theorem name : statement := by proof term
  // The proof term 'norm_num' works for simple arithmetic goals;
  // for general goals, a real autoformalizer would provide the proof.
  return `theorem attempt : "${safeGoal}" := by norm_num`;
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

module.exports = { allocate, explore, verify };