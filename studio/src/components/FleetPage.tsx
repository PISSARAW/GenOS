import React, { useEffect, useMemo, useState } from 'react';
import { Activity, Bot, Layers, RefreshCw, ShieldCheck } from 'lucide-react';
import { api } from '../api/client';

export const FleetPage: React.FC = () => {
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [status, setStatus] = useState<any>(null);
  const [security, setSecurity] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadFleet = async () => {
    setLoading(true);
    setError('');
    try {
      const [workspaceData, agentData, statusData, securityData] = await Promise.all([
        api.listWorkspaces(), api.listAgents(), api.getStatus(), api.getSecurityStatus()
      ]);
      setWorkspaces(Array.isArray(workspaceData) ? workspaceData : []);
      setAgents(Array.isArray(agentData) ? agentData : []);
      setStatus(statusData);
      setSecurity(securityData?.securityPosture || null);
    } catch (e: any) {
      setError(e?.message || 'Unable to load fleet data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadFleet(); }, []);

  const runningAgents = agents.filter((agent) => agent.status === 'running' || agent.status === 'active');
  const agentsByWorkspace = useMemo(() => agents.reduce((groups, agent) => {
    const key = agent.workspaceId || 'unassigned';
    groups[key] = (groups[key] || 0) + 1;
    return groups;
  }, {} as Record<string, number>), [agents]);

  return (
    <div style={{ width: '100%', height: '100%', overflowY: 'auto', background: 'var(--bg-main)' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
          <div>
            <h1 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1.5rem' }}>Fleets</h1>
            <p style={{ margin: '8px 0 0', color: 'var(--text-secondary)' }}>Operational groups of agents managing GenOS workspaces.</p>
          </div>
          <button className="gh-btn" onClick={loadFleet} disabled={loading} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>

        {error && <div style={{ marginBottom: '16px', padding: '12px 16px', color: 'var(--danger)', border: '1px solid var(--panel-border)', borderRadius: '6px' }}>{error}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '16px', marginBottom: '24px' }}>
          {[
            ['Active agents', runningAgents.length, Activity],
            ['Total agents', agents.length, Bot],
            ['Workspaces', workspaces.length, Layers],
            ['Security', security?.isHalted ? 'Halted' : 'Protected', ShieldCheck]
          ].map(([label, value, Icon]: any) => (
            <div key={String(label)} style={{ padding: '16px', background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', borderRadius: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', fontSize: '0.8rem' }}><Icon size={15} /> {label}</div>
              <div style={{ marginTop: '10px', color: 'var(--text-primary)', fontSize: '1.35rem', fontWeight: 600 }}>{loading ? '…' : value}</div>
            </div>
          ))}
        </div>

        <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', borderRadius: '6px', overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', background: 'var(--bg-subtle)', borderBottom: '1px solid var(--panel-border)', color: 'var(--text-primary)', fontWeight: 600 }}>
            Fleet workspace allocation
          </div>
          {workspaces.length === 0 && !loading && <div style={{ padding: '32px', color: 'var(--text-secondary)' }}>No workspaces available.</div>}
          {workspaces.map((workspace, index) => (
            <div key={workspace.id || index} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', borderBottom: index < workspaces.length - 1 ? '1px solid var(--panel-border)' : 'none' }}>
              <div>
                <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{workspace.title || workspace.name}</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '4px' }}>{workspace.description || workspace.path || 'GenOS workspace'}</div>
              </div>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{agentsByWorkspace[workspace.id] || 0} agent(s)</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: '16px', color: 'var(--text-muted)', fontSize: '0.75rem' }}>Fleet status: {status?.status || status?.runtime || 'connected to GenOS runtime'}</div>
      </div>
    </div>
  );
};
