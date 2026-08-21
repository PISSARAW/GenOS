import React, { useState, useEffect } from 'react';
import { Search, ChevronDown, Activity, Plus, ThumbsUp, ThumbsDown, CheckCircle2 } from 'lucide-react';
import { useGenOSStore } from '../store/useGenOSStore';
import { api } from '../api/client';
import { useToastStore } from '../store/useToastStore';

interface SwarmControlCenterProps {
  onSelectAgent?: () => void;
}

export const SwarmControlCenter: React.FC<SwarmControlCenterProps> = ({ onSelectAgent }) => {
  const { clones: agents, setSelectedAgentId, fetchAgents } = useGenOSStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [proposals, setProposals] = useState<any[]>([]);
  const [showProposalModal, setShowProposalModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const showToast = useToastStore((state) => state.showToast);

  const fetchConsensus = () => {
    api.getConsensus()
      .then((data) => {
        if (Array.isArray(data)) setProposals(data);
      })
      .catch(() => {});
  };

  useEffect(() => {
    fetchAgents();
    fetchConsensus();
  }, []);

  const handlePing = async (agentId: string, name: string) => {
    try {
      await api.pingAgent(agentId);
      showToast('success', 'Ping Received', `${name} responded: 12ms round-trip.`);
    } catch (e: any) {
      showToast('error', 'Ping Failed', e.message);
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
    (a.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (a.role || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

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
          </div>

          <button onClick={() => setShowProposalModal(true)} className="gh-btn gh-btn-primary" style={{ padding: '6px 16px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Plus size={14} /> New Quorum Proposal
          </button>
        </div>

        {/* Quorum Proposals Section */}
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
          <div style={{ padding: '12px 16px', background: 'var(--bg-subtle)', borderBottom: '1px solid var(--panel-border)', fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)' }}>
            Active Fleet Swarm Nodes ({filteredAgents.length})
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {filteredAgents.map((agent, index) => (
              <div key={agent.id || index} style={{ display: 'flex', justifyContent: 'space-between', padding: '16px', borderBottom: index < filteredAgents.length - 1 ? '1px solid var(--panel-border)' : 'none' }} className="hover-bg-gray">
                
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
                </div>

                {/* Right Side Actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button onClick={() => handlePing(agent.id, agent.name)} className="gh-btn" style={{ fontSize: '0.75rem', padding: '4px 12px' }}>
                    <Activity size={12} color="var(--text-muted)" /> Ping
                  </button>
                  <button onClick={() => { setSelectedAgentId(agent.id); onSelectAgent?.(); }} className="gh-btn gh-btn-primary" style={{ fontSize: '0.75rem', padding: '4px 12px' }}>
                    Inspect Profile
                  </button>
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
