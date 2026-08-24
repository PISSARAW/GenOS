import React, { useState, useEffect, useCallback } from 'react';
import { Users, ThumbsUp, ThumbsDown, Plus, CheckCircle2 } from 'lucide-react';
import { api } from '../../api/client';
import { useToastStore } from '../../store/useToastStore';

const VOTER_ID_STORAGE_KEY = 'genos.quorumAgentId';
const DEFAULT_VOTER_ID = 'Operator_Command';
const POLL_INTERVAL_MS = 5000;

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

interface StatusBadge {
  label: string;
  color: string;
  background: string;
}

const getStatusBadge = (status: string): StatusBadge => {
  switch (status) {
    case 'passed':
      return { label: 'QUORUM REACHED', color: 'var(--success)', background: 'rgba(35, 134, 54, 0.15)' };
    case 'rejected':
      return { label: 'REJECTED', color: 'var(--danger)', background: 'rgba(248, 81, 73, 0.12)' };
    case 'expired':
      return { label: 'EXPIRED', color: '#8b949e', background: 'rgba(139, 148, 158, 0.12)' };
    case 'failed':
      return { label: 'FAILED', color: 'var(--danger)', background: 'rgba(248, 81, 73, 0.12)' };
    default:
      return { label: 'DELIBERATING', color: '#d29922', background: 'rgba(210, 153, 34, 0.15)' };
  }
};

const isDeliberating = (status: string): boolean =>
  status === 'open' || status === 'deliberating' || (!['passed', 'rejected', 'expired', 'failed'].includes(status));

