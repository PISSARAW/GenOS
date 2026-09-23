'use strict';

/**
 * verifierAdapters.js
 *
 * Adapters pour l'exécution réelle des vérificateurs spécialisés.
 * Chaque adapter implémente un type de vérification concret
 * et produit des observations réelles, pas des stubs.
 *
 * Types supportés :
 *   test        — exécution d'un test unitaire/integration
 *   coverage   — mesure de couverture de code/claims
 *   behavior   — recherche de comportement non couvert
 *   artifact   — construction/validation d'un artefact reproductible
 */

const crypto = require('node:crypto');
const { runIsolated } = require('../sandboxExecutor');

/* ============================================================
   Utilitaires communs
   ============================================================ */

function nowIso() {
  return new Date().toISOString();
}

function observationRecord(step, detail) {
  return {
    step,
    result: detail?.outcome || 'executed',
    detail: detail || null,
    timestamp: nowIso(),
  };
}

function computeEvidenceDigest(observations) {
  const canonical = JSON.stringify(
    observations.map((o) => [o.step, o.result, o.detail ? JSON.stringify(o.detail) : '']).sort()
  );
  return `sha256:${crypto.createHash('sha256').update(canonical).digest('hex')}`;
}

function resolveSandboxTarget(config, verifier, context) {
  return {
    command: config.command || config.buildCommand,
    cwd: config.cwd || verifier.cwd || context?.cwd || process.cwd(),
    timeout: context?.timeoutMs || config.timeoutMs || 30000,
  };
}

function truncateOutput(text) {
  const s = String(text || '');
  return s.length > 2000 ? s.slice(0, 2000) : s;
}

function executionDetail(command, execution) {
  return {
    command,
    commandHash: execution.commandHash,
    exitCode: execution.exitCode,
    success: execution.success,
    timedOut: execution.timedOut,
    durationMs: execution.durationMs,
    stdout: truncateOutput(execution.stdout),
    stderr: truncateOutput(execution.stderr),
    outcome: execution.success ? 'executed' : 'failed',
  };
}

function rejectionDetail(command, err) {
  return {
    command,
    outcome: 'rejected',
    note: err.message,
  };
}

/* ============================================================
   Adapter : test
   Exécute réellement la commande via sandboxExecutor.
   verified dépend de l'exécution, jamais de la présence de command.
   ============================================================ */

function noTestSpecified() {
  const observations = [observationRecord('test:execute', {
    outcome: 'no_test_specified',
    note: 'Aucun test configuré pour ce verifier',
  })];
  return { observations, counterexamples: [], status: 'inconclusive' };
}

function collectTestCounterexamples(execution, testConfig) {
  const counterexamples = [];
  if (!execution.success) {
    counterexamples.push({
      type: 'test_failure',
      description: `Test command failed with exit ${execution.exitCode}`,
      timestamp: nowIso(),
    });
    return counterexamples;
  }
  // Vérification de la sortie attendue (expectOutput).
  if (testConfig.expectOutput !== undefined) {
    const actual = (execution.stdout || '').trim();
    const expected = String(testConfig.expectOutput).trim();
    if (actual !== expected) {
      counterexamples.push({
        type: 'output_mismatch',
        description: `Expected output '${expected}', got '${actual}'`,
        expected,
        actual,
        timestamp: nowIso(),
      });
      return counterexamples;
    }
  }
  if (testConfig.expectFailure && testConfig.failureCondition) {
    counterexamples.push({
      type: 'counterexample',
      description: testConfig.failureDescription || 'Test revealed a failure condition',
      timestamp: nowIso(),
    });
  }
  return counterexamples;
}

async function executeConfiguredTest(target, testConfig) {
  const observations = [];
  try {
    const execution = await runIsolated({
      command: target.command,
      cwd: target.cwd,
      timeoutMs: target.timeout,
    });
    observations.push(observationRecord('test:execute', executionDetail(target.command, execution)));
    const counterexamples = collectTestCounterexamples(execution, testConfig);
    const status = counterexamples.length > 0 ? 'refuted' : 'verified';
    return { observations, counterexamples, status };
  } catch (err) {
    observations.push(observationRecord('test:execute', rejectionDetail(target.command, err)));
    return { observations, counterexamples: [], status: 'inconclusive', reason: err.message };
  }
}

