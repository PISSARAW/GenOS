import React from 'react';
import { GitFork, Folder, FileText, History, List } from 'lucide-react';

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
  const hasWorkspace = Boolean(activeAgent.workspaceId);

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
            Context protection unavailable
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            This deployment does not expose a persisted agent-context protection policy.
          </div>
        </div>
        <button disabled title="No backend endpoint is available to persist agent-context protection." className="gh-btn">Unavailable</button>
      </div>

      {!hasWorkspace && (
        <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', borderRadius: '6px', padding: '16px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
          This agent is autonomous and is not attached to a workspace. Workspace files, branches, snapshots, and clone actions are unavailable.
        </div>
      )}

      {hasWorkspace && <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button disabled title="This backend does not expose workspace branch or tag management." className="gh-btn">
            <GitFork size={14} /> Branches unavailable
          </button>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}><strong>{clonesCount}</strong> Clones</span>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}><strong>{snapshotsCount}</strong> Snapshots</span>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button disabled title="File creation and upload are not exposed by this workspace backend." className="gh-btn">Add file unavailable</button>
          <span title="Workspace sources are read-only in this view." className="gh-btn gh-btn-primary" style={{ cursor: 'default' }}>Read-only workspace</span>
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
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 16px', borderBottom: i < displayFiles.length - 1 ? '1px solid var(--panel-border)' : 'none', fontSize: '0.85rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '350px' }}>
                {file.type === 'folder' ? <Folder size={16} color="#58a6ff" /> : <FileText size={16} color="var(--text-muted)" />}
                <span style={{ color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
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
{activeAgent.role ? `Role: ${activeAgent.role}\nIdentity: ${activeAgent.agentType || 'GenOS Node'}\nStatus: ${activeAgent.status}` : 'No agent role or system specification is available.'}
          </pre>
        </div>
      </div>
    </>
  );
};
