import React, { useState } from 'react';
import { Search, Bug, Play, AlertOctagon, CheckCircle2, User } from 'lucide-react';
import { api } from '../../api/client';
import { useToastStore } from '../../store/useToastStore';

export const CausalAnomalyBisection: React.FC = () => {
  const [workspaceId, setWorkspaceId] = useState('ws-genos-core');
  const [testAssertion, setTestAssertion] = useState('npm test -- --grep "invariant_type_check"');
  const [isRunning, setIsRunning] = useState(false);
  const [bisectionReport, setBisectionReport] = useState<any>(null);
  const showToast = useToastStore((state) => state.showToast);

  const handleRunBisection = async () => {
    setIsRunning(true);
    try {
      const res = await api.runCausalBisection(workspaceId, testAssertion);
      setBisectionReport(res);
      showToast('success', 'Bisection Concluded', `Pinpointed culprit in ${res.bisectionSteps || 3} logarithmic steps.`);
    } catch (e: any) {
      showToast('error', 'Bisection Error', e.message);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', borderRadius: '6px', overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '100%' }}>
      
      {/* Header */}
      <div style={{ padding: '12px 16px', background: 'var(--bg-subtle)', borderBottom: '1px solid var(--panel-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Bug size={16} color="var(--danger)" />
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>Automated Causal Anomaly Bisection Engine (O(log N))</span>
        </div>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Automated git-bisect for AI swarms</span>
      </div>

      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px', flex: 1, overflowY: 'auto' }}>
        
        {/* Input parameters */}
        <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr auto', gap: '12px', alignItems: 'flex-end' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>Target Workspace</label>
            <input 
              type="text" 
              value={workspaceId} 
              onChange={(e) => setWorkspaceId(e.target.value)}
              style={{ width: '100%', padding: '6px 10px', background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.8rem', outline: 'none' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>Invariant Test Command</label>
            <input 
              type="text" 
              value={testAssertion} 
              onChange={(e) => setTestAssertion(e.target.value)}
              style={{ width: '100%', padding: '6px 10px', background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.8rem', fontFamily: 'monospace', outline: 'none' }}
            />
          </div>

          <button 
            onClick={handleRunBisection} 
            disabled={isRunning} 
            className="gh-btn gh-btn-primary" 
            style={{ padding: '6px 16px', fontSize: '0.8rem' }}
          >
            <Play size={12} /> {isRunning ? 'Bisecting...' : 'Start Bisection'}
          </button>
        </div>

        {/* Report Result */}
        {bisectionReport && (
          <div style={{ background: 'var(--bg-main)', border: '1px solid var(--danger)', borderRadius: '6px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertOctagon size={16} color="var(--danger)" />
                <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--danger)' }}>Culprit Isolated at Snapshot #{bisectionReport.culpritSnapshot?.step_number || 2}</span>
              </div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                Evaluated in <strong>{bisectionReport.bisectionSteps}</strong> logarithmic iterations
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '0.8rem' }}>
              <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', borderRadius: '4px', padding: '10px' }}>
                <span style={{ color: 'var(--text-secondary)', display: 'block', marginBottom: '2px' }}>Culprit Agent:</span>
                <strong style={{ color: 'var(--accent-blue)' }}>{bisectionReport.culpritAgent}</strong>
              </div>
              <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', borderRadius: '4px', padding: '10px' }}>
                <span style={{ color: 'var(--text-secondary)', display: 'block', marginBottom: '2px' }}>Root Cause:</span>
                <strong style={{ color: 'var(--text-primary)' }}>{bisectionReport.rootCause}</strong>
              </div>
            </div>

            <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', borderRadius: '4px', padding: '10px' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Recommended Remediation Patch:</div>
              <pre style={{ margin: 0, fontFamily: 'monospace', fontSize: '0.75rem', color: '#3fb950', lineHeight: 1.4 }}>
                {bisectionReport.remediationPatch}
              </pre>
            </div>
          </div>
        )}

      </div>

    </div>
  );
};
