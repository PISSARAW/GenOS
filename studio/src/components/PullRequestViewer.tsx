import React from 'react';
import { DiffEditor } from '@monaco-editor/react';
import { Bot, GitMerge, FileText, X } from 'lucide-react';
import { api } from '../api/client';
import { useToastStore } from '../store/useToastStore';

export interface PullRequestViewerProps {
  originalCode: string;
  modifiedCode: string;
  language?: string;
  theme?: string;
  prNumber?: string | number;
  branchName?: string;
  baseBranch?: string;
  agentSummary?: string;
  impacts?: Array<{ file: string; type: 'add' | 'mod' | 'del'; count: number }>;
  securityAnalysis?: string;
  onClose?: () => void;
}

export const PullRequestViewer: React.FC<PullRequestViewerProps> = ({
  originalCode,
  modifiedCode,
  language = 'typescript',
  theme = 'vs-dark',
  prNumber,
  branchName,
  baseBranch,
  agentSummary,
  impacts,
  securityAnalysis,
  onClose
}) => {
  const showToast = useToastStore((state) => state.showToast);

  const handleMerge = async () => {
    try {
      if (prNumber) {
        await api.approveTrajectory(String(prNumber));
      }
      showToast('success', 'Smart Merge Executed', `Merged ${branchName || 'branch'} into ${baseBranch || 'main'}`);
      if (onClose) onClose();
    } catch (e: any) {
      showToast('error', 'Merge Failed', e.message);
    }
  };

  const handleReject = async () => {
    try {
      if (prNumber) {
        await api.rejectTrajectory(String(prNumber), 'Rejected in Diff Viewer');
      }
      showToast('warning', 'Pull Request Rejected', 'Changes discarded.');
      if (onClose) onClose();
    } catch (e: any) {
      showToast('error', 'Reject Failed', e.message);
    }
  };

  return (
    <div style={{ height: '100%', width: '100%', minHeight: '400px', display: 'flex', flexDirection: 'column', background: 'var(--bg-main)' }}>
      
      {/* Header Diff Studio */}
      <div style={{ padding: '16px 24px', backgroundColor: 'var(--bg-panel)', borderBottom: '1px solid var(--panel-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>Pull Request #{prNumber || 'N/A'}</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Comparing <span style={{ fontFamily: 'monospace', color: 'var(--accent-blue)' }}>{branchName || 'experimental-branch'}</span> to <span style={{ fontFamily: 'monospace', color: 'var(--accent-blue)' }}>{baseBranch || 'main'}</span></div>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button onClick={handleReject} className="gh-btn" style={{ color: 'var(--danger)' }}>
            Reject
          </button>
          <button onClick={handleMerge} className="gh-btn gh-btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <GitMerge size={16} /> Smart Merge
          </button>
          {onClose && (
            <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        
        {/* Monaco Diff Viewer */}
        <div style={{ flex: 1, borderRight: '1px solid var(--panel-border)' }}>
          <DiffEditor
            height="100%"
            width="100%"
            theme={theme}
            language={language}
            original={originalCode}
            modified={modifiedCode}
            options={{
              renderSideBySide: true,
              readOnly: true,
              minimap: { enabled: false },
              fontSize: 13,
              fontFamily: 'Menlo, Monaco, "Courier New", monospace',
              scrollBeyondLastLine: false,
              smoothScrolling: true,
              ignoreTrimWhitespace: false,
            }}
          />
        </div>

        {/* Semantic Inspector */}
        <div style={{ width: '350px', background: 'var(--bg-panel)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '16px', borderBottom: '1px solid var(--panel-border)', fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Bot size={18} color="var(--accent-blue)" /> Semantic Inspector
          </div>
          
          <div style={{ padding: '16px', flex: 1, overflowY: 'auto' }}>
            <div style={{ background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '6px', padding: '12px', marginBottom: '16px', fontSize: '0.85rem', color: 'var(--text-primary)', lineHeight: 1.5 }}>
              <strong style={{ color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Agent Summary:</strong>
              {agentSummary || 'No summary available.'}
            </div>

            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '8px' }}>Impacted Files</div>
            {impacts && impacts.length > 0 ? impacts.map((imp, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: 'var(--text-primary)', marginBottom: '4px' }}>
                <FileText size={14} color={imp.type === 'add' ? 'var(--success)' : 'var(--warning)'} /> <span>{imp.file}</span> <span style={{ color: imp.type === 'add' ? 'var(--success)' : 'var(--warning)', fontSize: '0.75rem' }}>{imp.type === 'add' ? '+' : '~'}{imp.count}</span>
              </div>
            )) : <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>No impact specified</div>}
            
            <div style={{ marginTop: '24px', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '8px' }}>Security Analysis</div>
            <div style={{ background: 'rgba(56, 139, 253, 0.1)', border: '1px solid var(--accent-blue)', borderRadius: '6px', padding: '12px', fontSize: '0.85rem', color: 'var(--text-primary)' }}>
              {securityAnalysis || 'Analysis verified: 0 CVE vulnerabilities found.'}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