async function runTestAdapter(antigen, verifier, context) {
  const testConfig = verifier.test || context?.testConfig || null;
  if (!testConfig?.command) return noTestSpecified();
  const target = resolveSandboxTarget(testConfig, verifier, context || {});
  return executeConfiguredTest(target, testConfig);
}

/* ============================================================
   Adapter : coverage
   Mesure la couverture du claim par rapport aux preuves disponibles.
   ============================================================ */

function safeNormalizedEvidence(antigen) {
  const raw = antigen?.epitopes?.evidence;
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  return [raw];
}

function safeClaimText(antigen) {
  const claim = antigen?.claim;
  if (!claim) return '';
  if (typeof claim === 'string') return claim;
  if (typeof claim === 'object' && claim.text) return claim.text;
  return '';
}

function runCoverageAdapter(antigen, verifier, context) {
  const observations = [];
  const counterexamples = [];
  const evidence = safeNormalizedEvidence(antigen);
  const assumptions = antigen.epitopes?.assumptions || [];
  const coverageTarget = verifier.coverageTarget || context?.coverageTarget || 0.85;

  observations.push(
    observationRecord('coverage:measure', {
      evidenceCount: evidence.length,
      assumptionCount: assumptions.length,
      coverageRatio: evidence.length > 0 ? Math.min(1, evidence.length / Math.max(1, assumptions.length)) : 0,
      target: coverageTarget,
    })
  );

  const ratio = evidence.length > 0 ? Math.min(1, evidence.length / Math.max(1, assumptions.length)) : 0;
  if (ratio < coverageTarget) {
    counterexamples.push({
      type: 'insufficient_coverage',
      description: `Couverture ${ratio.toFixed(2)} < cible ${coverageTarget}`,
      timestamp: nowIso(),
    });
  }

  const status = counterexamples.length > 0 ? 'refuted' : (evidence.length > 0 ? 'verified' : 'inconclusive');
  return { observations, counterexamples, status };
}

/* ============================================================
   Adapter : behavior
   Recherche un comportement non couvert par les preuves existantes.
   ============================================================ */

function runBehaviorAdapter(antigen, verifier, context) {
  const observations = [];
  const counterexamples = [];
  const claim = safeClaimText(antigen) || '(sans claim)';
  const evidence = safeNormalizedEvidence(antigen);

  observations.push(
    observationRecord('behavior:search', {
      claim: claim.slice(0, 120),
      evidenceAnalyzed: evidence.length,
      searchScope: verifier.searchScope || 'local',
    })
  );

  detectWeakCounterexample(antigen, context, counterexamples);
  runCustomCounterexampleProposal(verifier, { antigen, context }, counterexamples);

  // « Absence de réfutation ≠ preuve ». Ne jamais retourner 'verified'
  // depuis un behavior adapter : il n'a ni oracle, ni source exécutée,
  // ni outil externe. 'verified' doit venir d'un adapter qui a réellement
  // exécuté quelque chose (test, artifact build, source lookup).
  const status = counterexamples.length > 0 ? 'refuted' : 'inconclusive';
  return { observations, counterexamples, status };
}

function detectWeakCounterexample(antigen, context, counterexamples) {
  const originalType = context?.originalVerifierType;
  if (originalType !== 'counterexample') return;
  const evidence = antigen.epitopes?.evidence || [];
  const weakEvidence = !evidence?.digest && evidence?.kind !== 'proof';
  if (!weakEvidence) return;
  counterexamples.push({
    type: 'counterexample',
    description: 'Antigène sans preuve forte : comportement non couvert possible',
    timestamp: nowIso(),
  });
}

function runCustomCounterexampleProposal(verifier, antigenContext, counterexamples) {
  if (typeof verifier.proposeCounterexample !== 'function') return;
  const result = verifier.proposeCounterexample(antigenContext.antigen, antigenContext.context);
  if (!result || !result.found) return;
  counterexamples.push({
    type: 'behavior_counterexample',
    description: result.description || 'Comportement non couvert détecté',
    detail: result.detail || null,
    timestamp: nowIso(),
  });
}

