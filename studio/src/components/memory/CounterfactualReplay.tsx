import React, { useEffect, useState } from 'react';
import { GitFork, Play, Rocket } from 'lucide-react';
import { api } from '../../api/client';
import { useToastStore } from '../../store/useToastStore';

const MODEL_TIERS = ['default', 'Flash Lite', 'Flash', 'Pro'];

const truncateStep = (step: any): string => {
  const text = typeof step === 'string'
    ? step
    : step?.detail || step?.action || step?.text || JSON.stringify(step);
  return String(text).length > 140 ? `${String(text).slice(0, 140)}…` : String(text);
};

export const CounterfactualReplay: React.FC = () => {
  const [branchStep, setBranchStep] = useState(2);
  const [alteredPrompt, setAlteredPrompt] = useState('Enforce strict zero-trust boundary: reject unauthenticated WebSocket handshake immediately.');
  const [modelTier, setModelTier] = useState('default');
  const [trajectories, setTrajectories] = useState<any[]>([]);
  const [trajectoryId, setTrajectoryId] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [simulationResult, setSimulationResult] = useState<any>(null);
  const [executionResult, setExecutionResult] = useState<any>(null);
  const [executionError, setExecutionError] = useState('');
  const showToast = useToastStore((state) => state.showToast);

  useEffect(() => {
    api.getTrajectories().then((data: any) => {
      const items = [...(data?.pendingList || []), ...(data?.activeList || [])];
      setTrajectories(items);
      setTrajectoryId(items[0]?.id || '');
    }).catch(() => showToast('error', 'Trajectory Load Failed', 'Unable to load persisted trajectories.'));
  }, [showToast]);

  const buildAlterations = () => ({
    instructionOverride: alteredPrompt,
    ...(modelTier !== 'default' ? { modelTierOverride: modelTier } : {})
  });

  const handleRunReplay = async () => {
    setIsRunning(true);
    try {
      const trajectory = trajectories.find((item) => item.id === trajectoryId);
      if (!trajectory) throw new Error('Select a persisted trajectory before branching.');
      const result = await api.reconstructCounterfactual({
        trajectory: { ...trajectory, turns: trajectory.diffLines || [] },
        stepIndex: branchStep,
        alterations: buildAlterations()
      });
      setSimulationResult(result);
      setExecutionResult(null);
      setExecutionError('');
      showToast('success', 'Counterfactual Branch Prepared', 'The alternative branch was derived from persisted trajectory steps.');
    } catch (e: any) {
      showToast('error', 'Replay Error', e.message);
    } finally {
      setIsRunning(false);
    }
  };

  const handleExecuteBranch = async () => {
    if (!simulationResult || isExecuting) return;
    const trajectory = trajectories.find((item) => item.id === trajectoryId);
    if (!trajectory) return;
    const traceId = (trajectory as any).traceId ?? trajectory.id;
    const override = simulationResult.comparison?.counterfactualTimeline?.alterationApplied || {};
    if (!window.confirm(`Queue an isolated replay of branch "${traceId}" with the altered parameters?`)) return;
    setIsExecuting(true);
    setExecutionError('');
    try {
      const result = await api.replayTrace(traceId, { override });
      setExecutionResult(result);
      showToast('info', 'Branch Execution Queued', `Replay ${result?.replayId || ''} was queued with status ${result?.status || 'unknown'}.`);
    } catch (e: any) {
      setExecutionError(e.message);
      showToast('error', 'Branch Execution Failed', e.message);
    } finally {
      setIsExecuting(false);
    }
  };

  const originalSteps = simulationResult?.comparison?.originalTimeline?.steps || [];

  return (
    <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', borderRadius: '6px', overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '100%' }}>
      
      {/* Header */}
      <div style={{ padding: '12px 16px', background: 'var(--bg-subtle)', borderBottom: '1px solid var(--panel-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <GitFork size={14} color="var(--accent-purple)" /> Counterfactual "What-If" Replay Engine (Branching Time Travel)
        </div>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Branch execution from historical node in isolated sandbox</span>
      </div>

      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px', flex: 1, overflowY: 'auto' }}>
        
        {/* Setup Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>Branch from Step</label>
            <select 
              value={trajectoryId}
              onChange={(e) => setTrajectoryId(e.target.value)}
              style={{ width: '100%', marginBottom: '8px', padding: '6px 10px', background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.8rem' }}
            >
              <option value="">Select recorded trajectory</option>
              {trajectories.map((trajectory) => <option key={trajectory.id} value={trajectory.id}>{trajectory.title}</option>)}
            </select>
            <select 
              value={branchStep} 
              onChange={(e) => setBranchStep(parseInt(e.target.value))} 
              style={{ width: '100%', padding: '6px 10px', background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.8rem' }}
            >
              {Array.from({ length: Math.max(1, trajectories.find((item) => item.id === trajectoryId)?.diffLines?.length || 1) }, (_, i) => <option key={i + 1} value={i + 1}>Step #{i + 1}</option>)}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>Altered Parameter / Instruction Override</label>
            <input 
              type="text" 
              value={alteredPrompt} 
              onChange={(e) => setAlteredPrompt(e.target.value)} 
              style={{ width: '100%', marginBottom: '8px', padding: '6px 10px', background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.8rem', outline: 'none' }}
            />
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>Model Tier Override</label>
            <select
              value={modelTier}
              onChange={(e) => setModelTier(e.target.value)}
              style={{ width: '100%', maxWidth: '220px', padding: '6px 10px', background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.8rem' }}
            >
              {MODEL_TIERS.map((tier) => <option key={tier} value={tier}>{tier === 'default' ? 'Default (inherit)' : tier}</option>)}
            </select>
          </div>
        </div>

        <button 
          onClick={handleRunReplay} 
          disabled={isRunning} 
          className="gh-btn gh-btn-primary" 
          style={{ padding: '8px 16px', justifyContent: 'center' }}
        >
          <Play size={14} /> {isRunning ? 'Preparing Branch...' : 'Prepare Counterfactual Branch'}
        </button>

        {/* Comparison Result */}
        {simulationResult && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            
            {/* Original */}
            <div style={{ background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '6px', padding: '14px' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--danger)', marginBottom: '4px' }}>
                Original Timeline (Recorded)
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0 0 12px 0' }}>
                {originalSteps.length} recorded steps from trajectory {simulationResult.comparison?.originalTimeline?.sourceTrajectoryId}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {originalSteps.map((step: any, i: number) => (
                  <div key={i} style={{ display: 'flex', gap: '8px', fontSize: '0.75rem', color: 'var(--text-primary)' }}>
                    <span style={{ fontFamily: 'monospace', color: 'var(--text-muted)', flexShrink: 0 }}>#{i + 1}</span>
                    <span style={{ overflowWrap: 'anywhere' }}>{truncateStep(step)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Counterfactual */}
            <div style={{ background: 'var(--bg-main)', border: '1px solid var(--success)', borderRadius: '6px', padding: '14px' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--success)', marginBottom: '4px', display: 'flex', justifyContent: 'space-between' }}>
                <span>Counterfactual Timeline (What-If)</span>
                <span>Analysis only</span>
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-primary)', margin: '0 0 8px 0' }}>
                {simulationResult.comparison?.outcome}
              </p>
              <pre style={{ margin: 0, fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--success)', lineHeight: 1.4 }}>
                {JSON.stringify(simulationResult.comparison?.counterfactualTimeline?.alterationApplied || {}, null, 2)}
              </pre>
            </div>

          </div>
        )}

        {/* Execute Branch */}
        {simulationResult && (
          <div style={{ background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '6px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <button
              onClick={handleExecuteBranch}
              disabled={isExecuting}
              className="gh-btn gh-btn-primary"
              style={{ padding: '8px 16px', justifyContent: 'center', alignSelf: 'flex-start' }}
            >
              <Rocket size={14} /> {isExecuting ? 'Queuing Execution...' : 'Execute Branch in Sandbox'}
            </button>
            {executionResult && (
              <div style={{ fontSize: '0.75rem', color: 'var(--success)' }}>
                Replay queued: <span style={{ fontFamily: 'monospace' }}>{String(executionResult.replayId || 'unknown')}</span> · status {String(executionResult.status || 'unknown')}
                {executionResult.spanCount != null ? ` · ${executionResult.spanCount} spans` : ''}
                {' '}· trace {String(executionResult.traceId || 'n/a')}
              </div>
            )}
            {executionError && (
              <div style={{ fontSize: '0.75rem', color: 'var(--danger)' }}>
                Backend rejected the branch execution: {executionError}
              </div>
            )}
          </div>
        )}

      </div>

    </div>
  );
};
