import React, { useEffect, useState } from 'react';
import { GitBranch, Activity } from 'lucide-react';
import { api } from '../api/client';
import { useToastStore } from '../store/useToastStore';

export const TrinityAgentDeploy: React.FC<{ workspaceId?: string | null; workspaceName?: string }> = ({ workspaceId = null, workspaceName }) => {
  const [step, setStep] = useState<0 | 2>(0);
  const [prompt, setPrompt] = useState('');
  const [worlds, setWorlds] = useState<any[]>([]);
  const [deploying, setDeploying] = useState(false);
  const showToast = useToastStore((state) => state.showToast);
  useEffect(() => {
    let cancelled = false;
    const loadWorlds = () => api.listTrinityWorlds().then((items: any[]) => {
      if (!cancelled && items?.length) { setWorlds(items); setStep(2); }
    }).catch((e: any) => showToast('error', 'Trinity Unavailable', e?.message || 'Backend unreachable.'));
    void loadWorlds();
    const timer = window.setInterval(loadWorlds, 2000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  const startWorlds = async () => {
    if (!prompt.trim() || !workspaceId) return;
    setDeploying(true);
    try {
      const result = await api.deployTrinity({ prompt, workspaceId });
      const agentIds = Array.isArray(result?.agents) ? result.agents : [];
      setWorlds(result.worlds || agentIds.map((id: string) => ({ id, name: id, status: 'running', agentId: id })));
      setStep(2);
      showToast('success', 'Trinity Deployment', `${agentIds.length} backend agent(s) deployed.`);
    } catch (error: any) {
      showToast('error', 'Trinity Deployment Failed', error.message || 'The backend could not start Trinity worlds.');
    } finally {
      setDeploying(false);
    }
  };

  return (
    <div style={{ padding: '32px', maxWidth: '1200px', margin: '0 auto', width: '100%', background: 'var(--bg-main)' }}>
      <div style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <GitBranch size={28} color="var(--accent-purple)" />
        <h1 style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Trinity Mode</h1>
      </div>

      {step === 0 && (
        <div style={{ border: '1px solid var(--panel-border)', borderRadius: '6px', background: 'var(--bg-panel)', padding: '24px' }}>
          <h3 style={{ marginTop: 0, marginBottom: '12px', fontSize: '1.1rem', color: 'var(--text-primary)' }}>Initialize Trinity Parallel Mission</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '20px', lineHeight: 1.5 }}>
            Deploys three isolated GenOS agents with distinct implementation strategies. Their runtime state and telemetry are supplied by the backend.
          </p>
          <p style={{ color: workspaceId ? 'var(--success)' : 'var(--danger)', fontSize: '0.85rem', marginBottom: '16px' }}>Workspace: <strong>{workspaceName || (workspaceId ? workspaceId : 'Select a project first')}</strong></p>
          <textarea 
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the initial requirement..."
            style={{ width: '100%', height: '120px', border: '1px solid var(--panel-border)', borderRadius: '6px', padding: '16px', fontSize: '0.95rem', resize: 'none', outline: 'none', fontFamily: 'inherit', marginBottom: '16px', background: 'var(--bg-main)', color: 'var(--text-primary)' }}
          />
          <button 
            onClick={startWorlds}
            className="gh-btn gh-btn-primary" 
            disabled={!prompt.trim() || !workspaceId || deploying}
            style={{ padding: '8px 24px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <GitBranch size={16} /> {deploying ? 'Starting real runtimes…' : workspaceId ? 'Deploy 3 real agents' : 'Select a project first'}
          </button>
        </div>
      )}

      {step === 2 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
          {worlds.map((w) => (
              <div key={w.id} style={{ border: '1px solid var(--panel-border)', borderRadius: '6px', background: 'var(--bg-panel)', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--text-primary)' }}>{w.name}</span>
                {w.status === 'running' ? <Activity size={16} className="pulse-green" color="var(--success)" /> : <span style={{ fontSize: '0.75rem', color: 'var(--success)' }}>{w.status}</span>}
              </div>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>{w.strategy || 'Deployment state is reported by the backend agent registry.'}</p>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-secondary)' }}><span>{w.status}</span><span>Agent: {w.agentName || w.agentId || '—'}</span></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
