import React, { useState, useEffect } from 'react';
import { 
  Camera, Bot, GitPullRequest, AlertTriangle, ChevronDown, Settings, Plus, X
} from 'lucide-react';
import { WorkspaceDashboard } from './WorkspaceDashboard';
import { api } from '../api/client';
import { useToastStore } from '../store/useToastStore';

const EXTENSION_LANGUAGES: Record<string, string> = {
  ts: 'TypeScript', tsx: 'TypeScript', js: 'JavaScript', jsx: 'JavaScript',
  py: 'Python', rs: 'Rust', go: 'Go', java: 'Java', rb: 'Ruby',
  cs: 'C#', cpp: 'C++', cc: 'C++', c: 'C', swift: 'Swift', kt: 'Kotlin', php: 'PHP'
};

const guessLanguage = (workspace: any): string => {
  if (workspace.language) return workspace.language;
  const path = String(workspace.path || workspace.repoUrl || workspace.url || '');
  const dot = path.lastIndexOf('.');
  const slash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  if (dot <= slash) return '';
  return EXTENSION_LANGUAGES[path.slice(dot + 1).toLowerCase()] || '';
};

const parseTimestamp = (value: any): number | null => {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const parsed = Date.parse(String(value));
  return Number.isNaN(parsed) ? null : parsed;
};

const getWorkspaceTimestamp = (workspace: any): number | null =>
  parseTimestamp(workspace.updated ?? workspace.updatedAt ?? workspace.modified ?? workspace.lastModified);

const MutedDash: React.FC = () => <span style={{ color: 'var(--text-muted)' }}>—</span>;

