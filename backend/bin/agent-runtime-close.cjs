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

async function handleRuntimeClose(ctx) {
  const {
    code, signal, budgetStopped, emit, cleanup, requiredTools, observedTools,
    db, hasAgentInDb, agentConscience, conscienceState, pendingConscienceOp,
    mission, finalReportText, agentName, nameMeaning, autonomyPlan, isWorker,
    exactTokens, estimatedTokens, eventCount, observedCostUsd, strategyContract,
    orchestratorAgentId, recordedTurns, stderr
  } = ctx;

  if (budgetStopped) {
    emit({ eventType: 'AGENT_HALTED', action: 'BUDGET_GUARD', detail: 'Runtime stopped at the active execution budget boundary.', severity: 'warning', status: 'blocked', currentTask: 'Budget exhausted', payload: { code, signal, budget: budgetStopped } });
    process.exitCode = 1;
    cleanup();
    process.exit(1);
  }
  const missingTools = [...requiredTools].filter((tool) => !observedTools.has(tool));
  if (db && hasAgentInDb) {
    if (code === 0 && !missingTools.length) {
      agentConscience.triggerEureka(conscienceState);
    }
    try {
      await pendingConscienceOp;
      await agentConscience.persistConscienceState(db, mission.agentId, conscienceState, { reason: code === 0 ? 'mission_completed' : 'mission_failed' });
    } catch (_) {}
  } else if (code === 0 && missingTools.length) {
    emit({ eventType: 'HARD_INVARIANT_FAILURE', action: 'ORCHESTRATION_POLICY', detail: `Required GenOS orchestration tools were not observed: ${missingTools.join(', ')}.`, severity: 'error', status: 'error', payload: { missingTools, observedTools: [...observedTools] } });
    process.exitCode = 1;
  } else if (code === 0) {
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
    const expectedDossiers = autonomyPlan.synthesisOnly ? (autonomyPlan.completedWorkerIds || []) : [];
    const entries = (Array.isArray(report.dossierInfluence) ? report.dossierInfluence : [])
      .filter((entry) => entry && typeof entry.workerId === 'string');
    const influences = new Map(entries.map((entry) => [entry.workerId, entry]));
    const expectedSet = new Set(expectedDossiers);
    const uninfluential = expectedDossiers.filter((workerId) => {
      const entry = influences.get(workerId);
      return !entry
        || typeof entry.influence !== 'string'
        || entry.influence.trim().length < 3
        || /^[.\-_ /\\#*]+$/.test(entry.influence.trim())
        || !Array.isArray(entry.usedClaims)
        || entry.usedClaims.some((claim) => typeof claim !== 'string' || !claim.trim());
    });
    const unexpected = entries.filter((entry) => !expectedSet.has(entry.workerId)).map((entry) => entry.workerId);
    if (uninfluential.length || unexpected.length) {
      const reasons = [];
      if (uninfluential.length) reasons.push(`missing or invalid influence for: ${uninfluential.join(', ')}`);
      if (unexpected.length) reasons.push(`unexpected worker dossiers: ${unexpected.join(', ')}`);
      emit({ eventType: 'HARD_INVARIANT_FAILURE', action: 'DOSSIER_INFLUENCE', detail: `Final synthesis did not account for every worker dossier: ${reasons.join('; ')}.`, severity: 'error', status: 'error', payload: { expectedDossiers, uninfluential, unexpected } });
      process.exitCode = 1;
      cleanup();
      return;
    }
    if (expectedDossiers.length) {
      emit({ eventType: 'DOSSIER_INFLUENCE_VERIFIED', action: 'VERIFY_SYNTHESIS', detail: `Verified explicit influence records for all ${expectedDossiers.length} worker dossiers.`, payload: { workerIds: expectedDossiers } });
    }

    const allClaims = Array.isArray(report.claims) ? report.claims : [];
    const unprovenClaims = allClaims.filter((c) => !c || !evidencePresent(c.evidence || c.receipts || c.sourceRefs));
    const explicitUnverified = Array.isArray(report.unverifiedClaims) ? report.unverifiedClaims : [];
    let evidenceBlocker = null;
    if (unprovenClaims.length > 0 || explicitUnverified.length > 0) {
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
            evidenceBlocker = 'Evidence discordance detected: ' + incidents.map((incident) => incident.detail).join('; ');
          }
        }
      } catch (_) {}

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

    emit({ eventType: 'EVIDENCE_REPORT', action: 'VERIFY_CLAIMS', detail: 'Validated the agent final evidence report.', payload: report });
    const classified = workerRecovery.classifyFinalReport(report, isWorker);
    if (classified.outcome === 'no_answer') {
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
          turns: recordedTurns.length ? recordedTurns : [...observedTools].map(t => ({ action: t, pass: true, detail: 'no_answer_proof' })),
          usage: { tokens: exactTokens || estimatedTokens, events: eventCount, cost_usd: observedCostUsd },
          status: 'approved'
        });
      } catch (_) {}
    } else if (classified.outcome === 'failed') {
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
        const failureSummary = classified.failure?.reason || report?.claims?.map(c => c.statement).join('\n') || finalReportText || 'Worker task execution failed';
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
          turns: recordedTurns.length ? recordedTurns : [...observedTools].map(t => ({ action: t, pass: false, error: 'failed' })),
          status: 'rejected'
        });
      } catch (_) {}
    } else {
      let conclusionProvenance = null;
      try {
        const { recordProvenance } = require('../src/services/evaluationObservabilityService.js');
        conclusionProvenance = await recordProvenance('conclusion', mission.agentId, {
          agentId: mission.agentId,
          agentName,
          task: mission.prompt,
          claims: report?.claims || [],
          tests: report?.tests || [],
          uncertainties: report?.uncertainties || [],
          dossierInfluence: report?.dossierInfluence || [],
          outcome: report?.outcome || 'success'
        }, null, { organizationId: mission.organizationId, projectId: mission.projectId });
      } catch (_) {}

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
            recordedTurns: recordedTurns.length ? recordedTurns : [...observedTools].map(t => ({ action: t, pass: true })),
            conclusionProvenance,
            evidenceBlocker
          }
        });
      } else {
        try {
          await strategyAdapter.executePipelineWithFeedback(
            ['stdp_update', 'cherry_pick_golden_path'],
            { agentId: mission.agentId, orchestratorId: orchestratorAgentId, workspaceId: mission.workspaceId || 'ws-genos-core', task: mission.prompt, report, turns: recordedTurns.length ? recordedTurns : [...observedTools].map(t => ({ action: t, pass: true })), sourceId: mission.agentId, targetId: orchestratorAgentId }
          );
          await agentMemory.compileExecutionMemory(
            agentName,
            mission.prompt,
            report?.claims?.map(c => c.statement).join('\n') || finalReportText,
            {
              outcome: report?.outcome || 'success',
              organizationId: mission.organizationId,
              projectId: mission.projectId,
              claims: report?.claims || [],
              provenanceHash: conclusionProvenance?.payloadHash,
              provenanceId: conclusionProvenance?.id
            }
          );
        } catch (_) {}
      }
    }
  } else {
    emit({ eventType: 'AGENT_FAILED', action: 'ERROR', detail: `Codex runtime exited with code ${code ?? 'unknown'}${stderr.trim() ? `: ${stderr.trim()}` : '.'}`, severity: 'error', status: 'error', payload: { code, signal, stderr: stderr.trim() } });
    try {
      await agentMemory.compileExecutionMemory(
        agentName,
        mission.prompt,
        `Runtime failed with code ${code}: ${stderr.trim() || 'Process terminated with failure'}`,
        { isFailure: true, outcome: 'failed', organizationId: mission.organizationId, projectId: mission.projectId }
      );
      const dbase = await getDatabase();
      await trajectoryService.recordMissionTrajectory(dbase, {
        agentId: mission.agentId,
        workspaceId: mission.workspaceId || 'ws-genos-core',
        task: mission.prompt,
        report: { outcome: 'failed', reason: stderr.trim() },
        turns: recordedTurns.length ? recordedTurns : [...observedTools].map(t => ({ action: t, pass: false, error: stderr.trim() || 'runtime_error' })),
        status: 'rejected'
      });
    } catch (_) {}
  }
  if (process.exitCode === undefined) process.exitCode = code || 0;
  try { await pendingConscienceOp; } catch (_) {}
  cleanup();
  process.exit(process.exitCode || 0);
}

module.exports = { handleRuntimeClose };
