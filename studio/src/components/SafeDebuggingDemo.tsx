import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileCode2, GitBranch, Play, RefreshCw, Wrench } from 'lucide-react';
import { api } from '../api/client';
import { useGenOSStore } from '../store/useGenOSStore';

type WorkspaceDiagnostics = { workspace: { id: string; name: string; path: string }; files: Array<{ name: string; type: 'file' | 'directory' }>; testCommands: Array<{ id: string; label: string }>; git: { available: boolean; changedFiles: string[]; error: string | null } };
type TestResult = { command: { id: string; label: string }; exitCode: number | null; signal: string | null; durationMs: number; stdout: string; stderr: string };
type Diagnostic = { id: string; file: string; line?: number; column?: number; message: string };

function parseDiagnostics(result: TestResult | null): Diagnostic[] {
  if (!result) return [];
  const lines = `${result.stdout}\n${result.stderr}`.split('\n');
  const diagnostics: Diagnostic[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const location = lines[index].match(/^(.+):(\d+):(\d+)$/);
    if (!location) continue;
    const message = lines.slice(index + 1, index + 4).find((line) => /^(Error|Warning):/.test(line.trim()))?.trim() || 'Diagnostic reported by the verifier.';
    diagnostics.push({ id: `${location[1]}:${location[2]}:${location[3]}:${index}`, file: location[1], line: Number(location[2]), column: Number(location[3]), message });
  }
  return diagnostics;
}

