import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Check, FileCheck2, GitBranch, GitMerge, Play, RotateCcw, ShieldCheck, X } from 'lucide-react';
import { api } from '../api/client';

type Candidate = {
  name: string;
  mutation?: string;
  success: boolean;
  tests_passed?: number;
  exit_code: number;
  duration_ms: number;
};

type Evidence = {
  schema_version: number;
  generated_at: string;
  source: { command: string; fixture: string };
  baseline: { reproduced: boolean; snapshot_id?: string };
  candidates: Candidate[];
  selection: { winner: string; replay_verified: boolean; merge_decision: string };
  usage: { model_calls: number; input_tokens: number; output_tokens: number; cost_usd: number; reason?: string };
  runtime: { wall_ms: number; genos_operations: number };
  execution?: { mode: string; live: boolean; model_invoked: boolean; provider: string; os_sandbox: boolean };
  limits: string[];
};

type WorkspaceDiagnostics = {
  workspace: { id: string; name: string; path: string };
  files: Array<{ name: string; type: 'file' | 'directory' }>;
  testCommands: Array<{ id: string; label: string }>;
  git: { available: boolean; changedFiles: string[]; error: string | null };
};

type TestResult = {
  command: { id: string; label: string };
  exitCode: number | null;
  signal: string | null;
  durationMs: number;
  stdout: string;
  stderr: string;
};

const stages = [
  { label: 'Bug reproduced', icon: Play },
  { label: 'Snapshot captured', icon: ShieldCheck },
  { label: '3 mutations tested', icon: GitBranch },
  { label: 'Winner replayed', icon: RotateCcw },
  { label: 'Merge decision recorded', icon: GitMerge },
];

function isEvidence(value: any): value is Evidence {
  return Boolean(value?.source?.command && value?.source?.fixture && Array.isArray(value.candidates) && value.selection && value.usage && value.runtime && Array.isArray(value.limits));
}

