import React, { useEffect, useState } from 'react';
import { Skull, AlertTriangle, FileText, CheckCircle2 } from 'lucide-react';
import { useToastStore } from '../../store/useToastStore';
import { api } from '../../api/client';

export const AdaptiveApoptosisPanel: React.FC = () => {
  const [consecutiveErrors, setConsecutiveErrors] = useState(3);
  const [maxBudgetUsd, setMaxBudgetUsd] = useState(1.0);
  const [divergenceThreshold, setDivergenceThreshold] = useState(55);
  const [selectedAutopsy, setSelectedAutopsy] = useState<any>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const showToast = useToastStore((state) => state.showToast);

  useEffect(() => {
    api.getResiliencePolicy().then((policy: any) => {
      if (!policy) return;
      setConsecutiveErrors(policy.maxConsecutiveFailures ?? 3);
      setMaxBudgetUsd(policy.maxCostUsd ?? 1.0);
      setDivergenceThreshold(Math.round((policy.divergenceThreshold ?? 0.55) * 100));
    }).catch((e: any) => showToast('error', 'Apoptosis Metrics Unavailable', e?.message || 'Backend unreachable.'));
  }, []);

  const handleSaveThresholds = () => {
    api.updateResiliencePolicy({ maxConsecutiveFailures: consecutiveErrors, maxCostUsd: maxBudgetUsd, divergenceThreshold: divergenceThreshold / 100 })
      .then(() => showToast('success', 'Apoptosis Policy Synchronized', `Thresholds: ${consecutiveErrors} failures, $${maxBudgetUsd} budget, ${divergenceThreshold}% min alignment.`))
      .catch((e: any) => showToast('error', 'Policy Sync Failed', e.message));
  };

  const handleEvaluateAgent = async () => {
    setIsEvaluating(true);
    try {
      const agents: any[] = await api.listAgents();
      const agent = agents.find((candidate) => candidate.status === 'running') || agents[0];
      if (!agent) throw new Error('No agent available for evaluation');
      const report: any = await api.triggerApoptosis(agent.id, { consecutiveFailures: 0, costUsd: 0, semanticDivergence: 0.8, hallucinations: 0 });
      setSelectedAutopsy({
        ...report,
        trigger: report.triggerReason,
        terminalAction: report.terminalCallStack?.join('\n') || 'No termination action was taken.',
        lastThoughts: (report.lastActions || []).map((action: any) => `${action.tool}: ${action.status}${action.detail ? ` — ${action.detail}` : ''}`),
        recommendedPatch: report.recommendedPromptPatch
      });
      showToast('success', 'Autopsy Evaluation Complete', `Agent ${agent.name} evaluated without forced termination.`);
    } catch (e: any) { showToast('error', 'Autopsy Evaluation Failed', e.message); }
    finally { setIsEvaluating(false); }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', height: '100%' }}>
      
      {/* Threshold Config */}
      <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', borderRadius: '6px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '10px 16px', background: 'var(--bg-subtle)', borderBottom: '1px solid var(--panel-border)', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Skull size={14} color="var(--danger)" /> Adaptive Apoptosis Threshold Matrix
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
          <button onClick={handleEvaluateAgent} disabled={isEvaluating} className="gh-btn" style={{ justifyContent: 'center' }}>
            <FileText size={14} /> {isEvaluating ? 'Evaluating...' : 'Evaluate active agent'}
          </button>
        </div>
      </div>

      {/* Autopsy Report Viewer */}
      <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', borderRadius: '6px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '10px 16px', background: 'var(--bg-subtle)', borderBottom: '1px solid var(--panel-border)', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <FileText size={14} color="var(--accent-blue)" /> Automated Autopsy Report
        </div>

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
            <strong>Recommended Prompt Patch:</strong> {selectedAutopsy.recommendedPatch}
          </div>}

          </>}
        </div>
      </div>

    </div>
  );
};
