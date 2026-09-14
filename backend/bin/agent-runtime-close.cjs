/**
 * Handler for child process close in genos-agent-runtime.
 */
const immune = require('../src/services/immuneSystem');
const workerRecovery = require('../src/services/workerFailureRecoveryService');
const agentMemory = require('../src/services/agentMemoryContext');
const trajectoryService = require('../src/services/trajectoryService');
const strategyAdapter = require('../src/services/strategyExecutionAdapter');
const { getDatabase } = require('../src/db');
const { evidencePresent } = require('../src/services/hallucinationMonitoringService');

function formatFallbackTurns(recordedTurns, observedTools, options = {}) {
  if (recordedTurns && recordedTurns.length) return recordedTurns;
  const { pass = true, ...extra } = options;
  return [...observedTools].map((t) => ({ action: t, pass, isSynthetic: true, fallback: 'observed_tools', ...extra }));
}

function applyDefaultExitCode(code, signal) {
  if (process.exitCode === undefined) {
    process.exitCode = (code !== null && code !== undefined) ? code : (signal ? 1 : 0);
  }
}

async function settlePendingConscience(pendingConscienceOp) {
  try { await pendingConscienceOp; } catch (_) {}
}

async function handleRuntimeClose(ctx) {
  const {
    code, signal, budgetStopped, cleanup, requiredTools, observedTools,
    db, hasAgentInDb, pendingConscienceOp
  } = ctx;

  if (budgetStopped) {
    return handleBudgetStop(ctx, budgetStopped);
  }
  const missingTools = [...requiredTools].filter((tool) => !observedTools.has(tool));
  if (db && hasAgentInDb) {
    await persistConscience(ctx, code, missingTools);
  } else if (code === 0 && missingTools.length) {
    handleMissingTools(ctx, missingTools);
  } else if (code === 0) {
    if (!(await handleSuccessfulReport(ctx))) { cleanup(); return; }
  } else {
    await handleRuntimeFailure(ctx);
  }
  applyDefaultExitCode(code, signal);
  await settlePendingConscience(pendingConscienceOp);
  cleanup();
  process.exit(process.exitCode);
}

function handleBudgetStop(ctx, budgetStopped) {
  const { code, signal, emit, cleanup } = ctx;
  emit({ eventType: 'AGENT_HALTED', action: 'BUDGET_GUARD', detail: 'Runtime stopped at the active execution budget boundary.', severity: 'warning', status: 'blocked', currentTask: 'Budget exhausted', payload: { code, signal, budget: budgetStopped } });
  process.exitCode = 1;
  cleanup();
  process.exit(1);
}

async function persistConscience(ctx, code, missingTools) {
  const { db, agentConscience, conscienceState, pendingConscienceOp, mission } = ctx;
  if (code === 0 && !missingTools.length) {
    agentConscience.triggerEureka(conscienceState);
  }
  try {
    await pendingConscienceOp;
    await agentConscience.persistConscienceState(db, mission.agentId, conscienceState, { reason: code === 0 ? 'mission_completed' : 'mission_failed' });
  } catch (_) {}
}

function handleMissingTools(ctx, missingTools) {
  const { emit, observedTools } = ctx;
  emit({ eventType: 'HARD_INVARIANT_FAILURE', action: 'ORCHESTRATION_POLICY', detail: `Required GenOS orchestration tools were not observed: ${missingTools.join(', ')}.`, severity: 'error', status: 'error', payload: { missingTools, observedTools: [...observedTools] } });
  process.exitCode = 1;
}

async function handleSuccessfulReport(ctx) {
  const { finalReportText, agentName, nameMeaning, mission, emit, isWorker } = ctx;
  const phagocytosis = immune.phagocytoseCodexReport(finalReportText, { agentName, nameMeaning, role: mission.role });
  let report;
  if (phagocytosis.ok) {
    report = phagocytosis.report;
    if (phagocytosis.repaired) {
      emit({ eventType: 'CHAPERONE_REPAIR_SUCCESS', action: 'HOMEOSTASIS', detail: 'La protéine Chaperon a réparé la syntaxe JSON altérée de Codex.', payload: { heuristic: !!phagocytosis.heuristic } });
    }
  } else {
    report = phagocytosis.fallbackReport;
    emit({ eventType: 'CELLULAR_APOPTOSIS', action: 'APOPTOSIS', detail: 'Échec irrécupérable du formatage de Codex. Apoptose et signal de douleur déclenchés.', severity: 'error', status: 'error', payload: { error: phagocytosis.error, painSignal: phagocytosis.painSignal } });
  }
  report.author = report.author || { name: agentName, meaning: nameMeaning, role: mission.role };
  if (typeof report.artifactText === 'string') report.artifactText = immune.chaperoneAgentOutput(report.artifactText, { prompt: mission.prompt }).purifiedText;
  if (!(await validateDossierInfluence(ctx, report))) return false;
  const evidenceBlocker = await emitUnverifiedClaims(ctx, report);
  emit({ eventType: 'EVIDENCE_REPORT', action: 'VERIFY_CLAIMS', detail: 'Validated the agent final evidence report.', payload: report });
  const classified = workerRecovery.classifyFinalReport(report, isWorker);
  if (classified.outcome === 'no_answer') {
    await handleNoAnswer(ctx, report, classified);
  } else if (classified.outcome === 'failed') {
    await handleFailedClassification(ctx, report, classified);
  } else {
    await handleCompleted(ctx, report, evidenceBlocker);
  }
  return true;
}

