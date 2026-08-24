import React, { useState, useEffect } from 'react';
import { 
  BookOpen, Star, Users, MapPin, Database,
  Activity, Zap, UserCheck
} from 'lucide-react';
import { useGenOSStore } from '../store/useGenOSStore';
import { api } from '../api/client';
import { useToastStore } from '../store/useToastStore';

export const Dashboard: React.FC<{ onNavigate?: (view: string) => void; workspacesCount?: number | null }> = ({ onNavigate, workspacesCount = null }) => {
  const [data, setData] = useState<any>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [achievements, setAchievements] = useState<any[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [session, setSession] = useState<any>(null);
  const clones = useGenOSStore((state) => state.clones);
  const showToast = useToastStore((state) => state.showToast);

  useEffect(() => {
    api.getDashboard()
      .then((resData) => {
        setData(resData);
        setLoadError(null);
        if (resData?.profile?.username && !editName) {
          setEditName(resData.profile.username);
        }
      })
      .catch((e: any) => {
        setLoadError(e.message || 'Dashboard data unavailable.');
      });

    api.getAchievements()
      .then((ach) => {
        if (Array.isArray(ach)) setAchievements(ach);
      })
      .catch(() => {});

    api.getSession()
      .then(setSession)
      .catch(() => {});
  }, [isEditing]);

  const handleSaveProfile = async () => {
    try {
      await api.updateProfile(editName);
      showToast('success', 'Profile Updated', `Username set to ${editName}`);
    } catch (e: any) {
      showToast('error', 'Update Failed', e.message);
    }
    setIsEditing(false);
  };

  const serverStats = data?.stats || {};
  const activeAgents = data?.activeAgents ?? clones.filter((c) => c.status === 'running').length;
  const stats = {
    total_agents_created: clones.length || activeAgents,
    mutations: serverStats.total_actions ?? 0,
    total_snapshots: serverStats.total_snapshots ?? 0,
    total_tasks: serverStats.total_tasks ?? 0,
    total_swarms: serverStats.total_swarms ?? 0
  };

  const username = data?.profile?.username || 'Commander';
  // The backend field is `org` (`profile.org`); keep `organization` as a
  // tolerant fallback so alternate payloads still render.
  const org = data?.profile?.org || data?.profile?.organization || 'GenOS Fleet';
  const location = data?.profile?.location || 'Localhost Enclave (Sandboxed)';

  // Only claim elevated access when the backend actually confirmed it.
  const sessionRole: string | null = session?.user?.isAuthenticated ? session.user.role : null;

  const pinned = Array.isArray(data?.pinned) ? data.pinned : [];

  // 52-week activity heatmap
  const heatmapData = Array.from({ length: 364 }, (_, index) => {
    const value = Array.isArray(data?.heatmap) ? data.heatmap[index] : 0;
    return Number.isFinite(Number(value)) ? Number(value) : 0;
  });

  return (
    <div style={{ width: '100%', height: '100%', overflowY: 'auto', background: 'var(--bg-main)' }}>
      
      {/* Top Navigation Tabs */}
      <div style={{ borderBottom: '1px solid var(--panel-border)', background: 'var(--bg-panel)', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto', display: 'flex', gap: '16px', padding: '0 32px' }}>
          <div className="gh-tab" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 16px', borderBottom: '2px solid #fd8c73', color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}>
            <Activity size={16} color="var(--text-muted)" /> Dashboard
          </div>
          <div className="gh-tab" onClick={() => onNavigate?.('workspaces')} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 16px', color: 'var(--text-secondary)', fontSize: '0.85rem', cursor: 'pointer' }}>
            <Database size={16} color="var(--text-muted)" /> Workspaces <span style={{ background: 'var(--bg-subtle)', borderRadius: '12px', padding: '2px 6px', fontSize: '0.7rem', border: '1px solid var(--panel-border)' }}>{workspacesCount ?? '…'}</span>
          </div>
          <div className="gh-tab" onClick={() => onNavigate?.('active_experiments')} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 16px', color: 'var(--text-secondary)', fontSize: '0.85rem', cursor: 'pointer' }}>
            <Zap size={16} color="var(--text-muted)" /> Active Experiments
          </div>
        </div>
      </div>

      <div style={{ maxWidth: '1280px', margin: '32px auto', padding: '0 32px', display: 'flex', gap: '32px' }}>
        
        {/* Left Column (User Profile) */}
        <div style={{ width: '296px', flexShrink: 0 }}>
          
          {/* Identicon */}
          <div style={{ width: '296px', height: '296px', borderRadius: '6px', border: '1px solid var(--panel-border)', overflow: 'hidden', display: 'flex', justifyContent: 'center', alignItems: 'center', background: 'var(--bg-panel)', marginBottom: '16px' }}>
            <div style={{ width: '160px', height: '160px', display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '4px' }}>
              {[
                1,0,1,0,1,
                0,1,1,1,0,
                1,1,1,1,1,
                0,1,0,1,0,
                1,0,1,0,1
              ].map((fill, i) => (
                <div key={i} style={{ background: fill ? '#238636' : '#21262d', borderRadius: '2px' }} />
              ))}
            </div>
          </div>

          <h1 style={{ margin: 0, lineHeight: 1.25 }}>
            {isEditing ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input 
                  type="text" 
                  value={editName} 
                  onChange={(e) => setEditName(e.target.value)}
                  style={{ fontSize: '1.1rem', padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--panel-border)', background: 'var(--bg-panel)', color: 'var(--text-primary)' }}
                />
                <button className="gh-btn gh-btn-primary" onClick={handleSaveProfile} style={{ padding: '4px 12px' }}>Save</button>
              </div>
            ) : (
              <div style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--text-primary)' }}>{username}</div>
            )}
            <div style={{ fontSize: '1.15rem', fontWeight: 300, color: 'var(--text-secondary)' }}>{org}</div>
          </h1>

          <div style={{ marginTop: '16px', marginBottom: '16px' }}>
            {sessionRole ? (
              <span
                style={{
                  border: `1px solid ${sessionRole === 'admin' ? '#1f6feb' : 'var(--panel-border)'}`,
                  borderRadius: '12px',
                  padding: '4px 12px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: sessionRole === 'admin' ? 'var(--accent-blue)' : 'var(--text-secondary)',
                  background: sessionRole === 'admin' ? 'rgba(56, 139, 253, 0.1)' : 'var(--bg-subtle)',
                  display: 'inline-block'
                }}
              >
                {sessionRole === 'admin' ? 'Global Override Access Active' : `Authenticated: ${sessionRole}`}
              </span>
            ) : null}
          </div>

          {loadError && (
            <div style={{ border: '1px solid var(--danger)', borderRadius: '6px', padding: '12px', fontSize: '0.8rem', color: 'var(--danger)', marginBottom: '16px', background: 'rgba(248,81,73,0.08)' }}>
              {loadError}
            </div>
          )}

          <button className="gh-btn" style={{ width: '100%', marginBottom: '16px' }} onClick={() => setIsEditing(!isEditing)}>
            {isEditing ? 'Cancel editing' : 'Edit profile'}
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
            <Users size={16} color="var(--text-muted)" />
            <strong style={{ color: 'var(--text-primary)' }}>{activeAgents}</strong> Active Agents
            <span>·</span>
            <strong style={{ color: 'var(--text-primary)' }}>{stats.total_agents_created}</strong> Total Fleet
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '24px' }}>
            <MapPin size={16} color="var(--text-muted)" /> {location}
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid var(--panel-border)', margin: '24px 0' }} />

          <h2 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '16px' }}>Achievements</h2>
          
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            {achievements.map((ach: any) => (
              <div 
                key={ach.id} 
                style={{ 
                  width: '48px', height: '48px', borderRadius: '50%', 
                  background: 'var(--bg-subtle)', border: `1px solid ${ach.color || '#30363d'}`, 
                  display: 'flex', justifyContent: 'center', alignItems: 'center',
                  cursor: 'pointer'
                }} 
                title={`${ach.title} : ${ach.desc}`}
                onClick={() => showToast('info', ach.title, ach.desc)}
              >
                <Star size={20} color={ach.color || '#58a6ff'} />
              </div>
            ))}
          </div>

        </div>

        {/* Right Column (Pinned & Heatmap) */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '32px' }}>
          
          {/* Pinned Section */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '1rem', fontWeight: 400, color: 'var(--text-primary)', margin: 0 }}>Pinned Workspaces & Fleet</h2>
              <span onClick={() => showToast('info', 'Pins Configuration', 'Pins customized automatically by active swarm activity.')} style={{ fontSize: '0.85rem', color: 'var(--accent-blue)', cursor: 'pointer' }} className="hover-underline">Customize your pins</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              {pinned.map((repo: any) => (
                <div key={repo.id} style={{ border: '1px solid var(--panel-border)', borderRadius: '6px', padding: '16px', display: 'flex', flexDirection: 'column', background: 'var(--bg-panel)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <BookOpen size={16} color="var(--text-muted)" />
                      <span style={{ fontWeight: 600, color: 'var(--accent-blue)', cursor: 'pointer' }} className="hover-underline">{repo.name}</span>
                      <span style={{ border: '1px solid var(--panel-border)', borderRadius: '12px', padding: '2px 8px', fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Public</span>
                    </div>
                  </div>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0 0 16px 0', flex: 1 }}>{repo.status}</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#3178c6' }}></div> {repo.language}
                    </span>
                    <span>{repo.agents_count} Nodes</span>
                  </div>
                  <div style={{ width: '100%', height: '4px', background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '2px', marginTop: '12px', overflow: 'hidden' }}>
                    <div style={{ width: `${repo.progress}%`, height: '100%', background: 'var(--success)' }}></div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Delegation Heatmap Section */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '8px' }}>
              <h2 style={{ fontSize: '1rem', fontWeight: 400, color: 'var(--text-primary)', margin: 0 }}>{stats.mutations.toLocaleString()} mutations in the last year</h2>
              <span onClick={() => showToast('info', 'Contribution Settings', 'Activity counts aggregated from SQLite telemetry.')} style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>Contribution settings</span>
            </div>

            <div style={{ border: '1px solid var(--panel-border)', borderRadius: '6px', padding: '16px 32px', background: 'var(--bg-panel)' }}>
              
              <div style={{ overflowX: 'auto', paddingBottom: '16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(52, 1fr)', gap: '3px', width: 'max-content' }}>
                  {Array.from({ length: 52 }).map((_, colIndex) => (
                    <div key={colIndex} style={{ display: 'grid', gridTemplateRows: 'repeat(7, 1fr)', gap: '3px' }}>
                      {Array.from({ length: 7 }).map((_, rowIndex) => {
                        const val = heatmapData[colIndex * 7 + rowIndex];
                        // GitHub Dark Heatmap Palette
                        let bg = '#161b22'; // Level 0
                        if (val === 1) bg = '#0e4429';
                        if (val === 2) bg = '#006d32';
                        if (val === 3) bg = '#26a641';
                        if (val >= 4) bg = '#39d353';
                        
                        return (
                          <div 
                            key={rowIndex} 
                            style={{ width: '10px', height: '10px', background: bg, borderRadius: '2px', border: '1px solid rgba(255,255,255,0.03)' }} 
                            title={`${val} mutations recorded on this day`}
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                <span onClick={() => showToast('info', 'Mutation Metrics', 'Mutations represent causal git and memory transitions.')} className="hover-blue" style={{ cursor: 'pointer' }}>Learn how we count mutations</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  Less 
                  <div style={{ width: '10px', height: '10px', background: '#161b22', borderRadius: '2px', marginLeft: '4px', border: '1px solid #30363d' }}></div>
                  <div style={{ width: '10px', height: '10px', background: '#0e4429', borderRadius: '2px' }}></div>
                  <div style={{ width: '10px', height: '10px', background: '#006d32', borderRadius: '2px' }}></div>
                  <div style={{ width: '10px', height: '10px', background: '#26a641', borderRadius: '2px' }}></div>
                  <div style={{ width: '10px', height: '10px', background: '#39d353', borderRadius: '2px', marginRight: '4px' }}></div>
                  More
                </div>
              </div>

            </div>

            <div style={{ marginTop: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--panel-border)', paddingBottom: '8px', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 400, color: 'var(--text-primary)', margin: 0 }}>Delegation activity</h3>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>August 2026</span>
              </div>
              <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                GenOS generated {stats.total_snapshots.toLocaleString()} snapshots, completed {stats.total_tasks} tasks autonomously, and reached consensus across {stats.total_swarms} fleet swarms.
              </div>
            </div>

          </div>

        </div>

      </div>
    </div>
  );
};
