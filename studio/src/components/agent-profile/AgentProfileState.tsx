import React, { useState } from 'react';
import { GitFork, ChevronDown, CheckCircle2, Code, Book, Folder, FileText, History, List } from 'lucide-react';
import { useToastStore } from '../../store/useToastStore';

interface FileItem {
  type: string;
  name: string;
  message: string;
  time: string;
}

interface AgentProfileStateProps {
  activeAgent: any;
  clonesCount: number;
  snapshotsCount: number;
  displayFiles: FileItem[];
  agentTraces: any[];
  agentTracesCount: number;
}

export const AgentProfileState: React.FC<AgentProfileStateProps> = ({
  activeAgent,
  clonesCount,
  snapshotsCount,
  displayFiles,
  agentTraces,
  agentTracesCount
}) => {
  const [dropdownId, setDropdownId] = useState<string | null>(null);
  const showToast = useToastStore((state) => state.showToast);
  const hasWorkspace = Boolean(activeAgent.workspaceId);

  const handleProtectContext = () => {
    showToast('success', 'Context Protected', 'Agent state is now protected from aggressive pruning.');
  };

  const handleOpenFile = (fileName: string) => {
    showToast('info', 'File Opened', `Opening ${fileName} in IDE inspector`);
  };

  const handleCopyCloneUrl = () => {
    navigator.clipboard?.writeText('https://github.com/GenOS/workspace.git');
    showToast('success', 'Copied', 'Workspace clone URL copied to clipboard.');
  };

  const summarizeTrace = (trace: any) => {
    const output = typeof trace.outputs === 'string'
      ? trace.outputs
      : trace.outputs ? JSON.stringify(trace.outputs) : '';
    const detail = output || trace.error || trace.name || 'Activity recorded';
    return `${trace.name || 'Action'}: ${detail}`.slice(0, 220);
  };

  const recentWork = [...agentTraces]
    .sort((a, b) => (b.startTime || 0) - (a.startTime || 0))
    .slice(0, 8);
  const workSummary = recentWork.length > 0
    ? recentWork.map(summarizeTrace)
    : ['No work activity has been recorded for this agent yet.'];

  return (
    <>
      <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', borderRadius: '6px', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px', fontSize: '0.9rem' }}>
            Agent context is unprotected
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Protect this agent's state from force-clearing or require human checks before merging trajectories.
          </div>
        </div>
        <button onClick={handleProtectContext} className="gh-btn">Protect context</button>
      </div>

      {!hasWorkspace && (
        <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', borderRadius: '6px', padding: '16px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
          This agent is autonomous and is not attached to a workspace. Workspace files, branches, snapshots, and clone actions are unavailable.
        </div>
      )}

      {hasWorkspace && <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ position: 'relative' }}>
            <button className="gh-btn" onClick={() => setDropdownId(dropdownId === 'branch' ? null : 'branch')}>
              <GitFork size={14} /> main <ChevronDown size={14} />
            </button>
            {dropdownId === 'branch' && (
              <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: '8px', width: '300px', background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', borderRadius: '6px', boxShadow: '0 8px 24px rgba(0,0,0,0.5)', zIndex: 100 }}>
                <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--panel-border)', fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)' }}>Switch branches/tags</div>
                <div style={{ padding: '8px', borderBottom: '1px solid var(--panel-border)' }}>
                  <input type="text" placeholder="Find or create a branch..." style={{ width: '100%', padding: '6px 8px', fontSize: '0.85rem', border: '1px solid var(--panel-border)', borderRadius: '4px', background: 'var(--bg-main)', color: 'var(--text-primary)' }} />
                </div>
                <div style={{ padding: '8px 0', fontSize: '0.85rem' }}>
                  <div className="hover-bg-gray" style={{ padding: '8px 32px', cursor: 'pointer', position: 'relative', color: 'var(--text-primary)' }} onClick={() => setDropdownId(null)}>
                    <CheckCircle2 size={14} color="var(--accent-blue)" style={{ position: 'absolute', left: '8px', top: '9px' }} />
                    <span style={{ fontWeight: 600 }}>main</span>
                  </div>
                  <div className="hover-bg-gray" style={{ padding: '8px 32px', cursor: 'pointer', color: 'var(--text-secondary)' }} onClick={() => setDropdownId(null)}>feature/optimize-topology</div>
                  <div className="hover-bg-gray" style={{ padding: '8px 32px', cursor: 'pointer', color: 'var(--text-secondary)' }} onClick={() => setDropdownId(null)}>hotfix/vulnerability-patch</div>
                </div>
              </div>
            )}
          </div>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}><strong>{clonesCount}</strong> Clones</span>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}><strong>{snapshotsCount}</strong> Snapshots</span>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="gh-btn" onClick={() => showToast('info', 'File Search', 'Opening workspace file index...')}>Go to file</button>
          
          <div style={{ position: 'relative' }}>
            <button className="gh-btn" onClick={() => setDropdownId(dropdownId === 'add' ? null : 'add')}>
              Add file <ChevronDown size={14} />
            </button>
            {dropdownId === 'add' && (
              <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '8px', width: '160px', background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', borderRadius: '6px', boxShadow: '0 8px 24px rgba(0,0,0,0.5)', zIndex: 100, fontSize: '0.85rem', padding: '8px 0' }}>
                <div className="hover-bg-gray" style={{ padding: '8px 16px', cursor: 'pointer', color: 'var(--text-primary)' }} onClick={() => { setDropdownId(null); showToast('info', 'Create File', 'Opening file creator'); }}>Create new file</div>
                <div className="hover-bg-gray" style={{ padding: '8px 16px', cursor: 'pointer', color: 'var(--text-primary)' }} onClick={() => { setDropdownId(null); showToast('info', 'Upload Files', 'Upload queue ready'); }}>Upload files</div>
                <div style={{ borderTop: '1px solid var(--panel-border)', margin: '4px 0' }}></div>
                <div className="hover-bg-gray" style={{ padding: '8px 16px', cursor: 'pointer', color: 'var(--text-primary)' }} onClick={() => { setDropdownId(null); showToast('info', 'Generate File', 'Agent generation initialized'); }}>Generate with Agent</div>
              </div>
            )}
          </div>

          <div style={{ position: 'relative' }}>
            <button className="gh-btn gh-btn-primary" onClick={() => setDropdownId(dropdownId === 'code' ? null : 'code')}>
              <Code size={14} /> Code <ChevronDown size={14} />
            </button>
            {dropdownId === 'code' && (
              <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '8px', width: '320px', background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', borderRadius: '6px', boxShadow: '0 8px 24px rgba(0,0,0,0.5)', zIndex: 100, fontSize: '0.85rem' }}>
                <div style={{ padding: '16px', borderBottom: '1px solid var(--panel-border)' }}>
                  <div style={{ fontWeight: 600, display: 'flex', gap: '8px', marginBottom: '8px', color: 'var(--text-primary)' }}>
                    <span style={{ borderBottom: '2px solid #fd8c73', paddingBottom: '4px' }}>Local</span>
                    <span style={{ color: 'var(--text-secondary)' }}>Codespaces</span>
                  </div>
                  <div style={{ marginBottom: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Clone</span>
                      <span style={{ color: 'var(--accent-blue)', cursor: 'pointer' }}>HTTPS</span>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input type="text" readOnly value="https://github.com/GenOS/workspace.git" style={{ flex: 1, padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--panel-border)', fontSize: '0.75rem', background: 'var(--bg-main)', color: 'var(--text-primary)' }} />
                      <button onClick={handleCopyCloneUrl} className="gh-btn" style={{ padding: '4px 8px' }}>Copy</button>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '8px' }}>Use GenOS CLI to link this workspace locally.</div>
                  </div>
                </div>
                <div onClick={() => { setDropdownId(null); showToast('info', 'GitHub Desktop', 'Protocol handler initiated'); }} className="hover-bg-gray" style={{ padding: '12px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--panel-border)', color: 'var(--text-primary)' }}>
                  <Code size={16} /> Open with GitHub Desktop
                </div>
                <div onClick={() => { setDropdownId(null); showToast('info', 'Download ZIP', 'Preparing archive download'); }} className="hover-bg-gray" style={{ padding: '12px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)' }}>
                  <Book size={16} /> Download ZIP
                </div>
              </div>
            )}
          </div>
        </div>
      </div>}

      {/* Repo Box (Locked Files) */}
      {hasWorkspace && <div style={{ border: '1px solid var(--panel-border)', borderRadius: '6px', background: 'var(--bg-panel)', overflow: 'hidden' }}>
        <div style={{ background: 'var(--bg-subtle)', padding: '16px', borderBottom: '1px solid var(--panel-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#1f6feb', display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'white', fontWeight: 'bold', fontSize: '10px' }}>
              {activeAgent.name.charAt(0)}
            </div>
            <strong style={{ color: 'var(--text-primary)' }}>{activeAgent.name}</strong>
            <span style={{ color: 'var(--text-secondary)' }}>{activeAgent.currentTask || 'Idle'}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--text-secondary)' }}>
            <span style={{ fontFamily: 'monospace' }}>{activeAgent.id.substring(0, 7)}</span>
            <span>now</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-primary)', fontWeight: 500 }}>
              <History size={14}/> {agentTracesCount || displayFiles.length} Actions
            </span>
          </div>
        </div>

        {/* Files List */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {displayFiles.map((file, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 16px', borderBottom: i < displayFiles.length - 1 ? '1px solid var(--panel-border)' : 'none', fontSize: '0.85rem' }} className="hover-bg-gray">
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '350px' }}>
                {file.type === 'folder' ? <Folder size={16} color="#58a6ff" /> : <FileText size={16} color="var(--text-muted)" />}
                <span onClick={() => handleOpenFile(file.name)} style={{ color: 'var(--text-primary)', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} className="hover-blue">{file.name}</span>
              </div>
              <div style={{ flex: 1, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: '16px' }}>{file.message}</div>
              <div style={{ width: '100px', textAlign: 'right', color: 'var(--text-muted)' }}>{file.time}</div>
            </div>
          ))}
        </div>
      </div>}

      {/* Readme Box (agent-generated working document) */}
      <div style={{ border: '1px solid var(--panel-border)', borderRadius: '6px', background: 'var(--bg-panel)', overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--panel-border)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
          <List size={16} color="var(--text-muted)"/> README.md
        </div>
        <div style={{ padding: '32px', fontSize: '0.9rem', color: 'var(--text-primary)', lineHeight: 1.6 }}>
          <h1 style={{ borderBottom: '1px solid var(--panel-border)', paddingBottom: '8px', margin: '0 0 16px 0', fontSize: '1.4rem' }}>{activeAgent.name}</h1>
          <p style={{ color: 'var(--text-secondary)' }}>{activeAgent.about || `Autonomous agent for ${activeAgent.role || 'GenOS operations'}.`}</p>

          <h2 style={{ borderBottom: '1px solid var(--panel-border)', paddingBottom: '8px', margin: '24px 0 16px 0', fontSize: '1.1rem' }}>Current mission</h2>
          <p style={{ color: 'var(--text-secondary)' }}>{activeAgent.currentTask || 'No active mission recorded.'}</p>

          <h2 style={{ borderBottom: '1px solid var(--panel-border)', paddingBottom: '8px', margin: '24px 0 16px 0', fontSize: '1.1rem' }}>Work history</h2>
          <ul style={{ margin: 0, paddingLeft: '24px', color: 'var(--text-secondary)' }}>
            {workSummary.map((entry, index) => <li key={`${entry}-${index}`}>{entry}</li>)}
          </ul>
          
          <h2 style={{ borderBottom: '1px solid var(--panel-border)', paddingBottom: '8px', margin: '24px 0 16px 0', fontSize: '1.1rem' }}>System Prompt & Specification</h2>
          <pre style={{ background: 'var(--bg-main)', padding: '16px', borderRadius: '6px', overflowX: 'auto', fontSize: '0.85rem', border: '1px solid var(--panel-border)', color: 'var(--text-primary)' }}>
{activeAgent.role ? `Role: ${activeAgent.role}\nIdentity: ${activeAgent.agentType || 'GenOS Node'}\nStatus: ${activeAgent.status}` : `System prompt fetched dynamically from the agent DNA...`}
          </pre>
        </div>
      </div>
    </>
  );
};