export const SafeDebuggingDemo: React.FC<{ workspaceId?: string | null; workspaceName?: string; onOpenAgent?: () => void }> = ({ workspaceId, workspaceName, onOpenAgent }) => {
  const [diagnostics, setDiagnostics] = useState<WorkspaceDiagnostics | null>(null);
  const [selectedCommand, setSelectedCommand] = useState('');
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [selectedDiagnosticId, setSelectedDiagnosticId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [error, setError] = useState('');
  const [repairAgent, setRepairAgent] = useState<{ id: string; name: string } | null>(null);
  const setSelectedAgentId = useGenOSStore((state) => state.setSelectedAgentId);

  const loadWorkspace = useCallback(async () => {
    if (!workspaceId) { setDiagnostics(null); return; }
    const next = await api.inspectSafeDebuggingWorkspace(workspaceId) as WorkspaceDiagnostics;
    setDiagnostics(next);
    setSelectedCommand((current) => current && next.testCommands.some((command) => command.id === current) ? current : next.testCommands[0]?.id || '');
  }, [workspaceId]);

  useEffect(() => {
    setTestResult(null); setSelectedDiagnosticId(null); setRepairAgent(null);
    loadWorkspace().catch((cause: any) => setError(cause?.message || 'Workspace inspection failed.'));
  }, [loadWorkspace]);

  const foundDiagnostics = useMemo(() => parseDiagnostics(testResult), [testResult]);
  const selectedDiagnostic = foundDiagnostics.find((item) => item.id === selectedDiagnosticId) || foundDiagnostics[0] || null;

  const runVerification = async () => {
    if (!workspaceId || !selectedCommand) return;
    setLoading(true); setError(''); setRepairAgent(null);
    try {
      const result = await api.runSafeDebuggingWorkspaceTest(workspaceId, selectedCommand) as TestResult;
      setTestResult(result);
      setSelectedDiagnosticId(parseDiagnostics(result)[0]?.id || null);
      await loadWorkspace();
    } catch (cause: any) { setError(cause?.message || 'Verification could not be started.'); } finally { setLoading(false); }
  };

  const createRepairMission = async () => {
    if (!workspaceId || !selectedDiagnostic) return;
    setDeploying(true); setError('');
    try {
      const prompt = [`Repair the verified diagnostic in ${selectedDiagnostic.file}${selectedDiagnostic.line ? ` at line ${selectedDiagnostic.line}` : ''}.`, `Verifier message: ${selectedDiagnostic.message}`, 'Work only in an isolated branch. Inspect the relevant source and tests, propose the smallest justified patch, then run the same verification command. Do not merge or modify the source workspace directly.'].join('\n');
      const result = await api.deployAgent({ prompt, agentType: 'GenOS', modelTier: 'Pro', workspaceIsolation: 'Branch', workspaceId });
      setRepairAgent({ id: result.agent.id, name: result.agent.name });
    } catch (cause: any) { setError(cause?.message || 'Repair agent could not be created.'); } finally { setDeploying(false); }
  };

  return <section className="repair-workbench">
    <header className="repair-workbench__header"><div><div className="repair-workbench__eyebrow"><span /> SAFE REPAIR WORKBENCH</div><h1>Diagnose a real workspace and delegate a verified repair.</h1><p>Run the project’s own verifier, select a concrete diagnostic, then create an isolated repair mission with its evidence attached.</p></div><button type="button" className="repair-workbench__refresh" onClick={() => loadWorkspace().catch((cause: any) => setError(cause?.message || 'Workspace inspection failed.'))} disabled={!workspaceId}><RefreshCw size={14} /> Refresh</button></header>
    {!workspaceId && <div className="repair-workbench__notice"><AlertTriangle size={16} /> Select a workspace in the Studio sidebar to begin.</div>}
    {error && <div className="repair-workbench__error"><AlertTriangle size={16} /> {error}</div>}
    {diagnostics && <>
      <section className="repair-workbench__workspace">
        <div><span>Workspace</span><strong>{workspaceName || diagnostics.workspace.name}</strong><code>{diagnostics.workspace.path}</code></div>
        <div><span>Git status</span><strong>{diagnostics.git.changedFiles.length ? `${diagnostics.git.changedFiles.length} changed` : 'Clean'}</strong><code>{diagnostics.git.changedFiles.slice(0, 3).join('\n') || 'No uncommitted files'}</code></div>
        <div><span>Verifier</span>{diagnostics.testCommands.length ? <><select value={selectedCommand} onChange={(event) => setSelectedCommand(event.target.value)}>{diagnostics.testCommands.map((command) => <option key={command.id} value={command.id}>{command.label}</option>)}</select><button type="button" onClick={runVerification} disabled={loading}>{loading ? 'Running…' : <><Play size={13} /> Run verification</>}</button></> : <strong>No supported verifier detected</strong>}</div>
      </section>
      {testResult && <section className={`repair-workbench__result ${testResult.exitCode === 0 ? 'is-success' : 'is-failure'}`}><div><CheckCircle2 size={18} /><strong>{testResult.command.label} {testResult.exitCode === 0 ? 'passed' : 'reported problems'}</strong><span>exit {testResult.exitCode ?? '—'} · {(testResult.durationMs / 1000).toFixed(2)} s</span></div><pre>{testResult.stdout || testResult.stderr || 'No output returned.'}</pre></section>}
      {testResult && <section className="repair-workbench__triage">
        <aside><div className="repair-workbench__section-title"><FileCode2 size={16} /> Diagnostics ({foundDiagnostics.length})</div>{foundDiagnostics.length ? foundDiagnostics.map((diagnostic) => <button type="button" key={diagnostic.id} onClick={() => setSelectedDiagnosticId(diagnostic.id)} className={selectedDiagnostic?.id === diagnostic.id ? 'is-selected' : ''}><strong>{diagnostic.file.split('/').pop()}</strong><span>{diagnostic.line ? `L${diagnostic.line}:${diagnostic.column}` : 'Location unavailable'} · {diagnostic.message}</span></button>) : <p>No file-level diagnostic could be parsed. Use the verifier output above.</p>}</aside>
        <article><div className="repair-workbench__section-title"><Wrench size={16} /> Repair mission</div>{selectedDiagnostic ? <><h2>{selectedDiagnostic.file}</h2><p>{selectedDiagnostic.message}</p><dl><div><dt>Scope</dt><dd>Isolated branch of {diagnostics.workspace.name}</dd></div><div><dt>Evidence</dt><dd>{testResult.command.label} · exit {testResult.exitCode}</dd></div><div><dt>Guardrail</dt><dd>No automatic merge or direct source-workspace write.</dd></div></dl>{repairAgent ? <div className="repair-workbench__agent"><strong>{repairAgent.name} created</strong><button type="button" onClick={() => { setSelectedAgentId(repairAgent.id); onOpenAgent?.(); }}>Open agent profile</button></div> : <button type="button" className="repair-workbench__create" onClick={createRepairMission} disabled={deploying}>{deploying ? 'Creating isolated mission…' : <><GitBranch size={14} /> Create isolated repair mission</>}</button>}</> : <p>Run a verifier and select a diagnostic to create a repair mission.</p>}</article>
      </section>}
    </>}
  </section>;
};
