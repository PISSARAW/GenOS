import React, { useEffect, useState } from 'react';
import { Search, Bug, Play, AlertOctagon, CheckCircle2, User } from 'lucide-react';
import { api } from '../../api/client';
import { useToastStore } from '../../store/useToastStore';

export const CausalAnomalyBisection: React.FC = () => {
  const [workspaceId, setWorkspaceId] = useState('');
  const [testAssertion, setTestAssertion] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [bisectionReport, setBisectionReport] = useState<any>(null);
  const showToast = useToastStore((state) => state.showToast);
  useEffect(() => { api.listWorkspaces().then((items: any[]) => items?.[0] && setWorkspaceId(items[0].id)).catch(() => {}); }, []);

  const handleRunBisection = async () => {
    setIsRunning(true);
    try {
      const res = await api.runCausalBisection(workspaceId, testAssertion);
      setBisectionReport(res);
      showToast('success', 'Bisection Concluded', res.anomalyFound === false ? 'No anomaly found in the recorded snapshots.' : 'Backend returned the causal bisection result.');
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
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>Causal Bisection</span>
        </div>
        <span style={{ fontSize: '0.75rem', color: 'var(--success)' }}>Durable snapshots · temporary workspace runner</span>
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
              disabled={!workspaceId}
              style={{ width: '100%', padding: '6px 10px', background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.8rem', outline: 'none' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>Invariant Test Command</label>
            <input 
              type="text" 
              value={testAssertion} 
              onChange={(e) => setTestAssertion(e.target.value)}
              disabled={!workspaceId}
              placeholder="npm test -- --runInBand"
              style={{ width: '100%', padding: '6px 10px', background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.8rem', fontFamily: 'monospace', outline: 'none' }}
            />
          </div>

          <button 
            onClick={handleRunBisection}
            disabled={isRunning || !workspaceId || !testAssertion.trim()}
            className="gh-btn gh-btn-primary" 
            style={{ padding: '6px 16px', fontSize: '0.8rem' }}
          >
            <Play size={12} /> {isRunning ? 'Running…' : 'Run bisection'}
          </button>
        </div>

        {/* Report Result */}
        {bisectionReport && (
          <div style={{ background: 'var(--bg-main)', border: '1px solid var(--danger)', borderRadius: '6px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertOctagon size={16} color="var(--danger)" />
                <span style={{ fontSize: '0.9rem', fontWeight: 600, color: !bisectionReport.culpritReport ? 'var(--success)' : 'var(--danger)' }}>{!bisectionReport.culpritReport ? 'No anomaly found' : `Culprit isolated at snapshot #${bisectionReport.culpritReport.stepNumber}`}</span>
              </div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                Evaluated in <strong>{bisectionReport.bisectionSteps}</strong> logarithmic iterations
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '0.8rem' }}>
              <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', borderRadius: '4px', padding: '10px' }}>
                <span style={{ color: 'var(--text-secondary)', display: 'block', marginBottom: '2px' }}>Culprit Agent:</span>
                <strong style={{ color: 'var(--accent-blue)' }}>{bisectionReport.culpritReport?.culpritAgentId || '—'}</strong>
              </div>
              <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', borderRadius: '4px', padding: '10px' }}>
                <span style={{ color: 'var(--text-secondary)', display: 'block', marginBottom: '2px' }}>Root Cause:</span>
                <strong style={{ color: 'var(--text-primary)' }}>{bisectionReport.culpritReport?.rootCauseSummary || bisectionReport.reason || '—'}</strong>
              </div>
            </div>

            <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', borderRadius: '4px', padding: '10px' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Recommended Remediation Patch:</div>
              <pre style={{ margin: 0, fontFamily: 'monospace', fontSize: '0.75rem', color: '#3fb950', lineHeight: 1.4 }}>
                {bisectionReport.culpritReport ? `${bisectionReport.culpritReport.actionDescription || ''}\nTarget: ${bisectionReport.culpritReport.targetFile || '—'}` : 'No remediation required.'}
              </pre>
            </div>
          </div>
        )}

      </div>

    </div>
  );
};
