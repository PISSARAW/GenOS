import React, { useEffect, useState } from 'react';
import { GitCompare } from 'lucide-react';
import { api } from '../../api/client';

interface MultiBranchTreeDiffProps {
  workspaces: any[];
  workspaceId: string;
  onWorkspaceChange: (id: string) => void;
}

export const MultiBranchTreeDiff: React.FC<MultiBranchTreeDiffProps> = ({ workspaces, workspaceId, onWorkspaceChange }) => {
  const [selectedBranchA, setSelectedBranchA] = useState('');
  const [selectedBranchB, setSelectedBranchB] = useState('');
  const [currentDiff, setCurrentDiff] = useState<any>(null);
  const [error, setError] = useState('');
  const [expandedFiles, setExpandedFiles] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!workspaces.length) return;
    setSelectedBranchA((prev) => (prev && workspaces.some((w) => w.id === prev) ? prev : workspaceId || workspaces[0].id));
    setSelectedBranchB((prev) => (prev && workspaces.some((w) => w.id === prev) ? prev : workspaces[1]?.id || workspaces[0].id));
  }, [workspaces, workspaceId]);

  useEffect(() => {
    if (!selectedBranchA || !selectedBranchB) return;
    setError('');
    api.getWorkspaceDiff(selectedBranchA, selectedBranchB)
      .then(setCurrentDiff)
      .catch((e) => { setCurrentDiff(null); setError(e.message); });
  }, [selectedBranchA, selectedBranchB]);

  const toggleExpanded = (index: number) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index); else next.add(index);
      return next;
    });
  };

  const hasEnoughWorkspaces = workspaces.length >= 2;

  return (
    <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', borderRadius: '6px', overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* Selector Header */}
      <div style={{ padding: '12px 16px', background: 'var(--bg-subtle)', borderBottom: '1px solid var(--panel-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <GitCompare size={16} color="var(--accent-blue)" />
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>Recorded Workspace Diff</span>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <select
            value={selectedBranchA}
            onChange={(e) => { setSelectedBranchA(e.target.value); onWorkspaceChange(e.target.value); }}
            style={{ padding: '4px 8px', background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.75rem' }}
          >
            {!workspaces.length && <option value="">No workspaces available</option>}
            {workspaces.map((w) => <option key={w.id} value={w.id}>workspace A: {w.name}</option>)}
          </select>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }} aria-label={`comparing ${selectedBranchA || '—'} to ${selectedBranchB || '—'}`}>
            {workspaces.find((w) => w.id === selectedBranchA)?.name || selectedBranchA || '—'} → {workspaces.find((w) => w.id === selectedBranchB)?.name || selectedBranchB || '—'}
          </span>
          <select
            value={selectedBranchB}
            onChange={(e) => setSelectedBranchB(e.target.value)}
            style={{ padding: '4px 8px', background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.75rem' }}
          >
            {!workspaces.length && <option value="">No workspaces available</option>}
            {workspaces.map((w) => (
              <option key={w.id} value={w.id}>workspace B: {w.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Diff Inspector */}
      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', flex: 1, overflowY: 'auto' }}>

        {!hasEnoughWorkspaces ? (
          <div style={{ padding: '24px', color: 'var(--text-secondary)' }}>
            At least two workspaces are required to compute a diff. Create a second workspace to compare revisions — self-diffing a single workspace yields no changes.
          </div>
        ) : error ? (
          <div style={{ padding: '24px', color: 'var(--danger)' }}>{error}</div>
        ) : currentDiff?.diffEntries?.length ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '6px', padding: '10px 14px' }}>
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>{selectedBranchA} → {selectedBranchB}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  Files: <strong>{currentDiff.totalFilesChanged}</strong> · Additions: <strong>{currentDiff.totalAdditions}</strong> · Deletions: <strong>{currentDiff.totalDeletions}</strong>
                </div>
              </div>
            </div>

            <div style={{ flex: 1, background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '6px', overflow: 'auto' }}>
              <div style={{ padding: '8px 12px', background: 'var(--bg-subtle)', borderBottom: '1px solid var(--panel-border)', fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                Recorded changes
              </div>
              {currentDiff.diffEntries.map((entry: any, index: number) => {
                const expanded = expandedFiles.has(index);
                const churn = currentDiff.churnHeatmap?.find((c: any) => c.file === entry.file);
                const details = [
                  `Category: ${entry.category}`,
                  `Changes: +${entry.additions ?? 0} / -${entry.deletions ?? 0}`,
                  entry.author ? `Author: ${entry.author}` : null,
                  churn?.churnScore != null ? `Churn score: ${churn.churnScore}` : null,
                  entry.collisionRisk ? `Collision risk: ${entry.collisionRisk}` : null,
                  entry.notes ? `Notes: ${entry.notes}` : null
                ].filter(Boolean);
                return (
                  <div key={`${entry.file}-${index}`} style={{ borderBottom: '1px solid var(--panel-border)' }}>
                    <div
                      onClick={() => toggleExpanded(index)}
                      style={{ padding: '10px 12px', fontSize: '0.8rem', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                    >
                      <span><strong>{entry.file}</strong> · {entry.category} · +{entry.additions} / -{entry.deletions} · {entry.author}{entry.notes ? ` · ${entry.notes}` : ''}</span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{expanded ? '▲ Hide details' : '▼ Details'}</span>
                    </div>
                    {expanded && (
                      <div style={{ padding: '8px 12px 12px 24px', background: 'var(--bg-panel)', fontSize: '0.72rem', color: 'var(--text-secondary)', fontFamily: 'monospace', lineHeight: 1.6 }}>
                        {details.map((line, i) => <div key={i}>{line}</div>)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div style={{ padding: '24px', color: 'var(--text-secondary)' }}>No recorded trajectory or snapshot diff for this workspace.</div>
        )}

      </div>

    </div>
  );
};
