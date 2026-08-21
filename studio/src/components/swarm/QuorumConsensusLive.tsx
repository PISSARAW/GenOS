import React, { useState, useEffect } from 'react';
import { Users, ThumbsUp, ThumbsDown, Plus, Check } from 'lucide-react';
import { api } from '../../api/client';
import { useToastStore } from '../../store/useToastStore';

interface SwarmProposal {
  id: string;
  title: string;
  description: string;
  status: string;
  proposer: string;
  quorumThreshold: number;
  yesCount: number;
  noCount: number;
  totalVotes: number;
  approvalRate: number;
}

export const QuorumConsensusLive: React.FC = () => {
  const [proposals, setProposals] = useState<SwarmProposal[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState('');
  const showToast = useToastStore((state) => state.showToast);

  const fetchConsensus = () => {
    api.getConsensus()
      .then((data: any) => {
        setError('');
        if (data?.proposals && Array.isArray(data.proposals)) {
          setProposals(data.proposals);
        } else {
          setProposals([]);
        }
      })
      .catch((err: any) => {
        setError(err?.message || 'Unable to load quorum data.');
        setProposals([]);
      });
  };

  useEffect(() => {
    fetchConsensus();
  }, []);

  const handleVote = async (proposalId: string, vote: 'yes' | 'no') => {
    try {
      await api.castVote({ proposalId, vote, agentId: 'Operator_Command' });
      showToast('success', 'Vote Cast', `Recorded vote "${vote.toUpperCase()}" for proposal ${proposalId}`);
      fetchConsensus();
    } catch (e: any) {
      showToast('error', 'Vote Failed', e.message);
    }
  };

  const handleCreateProposal = async () => {
    if (!newTitle) return;
    try {
      await api.createProposal({
        title: newTitle,
        description: newDesc,
        quorumThreshold: 0.66
      });
      showToast('success', 'Proposal Broadcasted', `Initiated quorum deliberation for "${newTitle}"`);
      setShowModal(false);
      setNewTitle('');
      setNewDesc('');
      fetchConsensus();
    } catch (e: any) {
      showToast('error', 'Proposal Error', e.message);
    }
  };

  return (
    <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', borderRadius: '6px', overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '100%' }}>
      
      <div style={{ padding: '10px 16px', background: 'var(--bg-subtle)', borderBottom: '1px solid var(--panel-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Users size={14} color="var(--success)" /> Live Quorum Consensus & Democratic Voting
        </div>
        <button onClick={() => setShowModal(true)} className="gh-btn gh-btn-primary" style={{ fontSize: '0.75rem', padding: '2px 8px' }}>
          <Plus size={12} /> New Proposal
        </button>
      </div>

      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', flex: 1, overflowY: 'auto' }}>
        {error && <div style={{ color: 'var(--danger)', fontSize: '0.8rem' }}>{error}</div>}
        {!error && proposals.length === 0 && <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)' }}>No quorum proposals recorded.</div>}
        {proposals.map((p) => {
          const thresholdPct = Math.round((p.quorumThreshold || 0.66) * 100);
          const isPassed = p.status === 'passed';

          return (
            <div key={p.id} style={{ background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '6px', padding: '14px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>{p.title}</div>
                <span style={{ 
                  padding: '2px 8px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 600,
                  background: isPassed ? 'rgba(35, 134, 54, 0.15)' : 'rgba(210, 153, 34, 0.15)',
                  color: isPassed ? 'var(--success)' : '#d29922',
                  border: `1px solid ${isPassed ? 'var(--success)' : '#d29922'}`
                }}>
                  {isPassed ? 'QUORUM REACHED' : 'DELIBERATING'}
                </span>
              </div>

              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                {p.description}
              </div>

              {/* Supermajority Progress Bar */}
              <div style={{ marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '4px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Supermajority Progress ({p.approvalRate}%)</span>
                  <span style={{ color: 'var(--text-primary)' }}>Required: {thresholdPct}%</span>
                </div>
                <div style={{ width: '100%', height: '6px', background: 'var(--bg-panel)', borderRadius: '3px', overflow: 'hidden', position: 'relative' }}>
                  <div style={{ width: `${p.approvalRate}%`, height: '100%', background: isPassed ? 'var(--success)' : 'var(--accent-blue)' }} />
                  {/* Threshold mark */}
                  <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${thresholdPct}%`, width: '2px', background: '#ffffff' }} />
                </div>
              </div>

              {/* Vote Buttons */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--panel-border)', paddingTop: '10px' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  Total Votes: <strong>{p.totalVotes}</strong> (Yes: {p.yesCount} · No: {p.noCount})
                </span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => handleVote(p.id, 'no')} className="gh-btn" style={{ fontSize: '0.75rem', padding: '2px 8px', color: 'var(--danger)' }}>
                    <ThumbsDown size={12} /> Vote No
                  </button>
                  <button onClick={() => handleVote(p.id, 'yes')} className="gh-btn gh-btn-primary" style={{ fontSize: '0.75rem', padding: '2px 8px' }}>
                    <ThumbsUp size={12} /> Vote Yes
                  </button>
                </div>
              </div>

            </div>
          );
        })}
      </div>

      {/* New Proposal Modal */}
      {showModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.6)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: '440px', background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', borderRadius: '6px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}>Broadcast Swarm Quorum Proposal</h3>
            <input 
              type="text" 
              placeholder="Proposal title..."
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              style={{ width: '100%', padding: '6px 10px', background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none' }}
            />
            <textarea 
              placeholder="Technical justification and quorum parameters..."
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              style={{ width: '100%', height: '80px', padding: '6px 10px', background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none', resize: 'none' }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button onClick={() => setShowModal(false)} className="gh-btn">Cancel</button>
              <button onClick={handleCreateProposal} className="gh-btn gh-btn-primary" disabled={!newTitle}>Submit</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