export const WorkspacesList: React.FC<{
  selectedWorkspaceId?: string | null;
  onWorkspaceSelected?: (workspaceId: string | null) => void;
}> = ({ selectedWorkspaceId = null, onWorkspaceSelected }) => {
  const [activeFilter, setActiveFilter] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedWorkspace, setSelectedWorkspace] = useState<any>(null);
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [sortBy, setSortBy] = useState('Name');
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [showInitModal, setShowInitModal] = useState(false);
  const [newWsName, setNewWsName] = useState('');
  const [newWsDesc, setNewWsDesc] = useState('');
  const showToast = useToastStore((state) => state.showToast);

  const fetchWorkspaces = () => {
    api.listWorkspaces()
      .then((data) => {
        if (Array.isArray(data)) setWorkspaces(data);
        setFetchError(null);
      })
      .catch((e: any) => setFetchError(e?.message || 'Failed to load workspaces.'));
  };

  useEffect(() => {
    fetchWorkspaces();
  }, []);

  useEffect(() => {
    if (!selectedWorkspaceId) return;
    const workspace = workspaces.find((item) => item.id === selectedWorkspaceId);
    if (workspace) setSelectedWorkspace(workspace);
  }, [selectedWorkspaceId, workspaces]);

  const handleInit = async () => {
    if (!newWsName) return;
    try {
      await api.createWorkspace(newWsName, newWsDesc);
      showToast('success', 'Workspace Initialized', `Created new workspace "${newWsName}".`);
      setShowInitModal(false);
      setNewWsName('');
      setNewWsDesc('');
      fetchWorkspaces();
    } catch (e: any) {
      showToast('error', 'Initialization Failed', e.message);
    }
  };

  if (selectedWorkspace) {
    return <WorkspaceDashboard workspace={selectedWorkspace} onBack={() => { setSelectedWorkspace(null); onWorkspaceSelected?.(null); }} />;
  }

  const filters = ['All', 'Has agents', 'Has snapshots', 'Recently updated'];

  const RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

  let filteredWorkspaces = workspaces.filter((w) => {
    const title = w.title || w.name || '';
    const lang = guessLanguage(w);
    if (searchTerm && !title.toLowerCase().includes(searchTerm.toLowerCase()) && !lang.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    if (activeFilter === 'Has agents' && !(Number(w.agents) > 0)) return false;
    if (activeFilter === 'Has snapshots' && !(Number(w.snapshots) > 0)) return false;
    if (activeFilter === 'Recently updated') {
      const updated = getWorkspaceTimestamp(w);
      if (updated === null || Date.now() - updated > RECENT_WINDOW_MS) return false;
    }
    return true;
  });

  filteredWorkspaces = [...filteredWorkspaces].sort((a, b) => {
    if (sortBy === 'Name') {
      return (a.title || a.name || '').localeCompare(b.title || b.name || '');
    }
    const ta = getWorkspaceTimestamp(a);
    const tb = getWorkspaceTimestamp(b);
    if (ta === null && tb === null) return 0;
    if (ta === null) return 1;
    if (tb === null) return -1;
    return tb - ta;
  });

  return (
    <div style={{ width: '100%', height: '100%', overflowY: 'auto', background: 'var(--bg-main)' }}>
      
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
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {/* Top Search & Button */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--panel-border)', paddingBottom: '16px' }}>
            <div>
              <input 
                type="text" 
                placeholder="Find a workspace..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ width: '380px', padding: '6px 12px', fontSize: '0.85rem', border: '1px solid var(--panel-border)', borderRadius: '6px', outline: 'none', background: 'var(--bg-panel)', color: 'var(--text-primary)' }}
              />
            </div>
            <button className="gh-btn gh-btn-primary" onClick={() => setShowInitModal(true)} style={{ padding: '6px 16px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Plus size={14} /> Initialize Workspace
            </button>
          </div>

          {fetchError && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', border: '1px solid var(--danger)', borderRadius: '6px', color: 'var(--danger)', fontWeight: 600, fontSize: '0.85rem' }}>
              <span>{fetchError}</span>
              <button className="gh-btn" onClick={fetchWorkspaces}>Retry</button>
            </div>
          )}

          {/* List Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 600 }}>
            <div>{filteredWorkspaces.length} workspaces</div>
            <div 
              style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-secondary)', cursor: 'pointer' }}
              onClick={() => {
                const nextSort = sortBy === 'Name' ? 'Recently Updated' : 'Name';
                setSortBy(nextSort);
              }}
            >
              {sortBy} <ChevronDown size={14} />
            </div>
          </div>

          {/* Workspaces List */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {filteredWorkspaces.map((ws, i) => (
              <div 
                key={ws.id || ws.title || i}  
                className="hover-bg-gray"
                onClick={() => { setSelectedWorkspace(ws); onWorkspaceSelected?.(ws.id); }}
                style={{ 
                  display: 'flex', 
                  padding: '20px 0', 
                  borderTop: '1px solid var(--panel-border)', 
                  borderBottom: i === filteredWorkspaces.length - 1 ? '1px solid var(--panel-border)' : 'none',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  cursor: 'pointer'
                }} 
              >
                {/* Content */}
                <div style={{ flex: 1, paddingRight: '24px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <span style={{ fontSize: '1.15rem', fontWeight: 600, color: 'var(--accent-blue)' }} className="hover-underline">
                      {ws.title || ws.name}
                    </span>
                    <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '12px', border: '1px solid var(--panel-border)', color: 'var(--text-secondary)', fontWeight: 500 }}>
                      {ws.visibility || 'Public'}
                    </span>
                  </div>

                  {(ws.description || ws.summary) && (
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '8px', maxWidth: '800px', lineHeight: 1.5 }}>
                      {ws.description || ws.summary}
                    </div>
                  )}

                  {ws.tags && ws.tags.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                      {ws.tags.map((tag: string) => (
                        <span key={tag} style={{ fontSize: '0.75rem', padding: '2px 10px', borderRadius: '12px', background: 'var(--bg-subtle)', border: '1px solid var(--panel-border)', color: 'var(--accent-blue)', fontWeight: 500 }}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '16px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {guessLanguage(ws) ? (
                        <>
                          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#3178c6' }}></div> {guessLanguage(ws)}
                        </>
                      ) : (
                        <MutedDash />
                      )}
                    </span>

                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }} title="Snapshots">
                      <Camera size={14} /> {ws.snapshots != null ? Number(ws.snapshots).toLocaleString() : <MutedDash />}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }} title="Agents">
                      <Bot size={14} /> {ws.agents != null ? ws.agents : <MutedDash />}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }} title="Pending Trajectories">
                      <GitPullRequest size={14} /> {ws.trajectories != null ? ws.trajectories : <MutedDash />}
                    </span>
                    {(ws.anomalies > 0) && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--danger)' }} title="Anomalies">
                        <AlertTriangle size={14} /> {ws.anomalies}
                      </span>
                    )}

                    <span>{ws.updated ? `Updated ${ws.updated}` : 'No update timestamp'}</span>
                  </div>
                </div>

                {/* Right Area (Settings) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <Settings size={18} color="var(--text-muted)" aria-label="Workspace configuration is read-only" />
                </div>
              </div>
            ))}
          </div>

        </div>
      </div>

      {/* Initialize Workspace Modal */}
      {showInitModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.6)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: '480px', background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', borderRadius: '6px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)' }}>Initialize New Workspace</h3>
              <X size={16} color="var(--text-muted)" style={{ cursor: 'pointer' }} onClick={() => setShowInitModal(false)} />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>Workspace Name</label>
              <input 
                type="text" 
                placeholder="e.g. GenOS-Core-Module"
                value={newWsName}
                onChange={(e) => setNewWsName(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '6px', color: 'var(--text-primary)', outline: 'none' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>Description</label>
              <textarea 
                placeholder="Optional workspace description..."
                value={newWsDesc}
                onChange={(e) => setNewWsDesc(e.target.value)}
                style={{ width: '100%', height: '80px', padding: '8px 12px', background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '6px', color: 'var(--text-primary)', outline: 'none', resize: 'none' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button onClick={() => setShowInitModal(false)} className="gh-btn">Cancel</button>
              <button onClick={handleInit} className="gh-btn gh-btn-primary" disabled={!newWsName}>Initialize</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