export const SafeDebuggingDemo: React.FC<{ workspaceId?: string | null; workspaceName?: string }> = ({ workspaceId, workspaceName }) => {
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  const [diagnostics, setDiagnostics] = useState<WorkspaceDiagnostics | null>(null);
  const [diagnosticsError, setDiagnosticsError] = useState('');
  const [selectedCommand, setSelectedCommand] = useState('');
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [runningTest, setRunningTest] = useState(false);

  const loadProof = useCallback(async () => {
    const payload = await api.getSafeDebuggingProof() as { available: boolean; running: boolean; evidence: Evidence | null };
    setRunning(payload.running);
    if (!payload.available || !isEvidence(payload.evidence)) throw new Error('No backend proof is available yet. Run the proof to create one.');
    setEvidence(payload.evidence);
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadProof()
      .catch((cause: any) => { if (!cancelled) setError(cause?.message || 'Backend proof unavailable.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [loadProof]);

  const loadDiagnostics = useCallback(async () => {
    if (!workspaceId) {
      setDiagnostics(null);
      return;
    }
    const payload = await api.inspectSafeDebuggingWorkspace(workspaceId) as WorkspaceDiagnostics;
    setDiagnostics(payload);
    setSelectedCommand((current) => current && payload.testCommands.some((command) => command.id === current)
      ? current
      : payload.testCommands[0]?.id || '');
  }, [workspaceId]);

  useEffect(() => {
    loadDiagnostics().catch((cause: any) => setDiagnosticsError(cause?.message || 'Workspace diagnostics unavailable.'));
  }, [loadDiagnostics]);

  const runProof = async () => {
    setRunning(true); setError('');
    try {
      const payload = await api.runSafeDebuggingProof() as { evidence: Evidence };
      if (!isEvidence(payload.evidence)) throw new Error('Backend proof returned an invalid evidence schema.');
      setEvidence(payload.evidence);
    } catch (cause: any) {
      setError(cause?.message || 'Backend proof failed.');
    } finally { setRunning(false); }
  };

  const runWorkspaceTest = async () => {
    if (!workspaceId || !selectedCommand) return;
    setRunningTest(true);
    setDiagnosticsError('');
    try {
      setTestResult(await api.runSafeDebuggingWorkspaceTest(workspaceId, selectedCommand) as TestResult);
      await loadDiagnostics();
    } catch (cause: any) {
      setDiagnosticsError(cause?.message || 'Workspace test failed to run.');
    } finally {
      setRunningTest(false);
    }
  };

  const completed = evidence ? [
    evidence.baseline?.reproduced,
    Boolean(evidence.baseline?.snapshot_id),
    evidence.candidates.length === 3,
    evidence.selection.replay_verified,
    evidence.selection.merge_decision === 'approved',
  ] : [];
  const completedCount = completed.filter(Boolean).length;
  const modelTokens = evidence ? evidence.usage.input_tokens + evidence.usage.output_tokens : null;
  const execution = evidence?.execution;

  return (
    <section className="safe-demo" data-stage={completedCount}>
      <header className="safe-demo__header">
        <div>
          <div className="safe-demo__eyebrow"><span /> SAFE DEBUGGING WORKBENCH</div>
          <h1>Inspect a real workspace. Run its tests. Keep the evidence.</h1>
          <p>Workspace diagnostics and test runs are executed by the GenOS backend against the selected project. The deterministic fixture below remains a reference proof of the replay pipeline.</p>
        </div>
        <div className="safe-demo__command"><span>$</span><code>backend → GenOS CLI fixture</code><button type="button" onClick={runProof} disabled={running}>{running ? 'Running proof…' : 'Run real proof'}</button><small>Requires the backend execution permission; no model is invoked.</small></div>
      </header>

      <section className="safe-demo__workspace" aria-labelledby="workspace-diagnostics-title">
        <div className="safe-demo__workspace-head">
          <div><div className="safe-demo__eyebrow"><span /> LIVE WORKSPACE</div><h2 id="workspace-diagnostics-title">{workspaceName || diagnostics?.workspace.name || 'Select a workspace'}</h2><p>{diagnostics ? diagnostics.workspace.path : 'Choose a project from the Studio sidebar to inspect its files and available test command.'}</p></div>
          <button type="button" className="safe-demo__secondary" onClick={() => loadDiagnostics().catch((cause: any) => setDiagnosticsError(cause?.message || 'Workspace diagnostics unavailable.'))} disabled={!workspaceId}>Refresh diagnostics</button>
        </div>
        {diagnostics && <div className="safe-demo__workspace-grid">
          <div><strong>Repository state</strong><span>{diagnostics.git.available ? `${diagnostics.git.changedFiles.length} changed file${diagnostics.git.changedFiles.length === 1 ? '' : 's'}` : 'Git status unavailable'}</span><code>{diagnostics.git.changedFiles.slice(0, 5).join('\n') || 'Working tree clean'}</code></div>
          <div><strong>Available tests</strong>{diagnostics.testCommands.length ? <><select value={selectedCommand} onChange={(event) => setSelectedCommand(event.target.value)}>{diagnostics.testCommands.map((command) => <option key={command.id} value={command.id}>{command.label}</option>)}</select><button type="button" onClick={runWorkspaceTest} disabled={runningTest}>{runningTest ? 'Running test…' : 'Run selected test'}</button></> : <span>No supported test command was detected.</span>}</div>
          <div><strong>Workspace files</strong><span>{diagnostics.files.length} top-level entries</span><code>{diagnostics.files.slice(0, 8).map((file) => `${file.type === 'directory' ? '▸' : '·'} ${file.name}`).join('\n')}</code></div>
        </div>}
        {testResult && <div className={`safe-demo__test-result ${testResult.exitCode === 0 ? 'is-success' : 'is-failure'}`}><strong>{testResult.command.label} {testResult.exitCode === 0 ? 'passed' : 'failed'}</strong><span>exit {testResult.exitCode ?? '—'} · {(testResult.durationMs / 1000).toFixed(2)} s</span><pre>{testResult.stdout || testResult.stderr || 'No output returned.'}</pre></div>}
        {diagnosticsError && <div className="safe-demo__error"><AlertTriangle size={15} /> {diagnosticsError}</div>}
      </section>

      <div className="safe-demo__disclosure"><AlertTriangle size={16} /><div><strong>REFERENCE FIXTURE</strong><span>This backend-connected fixture proves the replay flow on a deterministic case. It does not modify your selected workspace.</span></div></div>

      {loading && <div className="safe-demo__error">Loading backend proof…</div>}
      {error && <div className="safe-demo__error"><AlertTriangle size={15} /> {error}</div>}

      <div className="safe-demo__pipeline">
        {stages.map((item, index) => {
          const Icon = item.icon;
          const active = Boolean(completed[index]);
          return (
            <React.Fragment key={item.label}>
              <div className={`safe-demo__stage ${active ? 'is-active' : ''}`}><Icon size={18} /><span>{item.label}</span></div>
              {index < stages.length - 1 && <div className={`safe-demo__rail ${active && completed[index + 1] ? 'is-active' : ''}`} />}
            </React.Fragment>
          );
        })}
      </div>

      {evidence && <>
        <div className="safe-demo__worlds">
          <div className="safe-demo__origin"><span className="safe-demo__snapshot">BASELINE SNAPSHOT</span><strong>discount.js</strong><code>amount &gt; 100</code><small>Boundary test fails at $100</small></div>
          <div className="safe-demo__fork-line" aria-hidden="true" />
          <div className="safe-demo__candidates">
            {evidence.candidates.map((candidate) => <article className={`safe-demo__candidate ${candidate.success ? 'is-winner' : 'is-rejected'}`} key={candidate.name}>
              <div className="safe-demo__candidate-head"><span>{candidate.name.replace('candidate-', 'Mutation ').toUpperCase()}</span>{candidate.success ? <Check size={18} /> : <X size={18} />}</div>
              <code>{candidate.mutation || 'Mutation source not included in this artifact'}</code>
              <strong>{candidate.success ? `${candidate.tests_passed ?? '—'} TESTS PASS` : 'REJECTED BY TESTS'}</strong>
              <small>exit {candidate.exit_code} · {candidate.duration_ms.toFixed(0)} ms</small>
              {candidate.success && <div className="safe-demo__winner-label">WINNER REPLAYED</div>}
            </article>)}
          </div>
        </div>

        <div className="safe-demo__proof">
          <div><span>Replay verification</span><strong className={evidence.selection.replay_verified ? 'success' : ''}>{evidence.selection.replay_verified ? '0 FILES CHANGED' : 'FAILED'}</strong></div>
          <div><span>Merge decision</span><strong className={evidence.selection.merge_decision === 'approved' ? 'success' : ''}>{evidence.selection.merge_decision.toUpperCase()}</strong></div>
          <div><span>GenOS operations</span><strong>{evidence.runtime.genos_operations}</strong></div>
          <div><span>Model calls</span><strong>{evidence.usage.model_calls}</strong></div>
          <div><span>Model tokens / cost</span><strong>{modelTokens} / ${evidence.usage.cost_usd.toFixed(2)}</strong></div>
          <div><span>Fixture wall time</span><strong>{(evidence.runtime.wall_ms / 1000).toFixed(2)} s</strong></div>
        </div>

        <div className="safe-demo__metadata"><FileCheck2 size={14} /><span>Backend proof generated {new Date(evidence.generated_at).toLocaleString()}</span><span>Schema v{evidence.schema_version}</span><span>Mode: {execution?.mode || 'deterministic fixture'}</span><span>Provider: {execution?.provider || 'directory'}</span></div>
      </>}

      <footer className="safe-demo__footer"><span>{evidence?.usage.reason || 'No model invocation recorded.'}</span><span>{evidence?.limits.join(' · ') || 'Limits unavailable until the artifact loads.'}</span></footer>
    </section>
  );
};