function hasValidInfluence(entry) {
  return !!entry
    && typeof entry.influence === 'string'
    && entry.influence.trim().length >= 3
    && !/^[.\-_ /\\#*]+$/.test(entry.influence.trim())
    && Array.isArray(entry.usedClaims)
    && !entry.usedClaims.some((claim) => typeof claim !== 'string' || !claim.trim());
}

function isValidDossierEntry(entry) {
  return !!(entry && typeof entry.workerId === 'string');
}

async function validateDossierInfluence(ctx, report) {
  const { autonomyPlan, emit } = ctx;
  const expectedDossiers = autonomyPlan.synthesisOnly ? (autonomyPlan.completedWorkerIds || []) : [];
  const entries = (Array.isArray(report.dossierInfluence) ? report.dossierInfluence : []).filter(isValidDossierEntry);
  const influences = new Map(entries.map((entry) => [entry.workerId, entry]));
  const expectedSet = new Set(expectedDossiers);
  const uninfluential = expectedDossiers.filter((workerId) => !hasValidInfluence(influences.get(workerId)));
  const unexpected = entries.filter((entry) => !expectedSet.has(entry.workerId)).map((entry) => entry.workerId);
  if (uninfluential.length || unexpected.length) {
    const reasons = [];
    if (uninfluential.length) reasons.push(`missing or invalid influence for: ${uninfluential.join(', ')}`);
    if (unexpected.length) reasons.push(`unexpected worker dossiers: ${unexpected.join(', ')}`);
    emit({ eventType: 'HARD_INVARIANT_FAILURE', action: 'DOSSIER_INFLUENCE', detail: `Final synthesis did not account for every worker dossier: ${reasons.join('; ')}.`, severity: 'error', status: 'error', payload: { expectedDossiers, uninfluential, unexpected } });
    process.exitCode = 1;
    return false;
  }
  if (expectedDossiers.length) {
    emit({ eventType: 'DOSSIER_INFLUENCE_VERIFIED', action: 'VERIFY_SYNTHESIS', detail: `Verified explicit influence records for all ${expectedDossiers.length} worker dossiers.`, payload: { workerIds: expectedDossiers } });
  }
  return true;
}

function isEvidenceMissing(claim) {
  return !claim || !evidencePresent(claim.evidence || claim.receipts || claim.sourceRefs);
}

function collectClaimAudit(report) {
  const allClaims = Array.isArray(report.claims) ? report.claims : [];
  return {
    unprovenClaims: allClaims.filter(isEvidenceMissing),
    explicitUnverified: Array.isArray(report.unverifiedClaims) ? report.unverifiedClaims : []
  };
}

async function findEvidenceBlocker(mission) {
  const dbase = await getDatabase();
  try {
    const run = await dbase.get('SELECT id, created_at FROM strategy_execution_runs WHERE agent_id = ? ORDER BY created_at DESC LIMIT 1', mission.agentId);
    if (run) {
      const incidents = await dbase.all(`
            SELECT detail FROM telemetry_events
            WHERE agent_id = ? AND event_type IN ('HALLUCINATION_DETECTED', 'DOSSIER_INFLUENCE_INVALID')
              AND created_at >= ?
          `, mission.agentId, run.created_at);
      if (incidents.length > 0) {
        return 'Evidence discordance detected: ' + incidents.map((incident) => incident.detail).join('; ');
      }
    }
  } catch (_) {}
  return null;
}

async function emitUnverifiedClaims(ctx, report) {
  const { mission, emit } = ctx;
  const { unprovenClaims, explicitUnverified } = collectClaimAudit(report);
  let evidenceBlocker = null;
  if (unprovenClaims.length > 0 || explicitUnverified.length > 0) {
    evidenceBlocker = await findEvidenceBlocker(mission);
    emit({
      eventType: 'UNVERIFIED_CLAIM',
      action: 'EVIDENCE_AUDIT',
      detail: `Agent report contains ${unprovenClaims.length} unproven claim(s) and ${explicitUnverified.length} declared unverified claim(s).`,
      severity: 'warning',
      payload: {
        unprovenClaims: unprovenClaims.map((c) => c?.statement || 'unnamed claim'),
        unverifiedClaims: explicitUnverified
      }
    });
  }
  return evidenceBlocker;
}

async function handleNoAnswer(ctx, report, classified) {
  const { code, observedTools, exactTokens, estimatedTokens, eventCount, observedCostUsd, conscienceState, isWorker, emit, finalReportText, agentName, mission, recordedTurns } = ctx;
  emit({
    eventType: isWorker ? 'WORKER_NO_ANSWER_PROVEN' : 'MISSION_NO_ANSWER_PROVEN',
    action: 'REPORT_NO_ANSWER',
    detail: isWorker
      ? 'Worker returned an evidence-backed proof that no answer exists in the stated scope.'
      : 'Orchestrator returned an evidence-backed proof that no answer exists in the stated scope.',
    status: 'completed',
    payload: {
      code,
      observedTools: [...observedTools],
      evidenceReport: report,
      noAnswerProof: classified.noAnswerProof,
      usage: { tokens: exactTokens || estimatedTokens, events: eventCount, cost_usd: observedCostUsd },
      conscienceState
    }
  });
  try {
    const proofSummary = classified.noAnswerProof?.method
      ? `Preuve d'impossibilité (${classified.noAnswerProof.method}): ${Array.isArray(classified.noAnswerProof.evidence) ? classified.noAnswerProof.evidence.join('; ') : 'validée'}`
      : (finalReportText || 'Aucune réponse n\'existe dans le périmètre spécifié.');
    await agentMemory.compileExecutionMemory(
      agentName,
      mission.prompt,
      proofSummary,
      { outcome: 'no_answer', isFailure: false, organizationId: mission.organizationId, projectId: mission.projectId }
    );
    const dbase = await getDatabase();
    await trajectoryService.recordMissionTrajectory(dbase, {
      agentId: mission.agentId,
      workspaceId: mission.workspaceId || 'ws-genos-core',
      task: mission.prompt,
      report,
      turns: formatFallbackTurns(recordedTurns, observedTools, { pass: true, detail: 'no_answer_proof' }),
      usage: { tokens: exactTokens || estimatedTokens, events: eventCount, cost_usd: observedCostUsd },
      status: 'approved'
    });
  } catch (_) {}
}

function buildFailureSummary(report, classified, finalReportText) {
  return classified.failure?.reason || report?.claims?.map(c => c.statement).join('\n') || finalReportText || 'Worker task execution failed';
}

async function handleFailedClassification(ctx, report, classified) {
  const { code, observedTools, isWorker, emit, finalReportText, agentName, mission, recordedTurns } = ctx;
  emit({
    eventType: isWorker ? 'WORKER_TASK_FAILED' : 'AGENT_FAILED',
    action: 'REPORT_FAILURE',
    detail: classified.failure.reason || (isWorker ? 'Worker did not complete the assigned task.' : 'Orchestrator did not complete the assigned mission.'),
    severity: 'warning',
    status: 'error',
    currentTask: isWorker ? 'Task failed; awaiting orchestrator decision' : 'Mission failed',
    payload: { code, observedTools: [...observedTools], evidenceReport: report, failure: classified.failure, noAnswerProof: null }
  });
  try {
    const failureSummary = buildFailureSummary(report, classified, finalReportText);
    await agentMemory.compileExecutionMemory(
      agentName,
      mission.prompt,
      failureSummary,
      { isFailure: true, outcome: 'failed', organizationId: mission.organizationId, projectId: mission.projectId }
    );
    const dbase = await getDatabase();
    await trajectoryService.recordMissionTrajectory(dbase, {
      agentId: mission.agentId,
      workspaceId: mission.workspaceId || 'ws-genos-core',
      task: mission.prompt,
      report,
      turns: formatFallbackTurns(recordedTurns, observedTools, { pass: false, error: 'failed' }),
      status: 'rejected'
    });
  } catch (_) {}
}

async function recordConclusionProvenance(ctx, report) {
  const { mission, agentName } = ctx;
  const src = report || {};
  try {
    const { recordProvenance } = require('../src/services/evaluationObservabilityService.js');
    return await recordProvenance('conclusion', mission.agentId, {
      agentId: mission.agentId,
      agentName,
      task: mission.prompt,
      claims: src.claims || [],
      tests: src.tests || [],
      uncertainties: src.uncertainties || [],
      dossierInfluence: src.dossierInfluence || [],
      outcome: src.outcome || 'success'
    }, null, { organizationId: mission.organizationId, projectId: mission.projectId });
  } catch (_) {
    return null;
  }
}

async function handleCompleted(ctx, report, evidenceBlocker) {
  const {
    strategyContract, emit, mission, recordedTurns, observedTools, code,
    exactTokens, estimatedTokens, eventCount, observedCostUsd, conscienceState
  } = ctx;
  const conclusionProvenance = await recordConclusionProvenance(ctx, report);
  emit({
    eventType: 'AGENT_COMPLETED',
    action: 'COMPLETE',
    detail: 'Codex implementation runtime completed.',
    status: 'completed',
    currentTask: 'Execution completed',
    payload: {
      code,
      observedTools: [...observedTools],
      evidenceReport: report,
      usage: { tokens: exactTokens || estimatedTokens, events: eventCount, cost_usd: observedCostUsd },
      conscienceState,
      conclusionProvenance
    }
  });
  if (strategyContract.promotion?.require_human_approval === true || evidenceBlocker) {
    emit({
      eventType: 'AGENT_AWAITING_APPROVAL',
      action: 'PROMOTION_GATE',
      detail: evidenceBlocker || 'Human approval is required before strategy promotion.',
      status: 'blocked',
      currentTask: 'Awaiting human approval',
      payload: {
        evidenceReport: report,
        task: mission.prompt,
        workspaceId: mission.workspaceId || 'ws-genos-core',
        agentId: mission.agentId,
        recordedTurns: formatFallbackTurns(recordedTurns, observedTools),
        conclusionProvenance,
        evidenceBlocker
      }
    });
  } else {
    await handlePipelineSuccess(ctx, report, conclusionProvenance);
  }
}

async function handlePipelineSuccess(ctx, report, conclusionProvenance) {
  const { mission, agentName, recordedTurns, observedTools, orchestratorAgentId, finalReportText } = ctx;
  const src = report || {};
  const prov = conclusionProvenance || {};
  try {
    await strategyAdapter.executePipelineWithFeedback(
      ['stdp_update', 'cherry_pick_golden_path'],
      { agentId: mission.agentId, orchestratorId: orchestratorAgentId, workspaceId: mission.workspaceId || 'ws-genos-core', task: mission.prompt, report, turns: formatFallbackTurns(recordedTurns, observedTools), sourceId: mission.agentId, targetId: orchestratorAgentId }
    );
    await agentMemory.compileExecutionMemory(
      agentName,
      mission.prompt,
      src.claims?.map(c => c.statement).join('\n') || finalReportText,
      {
        outcome: src.outcome || 'success',
        organizationId: mission.organizationId,
        projectId: mission.projectId,
        claims: src.claims || [],
        provenanceHash: prov.payloadHash,
        provenanceId: prov.id
      }
    );
  } catch (_) {}
}

async function handleRuntimeFailure(ctx) {
  const { code, signal } = ctx;
  const errorExitCode = (code !== null && code !== undefined && code !== 0) ? code : (signal ? 128 : 1);
  process.exitCode = errorExitCode;
  emitRuntimeFailure(ctx);
  await recordRuntimeFailure(ctx);
}

function emitRuntimeFailure(ctx) {
  const { code, signal, stderr, emit } = ctx;
  emit({ eventType: 'AGENT_FAILED', action: 'ERROR', detail: `Codex runtime exited with code ${code ?? 'unknown'}${signal ? ` (signal ${signal})` : ''}${stderr.trim() ? `: ${stderr.trim()}` : '.'}`, severity: 'error', status: 'error', payload: { code, signal, stderr: stderr.trim() } });
}

async function recordRuntimeFailure(ctx) {
  const { agentName, mission, recordedTurns, observedTools, code, signal, stderr } = ctx;
  try {
    await agentMemory.compileExecutionMemory(
      agentName,
      mission.prompt,
      `Runtime failed with code ${code ?? signal ?? 'unknown'}: ${stderr.trim() || 'Process terminated with failure'}`,
      { isFailure: true, outcome: 'failed', organizationId: mission.organizationId, projectId: mission.projectId }
    );
    const dbase = await getDatabase();
    await trajectoryService.recordMissionTrajectory(dbase, {
      agentId: mission.agentId,
      workspaceId: mission.workspaceId || 'ws-genos-core',
      task: mission.prompt,
      report: { outcome: 'failed', reason: stderr.trim() || (signal ? `Killed by ${signal}` : `Exited with ${code}`) },
      turns: formatFallbackTurns(recordedTurns, observedTools, { pass: false, error: stderr.trim() || 'runtime_error' }),
      status: 'rejected'
    });
  } catch (_) {}
}

module.exports = { handleRuntimeClose };
