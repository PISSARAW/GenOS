import React, { useState, useEffect } from 'react';
import { 
  GitCommit, Search, ChevronDown, ShieldCheck, FastForward, Brain,
  X, XSquare, CheckSquare, MessageSquareWarning
} from 'lucide-react';
import { api } from '../api/client';
import { useToastStore } from '../store/useToastStore';

export const PendingTrajectories: React.FC = () => {
  const [activeFilter, setActiveFilter] = useState('Global Validation Queue');
  const [selectedTrajectory, setSelectedTrajectory] = useState<any>(null);
  const [pendingList, setPendingList] = useState<any[]>([]);
  const [activeList, setActiveList] = useState<any[]>([]);
  const [query, setQuery] = useState('');
  const showToast = useToastStore((state) => state.showToast);

  const fetchTrajectories = () => {
    api.getPendingTrajectories()
      .then((data) => {
        if (Array.isArray(data)) setPendingList(data);
      })
      .catch(() => {});

    api.getActiveTrajectories()
      .then((data) => {
        if (Array.isArray(data)) setActiveList(data);
      })
      .catch(() => {});
  };

  useEffect(() => {
    fetchTrajectories();
  }, []);

  const handleApprove = async (id: string) => {
    try {
      await api.approveTrajectory(id);
      showToast('success', 'Trajectory Approved', 'The trajectory status was persisted as approved. No repository merge was executed.');
      setSelectedTrajectory(null);
      fetchTrajectories();
    } catch (e: any) {
      showToast('error', 'Approval Failed', e.message);
    }
  };

  const handleReject = async (id: string) => {
    try {
      await api.rejectTrajectory(id, 'Rejected by Fleet Commander review');
      showToast('warning', 'Trajectory Rejected', 'The trajectory status was persisted as rejected.');
      setSelectedTrajectory(null);
      fetchTrajectories();
    } catch (e: any) {
      showToast('error', 'Reject Failed', e.message);
    }
  };

  const handleRevise = async (id: string) => {
    try {
      await api.reviseTrajectory(id, 'Please add comprehensive automated test assertions');
      showToast('info', 'Revision Requested', 'Feedback dispatched to the subagent.');
      setSelectedTrajectory(null);
      fetchTrajectories();
    } catch (e: any) {
      showToast('error', 'Revision Request Failed', e.message);
    }
  };

  const filters = [
    'Global Validation Queue',
    'Human Overrides',
    'Requires Fleet Commander Approval',
    'Adversarial Tie-Breaks'
  ];

  const matchesQuery = (trajectory: any) => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return true;
    return [trajectory.title, trajectory.summary, trajectory.author, trajectory.status]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(normalized));
  };
  const matchesFilter = (trajectory: any) => {
    if (activeFilter === 'Requires Fleet Commander Approval') return trajectory.status === 'pending';
    if (activeFilter === 'Adversarial Tie-Breaks') return Boolean(trajectory.isExceptional);
    if (activeFilter === 'Human Overrides') return Boolean(trajectory.qaFeedback);
    return true;
  };
  const visiblePending = pendingList.filter((trajectory) => matchesQuery(trajectory) && matchesFilter(trajectory));
  const visibleActive = activeList.filter((trajectory) => matchesQuery(trajectory) && matchesFilter(trajectory));

  return (
    <div style={{ width: '100%', height: '100%', overflowY: 'auto', background: 'var(--bg-main)', position: 'relative' }}>
      
      <div style={{ maxWidth: '1280px', margin: '32px auto', padding: '0 32px', display: 'flex', gap: '32px' }}>
        
        {/* Left Sidebar Filters */}
        <div style={{ width: '256px', flexShrink: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '24px', background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', borderRadius: '6px', padding: '8px' }}>
            {filters.map((f) => (
              <div 
                key={f}
                onClick={() => setActiveFilter(f)}
                style={{ 
                  padding: '8px 12px', 
                  cursor: 'pointer', 
                  borderRadius: '6px', 
                  fontSize: '0.85rem', 
                  color: activeFilter === f ? 'var(--text-primary)' : 'var(--text-secondary)', 
                  background: activeFilter === f ? 'var(--bg-subtle)' : 'transparent', 
                  fontWeight: activeFilter === f ? 600 : 400
                }}
              >
                {f}
              </div>
            ))}
          </div>
        </div>

        {/* Main List Area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Top Search */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <input 
                type="text" 
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search trajectories..."
                style={{ width: '100%', padding: '6px 12px 6px 32px', fontSize: '0.85rem', border: '1px solid var(--panel-border)', borderRadius: '6px', outline: 'none', background: 'var(--bg-panel)', color: 'var(--text-primary)' }}
              />
              <Search size={14} color="var(--text-muted)" style={{ position: 'absolute', left: '10px', top: '8px' }} />
            </div>
          </div>

          {/* Needs your review Box */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <ChevronDown size={16} color="var(--text-secondary)" />
              <h2 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Needs your review</h2>
              <span style={{ background: 'var(--bg-subtle)', border: '1px solid var(--panel-border)', borderRadius: '12px', padding: '2px 8px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{visiblePending.length}</span>
            </div>
            
            <div style={{ border: '1px solid var(--panel-border)', borderRadius: '6px', background: 'var(--bg-panel)', overflow: 'hidden' }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {visiblePending.length === 0 && <div style={{ padding: '16px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No pending trajectories recorded.</div>}
                {visiblePending.map((traj, i) => (
                  <div 
                    key={traj.id || i} 
                    onClick={() => setSelectedTrajectory(traj)}
                    style={{ display: 'flex', padding: '16px', borderBottom: i < pendingList.length - 1 ? '1px solid var(--panel-border)' : 'none', gap: '12px', cursor: 'pointer' }} 
                    className="hover-bg-gray"
                  >
                    <div style={{ paddingTop: '2px' }}>
                      <GitCommit size={18} color={traj.isExceptional ? '#d29922' : 'var(--text-secondary)'} />
                    </div>

                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
                        {traj.title}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        Author: <span style={{ fontWeight: 500 }}>{traj.author}</span>
                        <span> · Status: </span><span style={{ fontWeight: 500 }}>{traj.status}</span>
                        <span> · Updated {traj.createdAt ? new Date(traj.createdAt).toLocaleTimeString() : 'Recently'}</span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end', justifyContent: 'center' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        {traj.status === 'pending' ? 'Awaiting approval' : traj.status}
                      </div>
                      <div style={{ display: 'flex', gap: '12px', marginTop: '4px' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: (traj.adversarialResult || '').includes('Passed') ? 'var(--success)' : 'var(--danger)' }}>
                          <ShieldCheck size={14} /> {traj.adversarialResult || 'Not recorded'}
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: traj.futureCiResult === 'Clean' ? 'var(--success)' : 'var(--text-muted)' }}>
                          <FastForward size={14} /> {traj.futureCiResult || 'Not recorded'}
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: 'var(--accent-blue)' }}>
                          <Brain size={14} /> {traj.confidence ?? 'Not recorded'}
                        </span>
                      </div>
                    </div>

                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Active / Thinking Trajectories Box */}
          <div style={{ marginTop: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <ChevronDown size={16} color="var(--text-secondary)" />
              <h2 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Active / Thinking Trajectories</h2>
              <span style={{ background: 'var(--bg-subtle)', border: '1px solid var(--panel-border)', borderRadius: '12px', padding: '2px 8px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{visibleActive.length}</span>
            </div>
            
            <div style={{ border: '1px solid var(--panel-border)', borderRadius: '6px', background: 'var(--bg-panel)', overflow: 'hidden' }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {visibleActive.length === 0 && <div style={{ padding: '16px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No active trajectories recorded.</div>}
                {visibleActive.map((traj, i) => (
                  <div key={traj.id || i} style={{ display: 'flex', padding: '16px', gap: '12px', cursor: 'pointer', borderBottom: i < activeList.length - 1 ? '1px solid var(--panel-border)' : 'none' }} className="hover-bg-gray">
                    <div style={{ paddingTop: '2px' }}>
                      <GitCommit size={18} color={traj.status === 'active' ? 'var(--success)' : 'var(--text-secondary)'} />
                    </div>

                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
                        {traj.title}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        Author: <span style={{ fontWeight: 500 }}>{traj.author}</span>
                        <span> · {traj.status}</span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: traj.status === 'active' ? 'var(--success)' : 'var(--text-secondary)', marginRight: '8px' }}></div>
                      {traj.status}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Drawer Panel */}
      {selectedTrajectory && (
        <>
          <div onClick={() => setSelectedTrajectory(null)} style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.6)', zIndex: 100 }} />
          <div style={{ 
            position: 'fixed', top: 0, right: 0, width: '800px', height: '100vh', 
            background: 'var(--bg-panel)', zIndex: 101, boxShadow: '-8px 0 32px rgba(0,0,0,0.5)',
            borderLeft: '1px solid var(--panel-border)',
            display: 'flex', flexDirection: 'column'
          }}>
            <div style={{ padding: '24px 32px', borderBottom: '1px solid var(--panel-border)', background: 'var(--bg-panel)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h2 style={{ fontSize: '1.25rem', margin: '0 0 8px 0', color: 'var(--text-primary)' }}>{selectedTrajectory.title}</h2>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', gap: '16px' }}>
                  <span><span style={{ fontWeight: 600 }}>{selectedTrajectory.author}</span> proposes this merge</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--accent-blue)' }}><Brain size={14} /> Confidence: {selectedTrajectory.confidence ?? 'Not recorded'}</span>
                </div>
              </div>
              <button onClick={() => setSelectedTrajectory(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--text-muted)' }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ flex: 1, padding: '32px', overflowY: 'auto' }}>
              <div style={{ border: '1px solid var(--panel-border)', borderRadius: '6px', background: 'var(--bg-main)', marginBottom: '24px' }}>
                <div style={{ background: 'var(--bg-subtle)', padding: '12px 16px', borderBottom: '1px solid var(--panel-border)', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  Semantic Summary
                </div>
                <div style={{ padding: '16px', fontSize: '0.9rem', color: 'var(--text-primary)', lineHeight: 1.5 }}>
                  <p style={{ marginTop: 0 }}>{selectedTrajectory.summary || 'No semantic summary recorded.'}</p>
                  <p style={{ marginBottom: 0 }}><strong>Adversarial QA Feedback:</strong> {selectedTrajectory.qaFeedback || 'Not recorded.'}</p>
                </div>
              </div>

              {/* Diff Area */}
              <div style={{ border: '1px solid var(--panel-border)', borderRadius: '6px', background: 'var(--bg-main)' }}>
                <div style={{ background: 'var(--bg-subtle)', padding: '12px 16px', borderBottom: '1px solid var(--panel-border)', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', justifyContent: 'space-between' }}>
                  <span>{selectedTrajectory.diffFile || 'Diff file not recorded'}</span>
                  <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>{selectedTrajectory.diffStats || 'Stats not recorded'}</span>
                </div>
                <div style={{ padding: '16px', fontFamily: 'monospace', fontSize: '0.85rem', whiteSpace: 'pre', overflowX: 'auto', lineHeight: 1.5 }}>
                  {(selectedTrajectory.diffLines || []).length === 0 && <div style={{ color: 'var(--text-secondary)' }}>No diff lines recorded.</div>}
                  {(selectedTrajectory.diffLines || []).map((line: any, i: number) => (
                    <div key={i} style={{ 
                      color: line.type === 'removed' ? '#f85149' : '#3fb950', 
                      background: line.type === 'removed' ? 'rgba(248,81,73,0.1)' : 'rgba(35,134,54,0.1)', 
                      padding: '0 8px' 
                    }}>
                      {line.text}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ padding: '20px 32px', borderTop: '1px solid var(--panel-border)', background: 'var(--bg-subtle)', display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button onClick={() => handleReject(selectedTrajectory.id)} className="gh-btn" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--danger)', borderColor: 'var(--danger)' }}>
                <XSquare size={16} /> Reject & Punish
              </button>
              <button onClick={() => handleRevise(selectedTrajectory.id)} className="gh-btn" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <MessageSquareWarning size={16} /> Request Revision
              </button>
              <button onClick={() => handleApprove(selectedTrajectory.id)} className="gh-btn gh-btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckSquare size={16} /> Approve & Merge
              </button>
            </div>
          </div>
        </>
      )}

    </div>
  );
};
