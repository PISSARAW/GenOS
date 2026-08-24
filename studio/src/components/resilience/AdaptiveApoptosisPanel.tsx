import React, { useEffect, useState } from 'react';
import { Skull, AlertTriangle, FileText, CheckCircle2, Copy, Undo2 } from 'lucide-react';
import { useToastStore } from '../../store/useToastStore';
import { api } from '../../api/client';

interface AutopsyReport {
  id: string;
  agentId: string;
  agentName: string;
  timestamp: string;
  trigger: string;
  terminalAction: string;
  lastThoughts: string[];
  recommendedPatch: string | null;
}

interface PolicyDraft {
  consecutiveErrors: number;
  maxBudgetUsd: number;
  divergenceThreshold: number;
}

const DEFAULT_DRAFT: PolicyDraft = { consecutiveErrors: 3, maxBudgetUsd: 1.0, divergenceThreshold: 55 };

export const AdaptiveApoptosisPanel: React.FC = () => {
  const [consecutiveErrors, setConsecutiveErrors] = useState(DEFAULT_DRAFT.consecutiveErrors);
  const [maxBudgetUsd, setMaxBudgetUsd] = useState(DEFAULT_DRAFT.maxBudgetUsd);
  const [divergenceThreshold, setDivergenceThreshold] = useState(DEFAULT_DRAFT.divergenceThreshold);
  const [savedPolicy, setSavedPolicy] = useState<PolicyDraft | null>(null);
  const [runningAgents, setRunningAgents] = useState<{ id: string; name: string }[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [sampleMetrics, setSampleMetrics] = useState(true);
  const [autopsyHistory, setAutopsyHistory] = useState<AutopsyReport[]>([]);
  const [selectedAutopsyId, setSelectedAutopsyId] = useState<string | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const showToast = useToastStore((state) => state.showToast);

  useEffect(() => {
    api.getResiliencePolicy().then((policy: any) => {
      if (!policy) return;
      const draft: PolicyDraft = {
        consecutiveErrors: policy.maxConsecutiveFailures ?? 3,
        maxBudgetUsd: policy.maxCostUsd ?? 1.0,
        divergenceThreshold: Math.round((policy.divergenceThreshold ?? 0.55) * 100)
      };
      setConsecutiveErrors(draft.consecutiveErrors);
      setMaxBudgetUsd(draft.maxBudgetUsd);
      setDivergenceThreshold(draft.divergenceThreshold);
      setSavedPolicy(draft);
    }).catch((e: any) => showToast('error', 'Apoptosis Metrics Unavailable', e?.message || 'Backend unreachable.'));

    api.listAgents().then((agents: any[]) => {
      const running = (agents || [])
        .filter((candidate) => candidate.status === 'running')
        .map((candidate) => ({ id: candidate.id, name: candidate.name || candidate.id }));
      setRunningAgents(running);
      if (running.length > 0) setSelectedAgentId(running[0].id);
    }).catch(() => setRunningAgents([]));
  }, []);

  const isDirty = !!savedPolicy && (
    savedPolicy.consecutiveErrors !== consecutiveErrors ||
    savedPolicy.maxBudgetUsd !== maxBudgetUsd ||
    savedPolicy.divergenceThreshold !== divergenceThreshold
  );

  const handleRevertPolicy = () => {
    if (!savedPolicy) return;
    setConsecutiveErrors(savedPolicy.consecutiveErrors);
    setMaxBudgetUsd(savedPolicy.maxBudgetUsd);
    setDivergenceThreshold(savedPolicy.divergenceThreshold);
  };

  const handleSaveThresholds = () => {
    api.updateResiliencePolicy({ maxConsecutiveFailures: consecutiveErrors, maxCostUsd: maxBudgetUsd, divergenceThreshold: divergenceThreshold / 100 })
      .then(() => {
        setSavedPolicy({ consecutiveErrors, maxBudgetUsd, divergenceThreshold });
        showToast('success', 'Apoptosis Policy Synchronized', `Thresholds: ${consecutiveErrors} failures, $${maxBudgetUsd} budget, ${divergenceThreshold}% min alignment.`);
      })
      .catch((e: any) => showToast('error', 'Policy Sync Failed', e.message));
  };

  const handleEvaluateAgent = async () => {
    const agentId = selectedAgentId || runningAgents[0]?.id;
    if (!agentId) {
      showToast('error', 'No Agent Selected', 'No running agent is available for evaluation.');
      return;
    }
    setIsEvaluating(true);
    try {
      // This panel has no live runtime telemetry feed yet, so the autopsy
      // runs against explicit zeroed sample metrics when sampleMetrics is on.
      const report: any = await api.triggerApoptosis(agentId, sampleMetrics
        ? { consecutiveFailures: 0, costUsd: 0, semanticDivergence: 0.8, hallucinations: 0, sampleMetrics: true }
        : { sampleMetrics: false });
      const entry: AutopsyReport = {
        id: report.reportId || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        agentId,
        agentName: runningAgents.find((a) => a.id === agentId)?.name || agentId,
        timestamp: new Date().toLocaleTimeString(),
        trigger: report.triggerReason,
        terminalAction: report.terminalCallStack?.join('\n') || 'No termination action was taken.',
        lastThoughts: (report.lastActions || []).map((action: any) => `${action.tool}: ${action.status}${action.detail ? ` — ${action.detail}` : ''}`),
        recommendedPatch: report.recommendedPromptPatch || null
      };
      setAutopsyHistory((history) => [entry, ...history]);
      setSelectedAutopsyId(entry.id);
      showToast('success', 'Dry-Run Autopsy Complete', `Agent ${entry.agentName} evaluated against policy thresholds${sampleMetrics ? ' with zeroed sample metrics (no live telemetry)' : ''}.`);
    } catch (e: any) { showToast('error', 'Autopsy Evaluation Failed', e.message); }
    finally { setIsEvaluating(false); }
  };

  const selectedAutopsy = autopsyHistory.find((report) => report.id === selectedAutopsyId) || null;

  const handleCopyPatch = async () => {
    if (!selectedAutopsy?.recommendedPatch) return;
    try {
      await navigator.clipboard.writeText(selectedAutopsy.recommendedPatch);
      showToast('success', 'Patch Copied', 'Recommended prompt patch copied to clipboard.');
    } catch (e: any) {
      showToast('error', 'Copy Failed', e?.message || 'Clipboard access was denied.');
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', height: '100%' }}>

      {/* Threshold Config */}
      <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', borderRadius: '6px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '10px 16px', background: 'var(--bg-subtle)', borderBottom: '1px solid var(--panel-border)', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Skull size={14} color="var(--danger)" /> Adaptive Apoptosis Threshold Matrix
          {isDirty && (
            <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#d29922' }}>UNSAVED CHANGES</span>
              <button onClick={handleRevertPolicy} className="gh-btn" style={{ fontSize: '0.65rem', padding: '2px 8px' }}>
                <Undo2 size={10} /> Revert
              </button>
            </span>
          )}
        </div>

        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px', flex: 1 }}>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '6px' }}>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Max Consecutive Tool Failures</span>
              <span style={{ color: 'var(--accent-blue)', fontFamily: 'monospace' }}>{consecutiveErrors} errors</span>
            </div>
            <input
              type="range" min="1" max="10" value={consecutiveErrors}
              onChange={(e) => setConsecutiveErrors(parseInt(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--danger)' }}
            />
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '6px' }}>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Token / Compute Cost Hard Ceiling</span>
              <span style={{ color: '#d29922', fontFamily: 'monospace' }}>${maxBudgetUsd.toFixed(2)}</span>
            </div>
            <input
              type="range" min="0.1" max="5.0" step="0.1" value={maxBudgetUsd}
              onChange={(e) => setMaxBudgetUsd(parseFloat(e.target.value))}
              style={{ width: '100%', accentColor: '#d29922' }}
            />
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '6px' }}>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Semantic Divergence Tolerance (Cosine Similarity)</span>
              <span style={{ color: 'var(--success)', fontFamily: 'monospace' }}>{divergenceThreshold}%</span>
            </div>
            <input
              type="range" min="30" max="90" value={divergenceThreshold}
              onChange={(e) => setDivergenceThreshold(parseInt(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--success)' }}
            />
          </div>

          <div style={{ background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '6px', padding: '12px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            <AlertTriangle size={12} color="var(--danger)" style={{ display: 'inline', marginRight: '4px' }} />
            This policy records an apoptosis decision and updates the persisted agent state when its supplied thresholds are met; it does not claim to stop an external runtime process.
          </div>

          <button onClick={handleSaveThresholds} className="gh-btn gh-btn-primary" style={{ justifyContent: 'center' }}>
            <CheckCircle2 size={14} /> Synchronize Apoptosis Policy
          </button>

          <div style={{ borderTop: '1px solid var(--panel-border)', paddingTop: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>Target Agent (running)</label>
            <select
              value={selectedAgentId}
              onChange={(e) => setSelectedAgentId(e.target.value)}
              disabled={isEvaluating || runningAgents.length === 0}
              style={{ background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '4px', padding: '6px 10px', fontSize: '0.8rem', color: 'var(--text-primary)', width: '100%' }}
            >
              {runningAgents.length === 0 && <option value="">No running agents</option>}
              {runningAgents.map((agent) => (
                <option key={agent.id} value={agent.id}>{agent.name}</option>
              ))}
            </select>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              <input type="checkbox" checked={sampleMetrics} onChange={(e) => setSampleMetrics(e.target.checked)} disabled={isEvaluating} />
              Use zeroed sample metrics (no live telemetry feed exists yet)
            </label>
            <button onClick={handleEvaluateAgent} disabled={isEvaluating || !selectedAgentId} className="gh-btn" style={{ justifyContent: 'center' }}>
              <FileText size={14} /> {isEvaluating ? 'Evaluating...' : 'Run dry-run autopsy'}
            </button>
          </div>
        </div>
      </div>

      {/* Autopsy Report Viewer */}
      <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', borderRadius: '6px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '10px 16px', background: 'var(--bg-subtle)', borderBottom: '1px solid var(--panel-border)', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <FileText size={14} color="var(--accent-blue)" /> Automated Autopsy Report
        </div>

        {autopsyHistory.length > 0 && (
          <div style={{ borderBottom: '1px solid var(--panel-border)', padding: '8px 12px', maxHeight: '140px', overflowY: 'auto' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>AUTOPSY HISTORY ({autopsyHistory.length})</div>
            {autopsyHistory.map((report) => (
              <button
                key={report.id}
                onClick={() => setSelectedAutopsyId(report.id)}
                className="gh-btn"
                style={{
                  width: '100%', justifyContent: 'flex-start', marginBottom: '4px', fontSize: '0.72rem', padding: '4px 8px',
                  borderColor: report.id === selectedAutopsyId ? 'var(--accent-blue)' : 'transparent',
                  color: report.id === selectedAutopsyId ? 'var(--accent-blue)' : 'var(--text-secondary)'
                }}
              >
                {report.timestamp} · {report.agentName}
              </button>
            ))}
          </div>
        )}

        <div style={{ padding: '16px', flex: 1, display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto' }}>
          {!selectedAutopsy && <div style={{ padding: '24px', color: 'var(--text-secondary)' }}>No autopsy report recorded.</div>}
          {selectedAutopsy && <>

          <div style={{ background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '6px', padding: '12px' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Termination Trigger</div>
            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--danger)' }}>{selectedAutopsy.trigger}</div>
          </div>

          <div style={{ background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '6px', padding: '12px' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Terminal Action & Violation</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-primary)', fontFamily: 'monospace' }}>{selectedAutopsy.terminalAction}</div>
          </div>

          <div style={{ background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '6px', padding: '12px', flex: 1 }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>Recent persisted agent telemetry</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {selectedAutopsy.lastThoughts.length === 0 && <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>No telemetry was recorded for this agent.</div>}
              {selectedAutopsy.lastThoughts.map((thought: string, i: number) => (
                <div key={i} style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: thought.startsWith('[TRIGGER]') ? 'var(--danger)' : 'var(--text-primary)' }}>
                  {thought}
                </div>
              ))}
            </div>
          </div>

          {selectedAutopsy.recommendedPatch && <div style={{ background: 'rgba(56, 139, 253, 0.1)', border: '1px solid var(--accent-blue)', borderRadius: '6px', padding: '10px 12px', fontSize: '0.75rem', color: 'var(--text-primary)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <strong>Recommended Prompt Patch:</strong>
              <button onClick={handleCopyPatch} className="gh-btn" title="Copy to clipboard" style={{ fontSize: '0.65rem', padding: '2px 8px' }}>
                <Copy size={10} /> Copy
              </button>
            </div>
            {selectedAutopsy.recommendedPatch}
          </div>}

          </>}
        </div>
      </div>

    </div>
  );
};
