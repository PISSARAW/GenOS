import React, { useEffect, useState } from 'react';
import { GitCompare } from 'lucide-react';
import { api } from '../../api/client';

export const MultiBranchTreeDiff: React.FC = () => {
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [selectedBranchA, setSelectedBranchA] = useState('');
  const [selectedBranchB, setSelectedBranchB] = useState('');
  const [currentDiff, setCurrentDiff] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => { api.listWorkspaces().then((items: any[]) => {
    setWorkspaces(items || []);
    if (items?.length > 0) { setSelectedBranchA(items[0].id); setSelectedBranchB(items[1]?.id || items[0].id); }
  }).catch((e) => setError(e.message)); }, []);
  useEffect(() => { if (!selectedBranchA || !selectedBranchB) return; setError(''); api.getWorkspaceDiff(selectedBranchA, selectedBranchB).then(setCurrentDiff).catch((e) => { setCurrentDiff(null); setError(e.message); }); }, [selectedBranchA, selectedBranchB]);

  return (
    <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', borderRadius: '6px', overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '100%' }}>
      
      {/* Selector Header */}
      <div style={{ padding: '12px 16px', background: 'var(--bg-subtle)', borderBottom: '1px solid var(--panel-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <GitCompare size={16} color="var(--accent-blue)" />
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>N-Way Multi-Branch Tree Diff Engine</span>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <select 
            value={selectedBranchA} 
            onChange={(e) => setSelectedBranchA(e.target.value)} 
            style={{ padding: '4px 8px', background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.75rem' }}
          >
            {workspaces.map((w) => <option key={w.id} value={w.id}>base: {w.name}</option>)}
          </select>
          <span style={{ color: 'var(--text-muted)' }}>←</span>
          <select 
            value={selectedBranchB} 
            onChange={(e) => setSelectedBranchB(e.target.value)} 
            style={{ padding: '4px 8px', background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.75rem' }}
          >
            {workspaces.map((w) => (
              <option key={w.id} value={w.id}>compare: {w.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Diff Inspector */}
      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', flex: 1, overflowY: 'auto' }}>
        
        {error ? <div style={{ padding: '24px', color: 'var(--danger)' }}>{error}</div> : currentDiff?.diffEntries?.length ? <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '6px', padding: '10px 14px' }}>
          <div>
            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>{currentDiff.baseBranch} → {currentDiff.targetBranch}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              Files: <strong>{currentDiff.totalFilesChanged}</strong> · Additions: <strong>{currentDiff.totalAdditions}</strong> · Deletions: <strong>{currentDiff.totalDeletions}</strong>
            </div>
          </div>
        </div> : <div style={{ padding: '24px', color: 'var(--text-secondary)' }}>{workspaces.length < 2 ? 'Create a second workspace to compare branches.' : 'No recorded trajectory or snapshot diff for this workspace.'}</div>}

        {currentDiff?.diffEntries?.length > 0 && <div style={{ flex: 1, background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '6px', overflow: 'auto' }}>
          <div style={{ padding: '8px 12px', background: 'var(--bg-subtle)', borderBottom: '1px solid var(--panel-border)', fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
            Recorded changes
          </div>
          {currentDiff.diffEntries.map((entry: any, index: number) => <div key={`${entry.file}-${index}`} style={{ padding: '10px 12px', borderBottom: '1px solid var(--panel-border)', fontSize: '0.8rem' }}><strong>{entry.file}</strong> · {entry.category} · +{entry.additions} / -{entry.deletions} · {entry.author}{entry.notes ? ` · ${entry.notes}` : ''}</div>)}
        </div>}

      </div>

    </div>
  );
};