export const QuorumConsensusLive: React.FC = () => {
  const [proposals, setProposals] = useState<SwarmProposal[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newThreshold, setNewThreshold] = useState('0.66');
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [voterId, setVoterId] = useState<string>(() => {
    try {
      return localStorage.getItem(VOTER_ID_STORAGE_KEY) || DEFAULT_VOTER_ID;
    } catch {
      return DEFAULT_VOTER_ID;
    }
  });
  const [votedProposalIds, setVotedProposalIds] = useState<Set<string>>(new Set());
  const showToast = useToastStore((state) => state.showToast);

  const fetchConsensus = useCallback(() => {
    api.getConsensus()
      .then((data: any) => {
        setError('');
        setLastUpdated(new Date());
        if (data?.proposals && Array.isArray(data.proposals)) {
          setProposals(data.proposals);
        } else if (Array.isArray(data)) {
          setProposals(data);
        } else {
          setProposals([]);
        }
      })
      .catch((err: any) => {
        setError(err?.message || 'Unable to load quorum data.');
      });
  }, []);

  useEffect(() => {
    fetchConsensus();
    const interval = setInterval(fetchConsensus, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchConsensus]);

  useEffect(() => {
    if (!showModal) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowModal(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showModal]);

  const handleVoterIdChange = (value: string) => {
    setVoterId(value);
    try {
      localStorage.setItem(VOTER_ID_STORAGE_KEY, value);
    } catch {}
  };

  const handleVote = async (proposalId: string, vote: 'yes' | 'no') => {
    try {
      await api.castVote({ proposalId, vote, agentId: voterId.trim() || DEFAULT_VOTER_ID });
      setVotedProposalIds((ids) => new Set(ids).add(proposalId));
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
        quorumThreshold: Number(newThreshold) || 0.66
      });
      showToast('success', 'Proposal Broadcasted', `Initiated quorum deliberation for "${newTitle}"`);
      setShowModal(false);
      setNewTitle('');
      setNewDesc('');
      setNewThreshold('0.66');
      fetchConsensus();
    } catch (e: any) {
      showToast('error', 'Proposal Error', e.message);
    }
  };

  return (
    <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', borderRadius: '6px', overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '100%' }}>

      <div style={{ padding: '10px 16px', background: 'var(--bg-subtle)', borderBottom: '1px solid var(--panel-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Users size={14} color="var(--success)" /> Live Quorum Consensus & Democratic Voting
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input
            type="text"
            placeholder="Your agent ID..."
            value={voterId}
            onChange={(e) => handleVoterIdChange(e.target.value)}
            title="Identity used when casting votes"
            style={{ width: '160px', padding: '3px 8px', background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '4px', color: 'var(--text-primary)', fontSize: '0.75rem', outline: 'none', fontFamily: 'monospace' }}
          />
          <button onClick={() => setShowModal(true)} className="gh-btn gh-btn-primary" style={{ fontSize: '0.75rem', padding: '2px 8px' }}>
            <Plus size={12} /> New Proposal
          </button>
        </div>
      </div>

      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', flex: 1, overflowY: 'auto' }}>
        {error && (
          <div style={{ padding: '8px 12px', border: '1px solid var(--danger)', borderRadius: '6px', background: 'rgba(248,81,73,0.08)', color: 'var(--danger)', fontSize: '0.8rem' }}>
            {error}{lastUpdated ? ' Showing last known data.' : ''}
          </div>
        )}
        {!error && proposals.length === 0 && <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)' }}>No quorum proposals recorded.</div>}
        {proposals.map((p) => {
          const thresholdPct = Math.round((p.quorumThreshold || 0.66) * 100);
          const badge = getStatusBadge(p.status);
          const canVote = isDeliberating(p.status) && !votedProposalIds.has(p.id);

          return (
            <div key={p.id} style={{ background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '6px', padding: '14px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>{p.title}</div>
                <span style={{
                  padding: '2px 8px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 600,
                  background: badge.background,
                  color: badge.color,
                  border: `1px solid ${badge.color}`
                }}>
                  {badge.label}
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
                  <div style={{ width: `${p.approvalRate}%`, height: '100%', background: p.status === 'passed' ? 'var(--success)' : badge.color === 'var(--danger)' ? 'var(--danger)' : 'var(--accent-blue)' }} />
                  {/* Threshold mark */}
                  <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${thresholdPct}%`, width: '2px', background: '#ffffff' }} />
                </div>
              </div>

              {/* Vote Buttons */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--panel-border)', paddingTop: '10px' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  Total Votes: <strong>{p.totalVotes}</strong> (Yes: {p.yesCount} · No: {p.noCount})
                </span>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  {votedProposalIds.has(p.id) && (
                    <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--success)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <CheckCircle2 size={12} /> voted
                    </span>
                  )}
                  <button onClick={() => handleVote(p.id, 'no')} disabled={!canVote} className="gh-btn" style={{ fontSize: '0.75rem', padding: '2px 8px', color: 'var(--danger)', opacity: canVote ? 1 : 0.5, cursor: canVote ? 'pointer' : 'not-allowed' }}>
                    <ThumbsDown size={12} /> Vote No
                  </button>
                  <button onClick={() => handleVote(p.id, 'yes')} disabled={!canVote} className="gh-btn gh-btn-primary" style={{ fontSize: '0.75rem', padding: '2px 8px', opacity: canVote ? 1 : 0.5, cursor: canVote ? 'pointer' : 'not-allowed' }}>
                    <ThumbsUp size={12} /> Vote Yes
                  </button>
                </div>
              </div>

            </div>
          );
        })}
      </div>

      <div style={{ padding: '6px 16px', borderTop: '1px solid var(--panel-border)', fontSize: '0.7rem', fontFamily: 'monospace', color: error ? 'var(--warning, #d29922)' : 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
        <span>Polling every {POLL_INTERVAL_MS / 1000}s</span>
        <span>{error && lastUpdated ? 'stale · ' : ''}last updated {lastUpdated ? lastUpdated.toLocaleTimeString() : '—'}</span>
      </div>

      {/* New Proposal Modal */}
      {showModal && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}
          style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.6)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
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
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Quorum threshold (0–1)
              <input
                type="number"
                min={0}
                max={1}
                step={0.01}
                value={newThreshold}
                onChange={(e) => setNewThreshold(e.target.value)}
                style={{ width: '90px', padding: '4px 8px', background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '4px', color: 'var(--text-primary)', fontSize: '0.8rem', outline: 'none', marginLeft: '8px' }}
              />
            </label>
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
