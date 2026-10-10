const crypto = require('crypto');
const runtimeCheckpoint = require('./localRuntimeCheckpoint');
const codexCheckpoint = require('./codexRuntimeCheckpoint');
const providerContinuity = require('./organismProviderContinuity');

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function resumeCheckpoint(state) {
  const row = state?._genosSnapshot?.persistedState?.sections?.runtime;
  return runtimeCheckpoint.resumable(row) || codexCheckpoint.parse(row);
}

function runtimeComponent(persisted, activePhase) {
  const row = persisted.sections.runtime;
  const resumable = runtimeCheckpoint.resumable(row) || codexCheckpoint.parse(row);
  const status = resumable ? 'captured-resumable-checkpoint'
    : row || persisted.sections.runtimeCursor ? 'captured-durable-state' : 'not-applicable';
  return { status, hash: digest({ state: row, cursor: persisted.sections.runtimeCursor }),
    activeCapture: Boolean(activePhase), pausedPhase: activePhase || null };
}

function codexComponent(row) {
  const checkpoint = codexCheckpoint.parse(row);
  return checkpoint
    ? { status: 'captured-encrypted-session', hash: checkpoint.hash }
    : { status: 'unsupported', reason: 'No completed and encrypted Codex CLI session is available.' };
}

function workspaceComponent(reference) {
  return reference
    ? { status: 'captured', snapshotId: reference.id, hash: reference.hash }
    : { status: 'not-applicable', reason: 'Agent has no workspace.' };
}

function modelComponents(turns) {
  const continuation = providerContinuity.references(turns);
  return {
    llmContext: { status: turns.some((turn) => turn.status === 'pending')
      ? 'pending-call' : 'captured-visible-context', hash: digest(turns) },
    providerHiddenContext: { status: 'unsupported', reason: 'The model provider exposes no hidden-context export contract.' },
    providerContinuity: continuation.length
      ? { status: 'captured-reference', hash: digest(continuation), count: continuation.length }
      : { status: 'not-applicable', reason: 'No provider continuation was captured.' }
  };
}

function build(input) {
  const { agentState, workspaceSnapshot, persisted, orchestrator, activePhase } = input;
  return {
    agentState: { status: 'captured', hash: digest(agentState) },
    workspace: workspaceComponent(workspaceSnapshot),
    runtime: runtimeComponent(persisted, activePhase),
    processMemory: { status: 'unsupported', reason: 'No process memory dump and restore adapter is integrated with the supervised runtime.' },
    globalOrganismRestore: { status: 'unsupported', reason: 'Workspace, SQLite, Rust and external effects have no shared atomic restore boundary.' },
    externalCodexRuntime: codexComponent(persisted.sections.runtime),
    ...modelComponents(persisted.sections.modelTurns),
    memoriesAndRelations: { status: 'captured', hash: persisted.hash },
    orchestrator: orchestrator.length
      ? { status: 'captured-reference', references: orchestrator }
      : { status: 'not-applicable', reason: 'No Rust biological mission is linked to this agent.' }
  };
}

function consistency(activePhase) {
  return activePhase
    ? `local-runtime-paused:${activePhase}; agent-stable; workspace-capture-verified; sqlite-transaction`
    : 'agent-stable; workspace-capture-verified; sqlite-transaction';
}

function restoreSummary(input) {
  const { state, resumable, workspaceRestore, references, safetySnapshotId } = input;
  return {
    workspaceRestored: Boolean(workspaceRestore),
    workspaceSnapshotId: state._genosSnapshot?.workspaceSnapshot?.id || null,
    runtimeRestartRequired: Boolean(resumable) || state._genosSnapshot?.schemaVersion >= 3 && state.status === 'running',
    runtimeResumeAvailable: Boolean(resumable),
    runtimeCheckpointId: resumable ? state._genosSnapshot.persistedState.sections.runtime.id : null,
    externalCodexResumeAvailable: Boolean(codexCheckpoint.parse(state._genosSnapshot?.persistedState?.sections?.runtime)),
    externalCodexRuntimeRestored: false,
    runtimeReplayCursorId: state._genosSnapshot?.persistedState?.sections?.runtimeCursor?.id || null,
    orchestratorResumeRequired: false,
    orchestratorCursorRestored: references.length > 0,
    processMemoryRestored: false,
    globalOrganismRestored: false,
    providerHiddenContextRestored: false,
    providerContinuityRestored: false,
    providerContinuationAvailable: providerContinuity.available(state._genosSnapshot?.persistedState?.sections?.modelTurns || []),
    safetySnapshotId
  };
}

module.exports = { build, consistency, resumeCheckpoint, restoreSummary };
