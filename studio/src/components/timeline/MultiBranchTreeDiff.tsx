import React, { useState } from 'react';
import { GitCompare, GitBranch, FileCode, CheckCircle2, AlertCircle } from 'lucide-react';

interface DiffBranchItem {
  branchName: string;
  author: string;
  commitsCount: number;
  churnStats: string;
  astCategory: 'Syntax Addition' | 'Refactoring' | 'Security Hardening' | 'Breaking API';
  diffContent: string;
}

export const MultiBranchTreeDiff: React.FC = () => {
  const [selectedBranchA, setSelectedBranchA] = useState('main');
  const [selectedBranchB, setSelectedBranchB] = useState('feature/causal-bisection');

  const branches: DiffBranchItem[] = [
    {
      branchName: 'feature/causal-bisection',
      author: 'QA Specialist',
      commitsCount: 3,
      churnStats: '+42, -8 lines',
      astCategory: 'Security Hardening',
      diffContent: '+ export function bisectAnomalies(snapshots: Snapshot[]) {\n+   let low = 0, high = snapshots.length - 1;\n+   while (low <= high) {\n+     const mid = Math.floor((low + high) / 2);\n+     if (testInvariant(snapshots[mid])) low = mid + 1;\n+     else high = mid - 1;\n+   }\n+   return snapshots[low];\n+ }'
    },
    {
      branchName: 'refactor/modular-api',
      author: 'Frontend Worker 2',
      commitsCount: 5,
      churnStats: '+85, -64 lines',
      astCategory: 'Refactoring',
      diffContent: '- import { rawFetch } from "./fetch";\n+ import { api } from "./client";\n+ const status = await api.getStatus();'
    }
  ];

  const currentDiff = branches.find((b) => b.branchName === selectedBranchB) || branches[0];

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
            <option value="main">base: main</option>
            <option value="develop">base: develop</option>
          </select>
          <span style={{ color: 'var(--text-muted)' }}>←</span>
          <select 
            value={selectedBranchB} 
            onChange={(e) => setSelectedBranchB(e.target.value)} 
            style={{ padding: '4px 8px', background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.75rem' }}
          >
            {branches.map((b) => (
              <option key={b.branchName} value={b.branchName}>compare: {b.branchName}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Diff Inspector */}
      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', flex: 1, overflowY: 'auto' }}>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '6px', padding: '10px 14px' }}>
          <div>
            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>{currentDiff.branchName}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              Author: <strong>{currentDiff.author}</strong> · Commits: <strong>{currentDiff.commitsCount}</strong> · Churn: <span style={{ color: 'var(--success)' }}>{currentDiff.churnStats}</span>
            </div>
          </div>
          <span style={{ border: '1px solid var(--accent-blue)', color: 'var(--accent-blue)', background: 'rgba(56, 139, 253, 0.1)', padding: '2px 8px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 600 }}>
            {currentDiff.astCategory}
          </span>
        </div>

        <div style={{ flex: 1, background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '6px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '8px 12px', background: 'var(--bg-subtle)', borderBottom: '1px solid var(--panel-border)', fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
            src/services/causalBisection.ts
          </div>
          <pre style={{ margin: 0, padding: '14px', fontFamily: 'monospace', fontSize: '0.8rem', color: '#3fb950', lineHeight: 1.5, overflowX: 'auto', flex: 1 }}>
            {currentDiff.diffContent}
          </pre>
        </div>

      </div>

    </div>
  );
};
