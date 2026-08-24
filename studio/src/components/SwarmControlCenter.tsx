import React, { useState, useEffect } from 'react';
import { Search, Activity, Plus, ThumbsUp, ThumbsDown, CheckCircle2, Route, Square, Trash2 } from 'lucide-react';
import { useGenOSStore } from '../store/useGenOSStore';
import { api } from '../api/client';
import { useToastStore } from '../store/useToastStore';
import { RBAC_Gate } from './RBAC_Gate';

interface SwarmControlCenterProps {
  onSelectAgent?: () => void;
}

export const SwarmControlCenter: React.FC<SwarmControlCenterProps> = ({ onSelectAgent }) => {
  const { clones: agents, setSelectedAgentId, fetchAgents } = useGenOSStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [worldFilter, setWorldFilter] = useState('all');
  const [proposals, setProposals] = useState<any[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activity, setActivity] = useState<Record<string, any>>({});
  const [showProposalModal, setShowProposalModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const showToast = useToastStore((state) => state.showToast);

  // GET /api/swarm/consensus returns `{ proposals, quorumState }`, not a bare
  // array — accept the documented shape and tolerate a legacy array payload.
  const fetchConsensus = () => {
    api.getConsensus()
      .then((data: any) => {
        if (Array.isArray(data)) {
          setProposals(data);
        } else if (Array.isArray(data?.proposals)) {
          setProposals(data.proposals);
        }
        setLoadError(null);
      })
      .catch((e: any) => {
        setLoadError(e.message || 'Consensus unavailable.');
      });
  };

  useEffect(() => {
    fetchAgents();
    fetchConsensus();
    const loadActivity = () => api.getTelemetryEvents(100).then((response: any) => {
      const latest: Record<string, any> = {};
      (response?.events || []).forEach((event: any) => {
        if (event.agent_id && !latest[event.agent_id]) latest[event.agent_id] = event;
      });
      setActivity(latest);
    }).catch(() => {});
    loadActivity();
    const interval = setInterval(loadActivity, 4000);
    return () => clearInterval(interval);
  }, []);

  const handlePing = async (agentId: string, name: string) => {
    try {
      const result = await api.pingAgent(agentId);
      showToast('success', 'Ping Acknowledged', `${name} was acknowledged by the API in ${Number(result.latencyMs || 0).toFixed(2)}ms.`);
    } catch (e: any) {
      showToast('error', 'Ping Failed', e.message);
    }
  };

  const handleDelete = async (agent: any) => {
    if (agent.status === 'running') {
      showToast('error', 'Agent Running', 'Stop the agent before deleting it.');
      return;
    }
    if (!window.confirm(`Delete agent "${agent.name}"? This cannot be undone.`)) return;
    try {
      await api.deleteAgent(agent.id);
      showToast('success', 'Agent Deleted', `${agent.name} was removed from the fleet.`);
      await fetchAgents();
    } catch (e: any) {
      showToast('error', 'Delete Failed', e.message);
    }
  };

  const handleStop = async (agent: any) => {
    if (!window.confirm(`Stop "${agent.name}"? Its execution run will be cancelled.`)) return;
    try {
      const result = await api.stopAgent(agent.id);
      showToast('success', result.stopped ? 'Stop Requested' : 'Agent Reconciled', result.stopped ? `${agent.name} is stopping.` : `${agent.name} had no active runtime and is now idle.`);
      await fetchAgents();
    } catch (e: any) {
      showToast('error', 'Stop Failed', e.message);
    }
  };

  const handleVote = async (proposalId: string, vote: 'yes' | 'no') => {
    try {
      await api.castVote({ proposalId, vote, agentId: 'Operator_Command' });
      showToast('success', 'Vote Cast', `Voted ${vote.toUpperCase()} on proposal #${proposalId}`);
      fetchConsensus();
    } catch (e: any) {
      showToast('error', 'Vote Failed', e.message);
    }
  };

  const handleCreateProposal = async () => {
    if (!newTitle) return;
    try {
      await api.createProposal({ title: newTitle, description: newDesc });
      showToast('success', 'Proposal Submitted', 'Swarm quorum voting initiated.');
      setShowProposalModal(false);
      setNewTitle('');
      setNewDesc('');
      fetchConsensus();
    } catch (e: any) {
      showToast('error', 'Submission Failed', e.message);
    }
  };

  const filteredAgents = agents.filter((a) => 
    ((a.name || '').toLowerCase().includes(searchTerm.toLowerCase()) || (a.role || '').toLowerCase().includes(searchTerm.toLowerCase()) || (a.trinityWorldName || '').toLowerCase().includes(searchTerm.toLowerCase())) &&
    (typeFilter === 'all' || a.agentType === typeFilter) && (worldFilter === 'all' || a.trinityWorldId === worldFilter)
  );
  const agentTypes = [...new Set(agents.map((a) => a.agentType).filter(Boolean))];
  const worlds = agents.filter((a) => a.trinityWorldId).reduce((all: any[], a) => all.some((w) => w.id === a.trinityWorldId) ? all : [...all, { id: a.trinityWorldId, name: a.trinityWorldName }], []);
  const selected = filteredAgents.filter((agent) => selectedIds.includes(agent.id));
  const toggleSelected = (id: string) => setSelectedIds((ids) => ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]);
  const toggleAll = () => setSelectedIds(selected.length === filteredAgents.length ? [] : filteredAgents.map((agent) => agent.id));
  const stopSelected = async () => {
    if (!selected.length || !window.confirm(`Stop ${selected.length} selected agent(s)?`)) return;
    try { await api.stopAgents(selected.map((agent) => agent.id)); showToast('success', 'Agents Stopped', `${selected.length} agent(s) reconciled or stopped.`); await fetchAgents(); } catch (e: any) { showToast('error', 'Bulk Stop Failed', e.message); }
  };
  const deleteSelected = async () => {
    if (!selected.length || !window.confirm(`Permanently delete ${selected.length} selected agent(s)?`)) return;
    try { const result = await api.deleteAgents(selected.map((agent) => agent.id)); setSelectedIds([]); showToast(result.blocked?.length ? 'warning' : 'success', 'Bulk Delete', `${result.deleted?.length || 0} deleted${result.blocked?.length ? `; ${result.blocked.length} still running` : ''}.`); await fetchAgents(); } catch (e: any) { showToast('error', 'Bulk Delete Failed', e.message); }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', width: '100%', height: '100%', overflowY: 'auto', background: 'var(--bg-main)' }}>
      <div style={{ maxWidth: '1080px', width: '100%', padding: '32px' }}>
        
        {/* Header List */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          
          <div style={{ display: 'flex', gap: '12px', flex: 1, maxWidth: '600px' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <input 
                type="text" 
                placeholder="Find an agent in swarm..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ width: '100%', padding: '6px 12px 6px 32px', fontSize: '0.85rem', border: '1px solid var(--panel-border)', borderRadius: '6px', outline: 'none', background: 'var(--bg-panel)', color: 'var(--text-primary)' }}
              />
              <Search size={14} color="var(--text-muted)" style={{ position: 'absolute', left: '10px', top: '8px' }} />
            </div>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={{ background: 'var(--bg-panel)', color: 'var(--text-primary)', border: '1px solid var(--panel-border)', borderRadius: '6px', padding: '6px' }}><option value="all">All types</option>{agentTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select>
            <select value={worldFilter} onChange={(e) => setWorldFilter(e.target.value)} style={{ background: 'var(--bg-panel)', color: 'var(--text-primary)', border: '1px solid var(--panel-border)', borderRadius: '6px', padding: '6px' }}><option value="all">All worlds</option>{worlds.map((world) => <option key={world.id} value={world.id}>{world.name}</option>)}</select>
          </div>

          <button onClick={() => setShowProposalModal(true)} className="gh-btn gh-btn-primary" style={{ padding: '6px 16px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Plus size={14} /> New Quorum Proposal
          </button>
        </div>

        {/* Quorum Proposals Section */}
        {loadError && (
          <div style={{ marginBottom: '16px', border: '1px solid var(--danger)', borderRadius: '6px', padding: '12px 16px', fontSize: '0.8rem', color: 'var(--danger)', background: 'rgba(248,81,73,0.08)' }}>
            Quorum proposals unavailable: {loadError}
          </div>
        )}
        {proposals.length > 0 && (
          <div style={{ marginBottom: '32px', background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', borderRadius: '6px', padding: '16px' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CheckCircle2 size={16} color="var(--accent-blue)" /> Swarm Biomimetic Consensus & Quorum
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {proposals.map((p) => (
                <div key={p.id} style={{ background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '6px', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>{p.title}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>{p.description} · Proposed by {p.proposer}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--accent-blue)', marginTop: '4px' }}>Approval: {p.approvalRate ?? 0}% ({p.yesCount ?? 0} YES / {p.noCount ?? 0} NO)</div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => handleVote(p.id, 'yes')} className="gh-btn" style={{ fontSize: '0.75rem', color: 'var(--success)' }}>
                      <ThumbsUp size={12} /> Vote Yes
                    </button>
                    <button onClick={() => handleVote(p.id, 'no')} className="gh-btn" style={{ fontSize: '0.75rem', color: 'var(--danger)' }}>
                      <ThumbsDown size={12} /> Vote No
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* List of Agents */}
        <div style={{ border: '1px solid var(--panel-border)', borderRadius: '6px', background: 'var(--bg-panel)', overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', background: 'var(--bg-subtle)', borderBottom: '1px solid var(--panel-border)', fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <input type="checkbox" checked={filteredAgents.length > 0 && selected.length === filteredAgents.length} onChange={toggleAll} aria-label="Select all filtered agents" />
            Active Fleet Swarm Nodes ({filteredAgents.length})
            {selected.length > 0 && <span style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}><span>{selected.length} selected</span><RBAC_Gate><button onClick={stopSelected} className="gh-btn"><Square size={12} /> Stop selected</button></RBAC_Gate><RBAC_Gate><button onClick={deleteSelected} className="gh-btn" style={{ color: 'var(--danger)' }}><Trash2 size={12} /> Delete selected</button></RBAC_Gate></span>}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {filteredAgents.map((agent, index) => (
              <div key={agent.id || index} style={{ display: 'flex', justifyContent: 'space-between', padding: '16px', borderBottom: index < filteredAgents.length - 1 ? '1px solid var(--panel-border)' : 'none' }} className="hover-bg-gray">
                
                <input type="checkbox" checked={selectedIds.includes(agent.id)} onChange={() => toggleSelected(agent.id)} aria-label={`Select ${agent.name}`} style={{ alignSelf: 'flex-start', margin: '5px 12px 0 0' }} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
                    <h3 onClick={() => { setSelectedAgentId(agent.id); onSelectAgent?.(); }} style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--accent-blue)', margin: 0, cursor: 'pointer' }} className="hover-underline">
                      {agent.name}
                    </h3>
                    <span style={{ fontSize: '0.75rem', padding: '2px 8px', border: '1px solid var(--panel-border)', borderRadius: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                      {agent.agentType || 'Agent'}
                    </span>
                    <span style={{ fontSize: '0.75rem', padding: '2px 8px', border: '1px solid var(--panel-border)', borderRadius: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                    {agent.role}
                  </span>
                  {agent.trinityWorldName && <span style={{ fontSize: '0.75rem', padding: '2px 8px', border: '1px solid var(--accent-purple)', borderRadius: '12px', color: 'var(--accent-purple)', fontWeight: 500 }}>{agent.trinityWorldName}</span>}
                  {agent.strategyPrimary && <span title={`Strategy contract v${agent.strategyVersion || 1}`} style={{ fontSize: '0.75rem', padding: '2px 8px', border: '1px solid var(--accent-blue)', borderRadius: '12px', color: 'var(--accent-blue)', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Route size={11} /> {agent.strategyPrimary.replaceAll('_', ' ')}</span>}
                  </div>

                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0 0 8px 0', maxWidth: '85%' }}>
                    {agent.currentTask || 'Standing by in operational swarm topology.'}
                  </p>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: agent.status === 'running' ? 'var(--success)' : 'var(--text-muted)' }}></div>
                      {agent.status}
                    </span>
                    <span>Node ID: {agent.id}</span>
                  </div>
                  <div style={{ marginTop: '10px', padding: '8px 10px', border: '1px solid var(--panel-border)', borderRadius: '4px', background: 'var(--bg-main)', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    <strong style={{ color: 'var(--text-primary)' }}>Last activity:</strong>{' '}
                    {activity[agent.id] ? `${activity[agent.id].event_type || activity[agent.id].action} — ${activity[agent.id].detail || 'No detail'} · ${activity[agent.id].created_at || ''}` : 'No execution event received yet.'}
                  </div>
                </div>

                {/* Right Side Actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button onClick={() => handlePing(agent.id, agent.name)} className="gh-btn" style={{ fontSize: '0.75rem', padding: '4px 12px' }}>
                    <Activity size={12} color="var(--text-muted)" /> Ping
                  </button>
                  <button onClick={() => { setSelectedAgentId(agent.id); onSelectAgent?.(); }} className="gh-btn gh-btn-primary" style={{ fontSize: '0.75rem', padding: '4px 12px' }}>
                    Inspect Profile
                  </button>
                  {agent.status === 'running' && <RBAC_Gate><button onClick={() => handleStop(agent)} className="gh-btn" style={{ fontSize: '0.75rem', padding: '4px 10px', color: 'var(--warning, #d29922)' }} title="Stop this agent">
                    <Square size={12} /> Stop
                  </button></RBAC_Gate>}
                  <RBAC_Gate><button onClick={() => handleDelete(agent)} className="gh-btn" style={{ fontSize: '0.75rem', padding: '4px 10px', color: 'var(--danger)' }} title={agent.status === 'running' ? 'Stop this agent before deleting it.' : 'Delete agent'}>
                    <Trash2 size={12} /> Delete
                  </button></RBAC_Gate>
                </div>

              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Proposal Modal */}
      {showProposalModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.6)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: '500px', background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', borderRadius: '6px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)' }}>New Biomimicry Quorum Proposal</h3>
            <input 
              type="text" 
              placeholder="Proposal title..."
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              style={{ padding: '8px 12px', background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '6px', color: 'var(--text-primary)', outline: 'none' }}
            />
            <textarea 
              placeholder="Detailed justification for swarm consensus vote..."
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              style={{ height: '100px', padding: '8px 12px', background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '6px', color: 'var(--text-primary)', outline: 'none', resize: 'none' }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button onClick={() => setShowProposalModal(false)} className="gh-btn">Cancel</button>
              <button onClick={handleCreateProposal} className="gh-btn gh-btn-primary" disabled={!newTitle}>Submit to Swarm</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default SwarmControlCenter;
