import React, { useEffect, useState } from 'react';
import { 
  ArrowLeft, Code, CircleDot, GitPullRequest, PlayCircle, History, 
  ShieldCheck, LayoutGrid, FileText, Folder, FolderOpen, ChevronRight, ChevronDown, Book, Activity, Settings
} from 'lucide-react';
import { WorkspaceTimeMachine } from './WorkspaceTimeMachine';
import { useToastStore } from '../store/useToastStore';
import { api } from '../api/client';

interface WorkspaceDashboardProps {
  workspace: any;
  onBack: () => void;
}

type WorkspaceFile = { name: string; type: string; message: string; time: string; status?: string };
type FileTreeNode = { name: string; path: string; folder: boolean; file?: WorkspaceFile; children: FileTreeNode[] };

function buildFileTree(files: WorkspaceFile[]): FileTreeNode[] {
  const root: FileTreeNode[] = [];
  for (const file of files) {
    let level = root;
    const parts = file.name.split('/');
    parts.forEach((part, index) => {
      const path = parts.slice(0, index + 1).join('/');
      let node = level.find(item => item.name === part);
      if (!node) {
        node = { name: part, path, folder: index < parts.length - 1, file: index === parts.length - 1 ? file : undefined, children: [] };
        level.push(node);
      }
      level = node.children;
    });
  }
  const sort = (nodes: FileTreeNode[]) => nodes.sort((a, b) => Number(b.folder) - Number(a.folder) || a.name.localeCompare(b.name));
  const walk = (nodes: FileTreeNode[]) => { sort(nodes); nodes.forEach(node => walk(node.children)); };
  walk(root);
  return root;
}

