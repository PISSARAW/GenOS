import React, { useState } from 'react';
import { Skull, AlertTriangle, FileText, CheckCircle2 } from 'lucide-react';
import { useToastStore } from '../../store/useToastStore';

export const AdaptiveApoptosisPanel: React.FC = () => {
  const [consecutiveErrors, setConsecutiveErrors] = useState(3);
  const [maxBudgetUsd, setMaxBudgetUsd] = useState(1.0);
  const [divergenceThreshold, setDivergenceThreshold] = useState(55);
  const [selectedAutopsy, setSelectedAutopsy] = useState<any>({
    agentId: 'worker_mutator_9',
    timestamp: '2026-08-21T14:10:00Z',
    trigger: 'Semantic Divergence (< 0.55 vs initial task)',
    terminalAction: 'Attempted to delete production configuration in unisolated branch',
    lastThoughts: [
      'Task: refactor config parser',
      'Thought: delete entire file and replace with empty stub',
      '[TRIGGER] Apoptosis self-destruction executed. Workspace preserved.'
    ],
    recommendedPatch: 'Add AST assertion guardrail preventing whole-file deletion'
  });
  const showToast = useToastStore((state) => state.showToast);

  const handleSaveThresholds = () => {
    showToast('success', 'Apoptosis Policy Synchronized', `Thresholds: ${consecutiveErrors} failures, $${maxBudgetUsd} budget, ${divergenceThreshold}% min alignment.`);
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
            Automated apoptosis instantly terminates malfunctioning nodes before workspace state or repository corruption occurs.
          </div>

          <button onClick={handleSaveThresholds} className="gh-btn gh-btn-primary" style={{ marginTop: 'auto', justifyContent: 'center' }}>
            <CheckCircle2 size={14} /> Synchronize Apoptosis Policy
          </button>
        </div>
      </div>

      {/* Autopsy Report Viewer */}
      <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', borderRadius: '6px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '10px 16px', background: 'var(--bg-subtle)', borderBottom: '1px solid var(--panel-border)', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <FileText size={14} color="var(--accent-blue)" /> Automated Autopsy Report ({selectedAutopsy.agentId})
        </div>

        <div style={{ padding: '16px', flex: 1, display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto' }}>
          
          <div style={{ background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '6px', padding: '12px' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Termination Trigger</div>
            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--danger)' }}>{selectedAutopsy.trigger}</div>
          </div>

          <div style={{ background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '6px', padding: '12px' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Terminal Action & Violation</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-primary)', fontFamily: 'monospace' }}>{selectedAutopsy.terminalAction}</div>
          </div>

          <div style={{ background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '6px', padding: '12px', flex: 1 }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>Last 3 Agent Thoughts Before Apoptosis</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {selectedAutopsy.lastThoughts.map((thought: string, i: number) => (
                <div key={i} style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: thought.startsWith('[TRIGGER]') ? 'var(--danger)' : 'var(--text-primary)' }}>
                  {thought}
                </div>
              ))}
            </div>
          </div>

          <div style={{ background: 'rgba(56, 139, 253, 0.1)', border: '1px solid var(--accent-blue)', borderRadius: '6px', padding: '10px 12px', fontSize: '0.75rem', color: 'var(--text-primary)' }}>
            <strong>Recommended Prompt Patch:</strong> {selectedAutopsy.recommendedPatch}
          </div>

        </div>
      </div>

    </div>
  );
};
