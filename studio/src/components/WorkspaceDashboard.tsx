import React, { useState } from 'react';
import { 
  ArrowLeft, Code, CircleDot, GitPullRequest, PlayCircle, History, 
  ShieldCheck, LayoutGrid, FileText, Folder, Book, Activity, Settings
} from 'lucide-react';
import { WorkspaceTimeMachine } from './WorkspaceTimeMachine';
import { useToastStore } from '../store/useToastStore';

interface WorkspaceDashboardProps {
  workspace: any;
  onBack: () => void;
}

export const WorkspaceDashboard: React.FC<WorkspaceDashboardProps> = ({ workspace, onBack }) => {
  const [activeTab, setActiveTab] = useState('code');
  const showToast = useToastStore((state) => state.showToast);

  const tabs = [
    { id: 'code', label: 'Code', icon: Code },
    { id: 'issues', label: 'Issues', icon: CircleDot, count: 12 },
    { id: 'pulls', label: 'Pull requests', icon: GitPullRequest, count: 2 },
    { id: 'actions', label: 'Actions', icon: PlayCircle },
    { id: 'projects', label: 'Projects', icon: LayoutGrid },
    { id: 'security', label: 'Security', icon: ShieldCheck },
    { id: 'timelines', label: 'GenOS Timelines', icon: History, highlight: true }
  ];

  const files = [
    { name: '.agents', type: 'folder', message: 'Update GenOS strict visual rules', time: '1 hour ago' },
    { name: 'public', type: 'folder', message: 'Update favicon', time: '3 days ago' },
    { name: 'src', type: 'folder', message: 'Refactor UI to GitHub design', time: '12 mins ago' },
    { name: '.gitignore', type: 'file', message: 'Initial commit', time: '1 week ago' },
    { name: 'package.json', type: 'file', message: 'Update dependencies', time: '2 days ago' },
    { name: 'README.md', type: 'file', message: 'Add setup instructions', time: '1 week ago' },
  ];

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
            {workspace.owner || 'shadow-walker'}<span style={{ margin: '0 4px', color: 'var(--text-muted)' }}>/</span><span style={{ fontWeight: 600 }}>{workspace.title || workspace.name}</span>
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
                {tab.count !== undefined && (
                  <span style={{ background: 'var(--bg-subtle)', borderRadius: '12px', padding: '2px 6px', fontSize: '0.7rem', fontWeight: 500, border: '1px solid var(--panel-border)' }}>
                    {tab.count}
                  </span>
                )}
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
                    <span style={{ color: 'var(--text-secondary)' }} className="hover-blue cursor-pointer">Refactor UI to GitHub dark theme</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    <span>b4f91a2</span>
                    <span>12 minutes ago</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-primary)' }}><History size={14}/> 122 Commits</span>
                  </div>
                </div>

                {/* File List */}
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {files.map((f, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 16px', borderBottom: i < files.length - 1 ? '1px solid var(--panel-border)' : 'none', fontSize: '0.85rem' }} className="hover-bg-gray">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '200px' }}>
                        {f.type === 'folder' ? <Folder size={16} color="#58a6ff" /> : <FileText size={16} color="var(--text-muted)" />}
                        <span style={{ color: 'var(--text-primary)', cursor: 'pointer' }} className="hover-blue">{f.name}</span>
                      </div>
                      <div style={{ flex: 1, color: 'var(--text-secondary)' }} className="hover-blue cursor-pointer">{f.message}</div>
                      <div style={{ width: '100px', textAlign: 'right', color: 'var(--text-muted)' }}>{f.time}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Readme Box */}
              <div style={{ border: '1px solid var(--panel-border)', borderRadius: '6px', background: 'var(--bg-panel)', marginTop: '24px' }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--panel-border)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  <FileText size={16} color="var(--text-muted)"/> README.md
                </div>
                <div style={{ padding: '32px', fontSize: '0.9rem', color: 'var(--text-primary)', lineHeight: 1.6 }}>
                  <h1 style={{ borderBottom: '1px solid var(--panel-border)', paddingBottom: '8px', margin: '0 0 16px 0' }}>{workspace.title || workspace.name}</h1>
                  <p style={{ color: 'var(--text-secondary)' }}>Welcome to the {workspace.title || workspace.name} workspace.</p>
                  <p style={{ color: 'var(--text-secondary)' }}>This workspace is managed by <strong>GenOS Swarm Fleet</strong>. It is connected to the live telemetry stream and auto-resolves its own issues.</p>
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

              <div>
                <h2 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 16px 0' }}>Languages</h2>
                <div style={{ display: 'flex', gap: '2px', height: '8px', borderRadius: '4px', overflow: 'hidden', marginBottom: '8px' }}>
                  <div style={{ background: '#3178c6', width: '85%' }}></div>
                  <div style={{ background: '#f1e05a', width: '10%' }}></div>
                  <div style={{ background: '#563d7c', width: '5%' }}></div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><div style={{ width: 8, height: 8, borderRadius: '50%', background: '#3178c6' }}></div> TypeScript 85%</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><div style={{ width: 8, height: 8, borderRadius: '50%', background: '#f1e05a' }}></div> JavaScript 10%</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><div style={{ width: 8, height: 8, borderRadius: '50%', background: '#563d7c' }}></div> CSS 5%</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Fallback for other tabs */}
        {activeTab !== 'timelines' && activeTab !== 'code' && (
          <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            This section ({activeTab}) is operational in the GenOS Fleet.
          </div>
        )}

      </div>
    </div>
  );
};