export const WorkspaceDashboard: React.FC<WorkspaceDashboardProps> = ({ workspace, onBack }) => {
  const [activeTab, setActiveTab] = useState('code');
  const [tabData, setTabData] = useState<any[]>([]);
  const [tabLoading, setTabLoading] = useState(false);
  const [tabError, setTabError] = useState('');
  const [tabReload, setTabReload] = useState(0);
  const showToast = useToastStore((state) => state.showToast);
  const workspaceKey = workspace?.id || workspace?.title || workspace?.name || '';

  const tabs = [
    { id: 'code', label: 'Code', icon: Code },
    { id: 'issues', label: 'Issues', icon: CircleDot },
    { id: 'pulls', label: 'Pull requests', icon: GitPullRequest },
    { id: 'actions', label: 'Actions', icon: PlayCircle },
    { id: 'projects', label: 'Projects', icon: LayoutGrid },
    { id: 'security', label: 'Security', icon: ShieldCheck },
    { id: 'timelines', label: 'GenOS Timelines', icon: History, highlight: true }
  ];

  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [readme, setReadme] = useState('');
  const [codeLoading, setCodeLoading] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const fileTree = buildFileTree(files);

  const renderFileTree = (nodes: FileTreeNode[], depth = 0): React.ReactNode => nodes.map(node => {
    const expanded = expandedFolders[node.path] ?? depth === 0;
    if (node.folder) {
      const hasChanges = node.children.some(child => child.file?.status && child.file.status !== 'clean') || node.children.some(child => child.folder && child.children.some(grandchild => grandchild.file?.status && grandchild.file.status !== 'clean'));
      return <React.Fragment key={node.path}>
        <button onClick={() => setExpandedFolders(current => ({ ...current, [node.path]: !expanded }))} style={{ display: 'flex', alignItems: 'center', gap: '6px', width: '100%', padding: '10px 16px', paddingLeft: `${16 + depth * 22}px`, border: 0, borderBottom: '1px solid var(--panel-border)', background: 'transparent', color: 'var(--text-primary)', textAlign: 'left', cursor: 'pointer', fontSize: '0.85rem' }} className="hover-bg-gray">
          {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          {expanded ? <FolderOpen size={16} color="#58a6ff" /> : <Folder size={16} color="#58a6ff" />}
          <span>{node.name}</span>{hasChanges && <span style={{ color: '#d29922', marginLeft: 4 }}>Git changes</span>}
        </button>
        {expanded && renderFileTree(node.children, depth + 1)}
      </React.Fragment>;
    }
    const file = node.file!;
    return <div key={node.path} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 16px', paddingLeft: `${38 + depth * 22}px`, borderBottom: '1px solid var(--panel-border)', fontSize: '0.85rem' }} className="hover-bg-gray">
      <FileText size={16} color="var(--text-muted)" />
      <span style={{ flex: 1, color: 'var(--text-primary)' }}>{node.name}</span>
      <span style={{ color: file.status !== 'clean' ? '#d29922' : 'var(--text-secondary)' }}>{file.status !== 'clean' ? `Git ${file.status}` : file.message}</span>
      <span style={{ width: '170px', textAlign: 'right', color: 'var(--text-muted)' }}>{file.time}</span>
    </div>;
  });

  useEffect(() => {
    let cancelled = false;
    setCodeLoading(true);
    api.getWorkspaceFiles(workspaceKey).then((result: any) => {
      if (cancelled) return;
      setFiles(Array.isArray(result?.files) ? result.files : []);
      setReadme(result?.readme || '');
    }).catch(() => {
      if (!cancelled) { setFiles([]); setReadme(''); }
    }).finally(() => { if (!cancelled) setCodeLoading(false); });
    return () => { cancelled = true; };
  }, [workspaceKey]);

  useEffect(() => {
    let cancelled = false;

    const loadTab = async () => {
      if (activeTab === 'code' || activeTab === 'timelines') return;
      setTabLoading(true);
      setTabError('');
      setTabData([]);

      try {
        let result: any;
        if (activeTab === 'issues') result = await api.getAlerts(workspaceKey);
        if (activeTab === 'pulls') result = await api.getPendingTrajectories(workspaceKey);
        if (activeTab === 'actions') result = await api.getTelemetryEvents(25);
        if (activeTab === 'projects') result = await api.listExperiments(workspaceKey);
        if (activeTab === 'security') result = await api.getSecurityStatus();

        if (!cancelled) {
          const rows = activeTab === 'actions'
            ? result?.events
            : activeTab === 'security'
              ? [result?.securityPosture]
              : Array.isArray(result) ? result : result?.items || result?.data || [];
          setTabData(Array.isArray(rows) ? rows.filter(Boolean) : []);
        }
      } catch (error: any) {
        if (!cancelled) setTabError(error?.message || 'Unable to load this section.');
      } finally {
        if (!cancelled) setTabLoading(false);
      }
    };

    loadTab();
    return () => { cancelled = true; };
  }, [activeTab, tabReload, workspaceKey]);

  const formatDate = (value: any) => value ? new Date(value).toLocaleString() : '—';

  const renderTabRows = () => {
    if (tabLoading) return <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading live data…</div>;
    if (tabError) return <div style={{ padding: '32px', color: 'var(--danger)', border: '1px solid var(--panel-border)', borderRadius: '6px' }}>{tabError}</div>;
    if (tabData.length === 0) return <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-secondary)' }}>No data is available for this workspace yet.</div>;

    const columns: Record<string, string[]> = {
      issues: ['title', 'status', 'severity', 'agent', 'workspace'],
      pulls: ['title', 'status', 'author', 'confidence', 'diffFile'],
      actions: ['event_type', 'action', 'agent_id', 'severity', 'created_at'],
      projects: ['title', 'type', 'status', 'chaosLevel', 'summary'],
      security: ['rbacEnforced', 'csrfProtection', 'xssSanitization', 'mcpCircuitBreaker', 'isHalted', 'quarantinedToolsCount']
    };
    const labels: Record<string, string> = { event_type: 'Event', agent_id: 'Agent', created_at: 'Time', diffFile: 'File', chaosLevel: 'Chaos', mcpCircuitBreaker: 'MCP breaker', isHalted: 'Halted', quarantinedToolsCount: 'Quarantined' };
    const fields = columns[activeTab] || [];

    return <div style={{ overflowX: 'auto', border: '1px solid var(--panel-border)', borderRadius: '6px', background: 'var(--bg-panel)' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
        <thead><tr>{fields.map(field => <th key={field} style={{ textAlign: 'left', padding: '12px 16px', color: 'var(--text-secondary)', background: 'var(--bg-subtle)', borderBottom: '1px solid var(--panel-border)', whiteSpace: 'nowrap' }}>{labels[field] || field}</th>)}</tr></thead>
        <tbody>{tabData.map((row, index) => <tr key={row.id || index} className="hover-bg-gray">{fields.map(field => {
          const value = row[field];
          const display = field === 'created_at' ? formatDate(value) : typeof value === 'boolean' ? (value ? 'Yes' : 'No') : value ?? '—';
          return <td key={field} style={{ padding: '12px 16px', color: 'var(--text-primary)', borderBottom: '1px solid var(--panel-border)', maxWidth: '360px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(display)}</td>;
        })}</tr>)}</tbody>
      </table>
    </div>;
  };

  return (
    <div style={{ width: '100%', height: '100%', overflowY: 'auto', background: 'var(--bg-main)' }}>
      {/* Header */}
      <div style={{ background: 'var(--bg-panel)', borderBottom: '1px solid var(--panel-border)', padding: '16px 32px 0 32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
          <button onClick={onBack} className="gh-btn" style={{ padding: '6px 8px' }}>
            <ArrowLeft size={16} />
          </button>
          <div style={{ width: '24px', height: '24px', borderRadius: '4px', background: '#1f6feb', display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'white', fontWeight: 'bold' }}>G</div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 400, color: 'var(--text-primary)', margin: 0 }}>
            {workspace.owner || 'workspace'}<span style={{ margin: '0 4px', color: 'var(--text-muted)' }}>/</span><span style={{ fontWeight: 600 }}>{workspace.title || workspace.name}</span>
          </h1>
          <span style={{ border: '1px solid var(--panel-border)', borderRadius: '12px', padding: '2px 8px', fontSize: '0.75rem', fontWeight: 500, color: 'var(--text-secondary)' }}>
            {workspace.visibility || 'Private'}
          </span>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto' }}>
          {tabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <div 
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{ 
                  display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', cursor: 'pointer',
                  borderBottom: isActive ? '2px solid #fd8c73' : '2px solid transparent',
                  color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                  fontWeight: isActive ? 600 : 400,
                  fontSize: '0.85rem'
                }}
                className="hover-bg-gray"
              >
                <Icon size={16} color={isActive ? "var(--text-primary)" : "var(--text-muted)"} /> 
                {tab.label}
                {tab.highlight && (
                  <span style={{ background: '#1f6feb', color: 'white', borderRadius: '12px', padding: '2px 6px', fontSize: '0.7rem', fontWeight: 600 }}>
                    New
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      <div style={{ padding: '24px 32px' }}>
        
        {activeTab === 'timelines' && (
          <div style={{ height: '600px', border: '1px solid var(--panel-border)', borderRadius: '6px', overflow: 'hidden' }}>
            <WorkspaceTimeMachine workspace={workspace} onBack={() => setActiveTab('code')} />
          </div>
        )}

        {activeTab === 'code' && (
          <div style={{ display: 'flex', gap: '24px', maxWidth: '1280px', margin: '0 auto' }}>
            {/* Left Column (Files) */}
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="gh-btn" style={{ background: 'var(--bg-subtle)' }}>
                    <GitPullRequest size={14} style={{ transform: 'rotate(90deg)' }} /> main
                  </button>
                  <button className="gh-btn" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <GitPullRequest size={14} /> 1 Branch
                  </button>
                  <button className="gh-btn" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Book size={14} /> 0 Tags
                  </button>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => showToast('info', 'File Search', 'Opening search index')} className="gh-btn">Go to file</button>
                  <button onClick={() => showToast('info', 'Add File', 'Opening file creator')} className="gh-btn">Add file</button>
                  <button onClick={() => showToast('info', 'Code Clone', 'https://github.com/GenOS/workspace.git')} className="gh-btn gh-btn-primary"><Code size={14} style={{ marginRight: '4px' }} /> Code</button>
                </div>
              </div>

              {/* Repo Box */}
              <div style={{ border: '1px solid var(--panel-border)', borderRadius: '6px', background: 'var(--bg-panel)' }}>
                <div style={{ padding: '16px', borderBottom: '1px solid var(--panel-border)', background: 'var(--bg-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderRadius: '6px 6px 0 0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
                    <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#1f6feb', display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'white', fontWeight: 'bold', fontSize: '11px' }}>S</div>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Commander</span>
                    <span style={{ color: 'var(--text-secondary)' }}>Repository metadata</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    <span>No commit metadata available</span>
                  </div>
                </div>

                {/* File List */}
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {codeLoading && <div style={{ padding: '32px 16px', color: 'var(--text-secondary)' }}>Loading workspace files…</div>}
                  {!codeLoading && files.length === 0 && <div style={{ padding: '32px 16px', color: 'var(--text-secondary)' }}>No modified files in this workspace.</div>}
                  {!codeLoading && files.length > 0 && renderFileTree(fileTree)}
                </div>
              </div>

              {/* Readme Box */}
              <div style={{ border: '1px solid var(--panel-border)', borderRadius: '6px', background: 'var(--bg-panel)', marginTop: '24px' }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--panel-border)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  <FileText size={16} color="var(--text-muted)"/> README.md
                </div>
                  <div style={{ padding: '32px', fontSize: '0.9rem', color: 'var(--text-primary)', lineHeight: 1.6 }}>
                  {readme ? <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>{readme}</pre> : <p style={{ color: 'var(--text-secondary)' }}>No README content is connected to the backend for this workspace.</p>}
                </div>
              </div>
            </div>

            {/* Right Sidebar */}
            <div style={{ width: '296px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div>
                <h2 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 16px 0', display: 'flex', justifyContent: 'space-between' }}>
                  About <Settings size={16} color="var(--text-muted)" className="cursor-pointer" onClick={() => showToast('info', 'Settings', 'Workspace configuration')}/>
                </h2>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: 1.5 }}>
                  {workspace.description || `The root source code for ${workspace.title || workspace.name}.`}
                </p>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '12px', cursor: 'pointer' }} className="hover-blue">
                  <Book size={16} color="var(--text-muted)" /> Readme
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '12px', cursor: 'pointer' }} className="hover-blue">
                  <ShieldCheck size={16} color="var(--text-muted)" /> Security Policy
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px', cursor: 'pointer' }} className="hover-blue">
                  <Activity size={16} color="var(--text-muted)" /> Activity
                </div>
              </div>

              <hr style={{ border: 'none', borderTop: '1px solid var(--panel-border)', margin: 0 }} />

              <div><h2 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Language</h2><p style={{ color: 'var(--text-secondary)' }}>{workspace.language || 'No language metadata available.'}</p></div>
            </div>
          </div>
        )}

        {/* Live backend-backed sections */}
        {activeTab !== 'timelines' && activeTab !== 'code' && (
          <div style={{ maxWidth: '1280px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h2 style={{ margin: 0, color: 'var(--text-primary)', textTransform: 'capitalize' }}>{activeTab === 'pulls' ? 'Pull requests' : activeTab}</h2>
                <p style={{ margin: '6px 0 0', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Live data from the GenOS backend for {workspace.title || workspace.name}.</p>
              </div>
              <button className="gh-btn" onClick={() => setTabReload((value) => value + 1)}>Refresh</button>
            </div>
            {renderTabRows()}
          </div>
        )}

      </div>
    </div>
  );
};