/* ============================================================
   Adapter : artifact
   Construit et valide un artefact reproductible.
   ============================================================ */

async function executeConfiguredBuild(target, artifactConfig, observations) {
  try {
    const execution = await runIsolated({
      command: target.command,
      cwd: target.cwd,
      timeoutMs: target.timeout,
    });
    observations.push(observationRecord('artifact:build', executionDetail(target.command, execution)));
    observations.push(
      observationRecord('artifact:validate', {
        validation: artifactConfig.validation || 'structural',
        outcome: execution.success ? 'valid' : 'invalid',
      })
    );
    return execution;
  } catch (err) {
    observations.push(observationRecord('artifact:build', rejectionDetail(target.command, err)));
    return null;
  }
}

async function runArtifactAdapter(antigen, verifier, context) {
  const observations = [];
  const counterexamples = [];
  const artifactConfig = verifier.artifact || context?.artifactConfig || null;

  observations.push(observationRecord('artifact:prepare', { artifactType: artifactConfig?.type || 'unknown' }));

  if (!artifactConfig?.buildCommand) {
    observations.push(
      observationRecord('artifact:validate', {
        outcome: 'no_artifact_specified',
        note: 'Aucun artefact configuré pour ce verifier',
      })
    );
    return { observations, counterexamples, status: 'inconclusive' };
  }

  const target = resolveSandboxTarget(artifactConfig, verifier, context || {});
  const execution = await executeConfiguredBuild(target, artifactConfig, observations);
  if (!execution) return { observations, counterexamples, status: 'inconclusive' };
  if (!execution.success) {
    counterexamples.push({
      type: 'artifact_build_failure',
      description: `Build command failed with exit ${execution.exitCode}`,
      timestamp: nowIso(),
    });
    return { observations, counterexamples, status: 'refuted' };
  }

  return { observations, counterexamples, status: 'verified' };
}

/* ============================================================
   Dispatch vers l'adapter approprié
   ============================================================ */

const ADAPTER_MAP = {
  test: runTestAdapter,
  coverage: runCoverageAdapter,
  behavior: runBehaviorAdapter,
  artifact: runArtifactAdapter,
};

const ADAPTER_ALIASES = {
  testResult: 'test',
  replay: 'test',
  counterexample: 'behavior',
  source: 'behavior',
  proof: 'artifact',
  repro: 'artifact',
  benchmark: 'artifact',
};

function selectAdapter(verifierType) {
  if (ADAPTER_MAP[verifierType]) return ADAPTER_MAP[verifierType];
  const aliased = ADAPTER_ALIASES[verifierType];
  return (aliased && ADAPTER_MAP[aliased]) || null;
}

async function executeVerifierWithAdapter(antigen, verifier, context) {
  if (!antigen || !verifier) {
    return {
      status: 'inconclusive',
      reason: 'antigen or verifier missing',
      observations: [],
      counterexamples: [],
    };
  }

  const adapter = selectAdapter(verifier.type);
  if (!adapter) {
    return {
      status: 'inconclusive',
      reason: `No adapter for verifier type '${verifier.type}'`,
      observations: [],
      counterexamples: [],
    };
  }

  // Conserve le type original pour les vérifications contextuelles des adapters
  const ctx = {
    ...context,
    originalVerifierType: context?.originalVerifierType || verifier.type,
  };

  try {
    return await adapter(antigen, verifier, ctx);
  } catch (err) {
    return {
      status: 'error',
      reason: err.message,
      observations: [],
      counterexamples: [],
    };
  }
}

module.exports = {
  runTestAdapter,
  runCoverageAdapter,
  runBehaviorAdapter,
  runArtifactAdapter,
  detectWeakCounterexample,
  runCustomCounterexampleProposal,
  selectAdapter,
  executeVerifierWithAdapter,
  computeEvidenceDigest,
  observationRecord,
};
