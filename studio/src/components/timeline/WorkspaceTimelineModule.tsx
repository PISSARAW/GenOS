import React, { useState } from 'react';
import { GitBranch, GitCompare, Bug, RotateCcw } from 'lucide-react';
import { MultiBranchTreeDiff } from './MultiBranchTreeDiff';
import { CausalAnomalyBisection } from './CausalAnomalyBisection';
import { AtomicRollbackPreview } from './AtomicRollbackPreview';

export const WorkspaceTimelineModule: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'diff' | 'bisection' | 'rollback'>('diff');

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-main)' }}>
      
      {/* Top Header */}
      <div style={{ padding: '20px 32px', background: 'var(--bg-panel)', borderBottom: '1px solid var(--panel-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <GitBranch size={20} color="var(--accent-blue)" />
            <h1 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Workspace Timeline & Causal Incidents</h1>
          </div>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            N-Way temporal branch tree diffing, O(log N) causal anomaly bisection, and atomic rollback generator.
          </p>
        </div>

        {/* Tab Switcher */}
        <div style={{ display: 'flex', gap: '6px', background: 'var(--bg-main)', padding: '4px', borderRadius: '6px', border: '1px solid var(--panel-border)' }}>
          <button 
            onClick={() => setActiveTab('diff')}
            style={{ 
              padding: '6px 14px', borderRadius: '4px', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px',
              background: activeTab === 'diff' ? 'var(--bg-subtle)' : 'transparent',
              color: activeTab === 'diff' ? 'var(--text-primary)' : 'var(--text-secondary)'
            }}
          >
            <GitCompare size={14} /> Multi-Branch Diff
          </button>
          <button 
            onClick={() => setActiveTab('bisection')}
            style={{ 
              padding: '6px 14px', borderRadius: '4px', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px',
              background: activeTab === 'bisection' ? 'var(--bg-subtle)' : 'transparent',
              color: activeTab === 'bisection' ? 'var(--text-primary)' : 'var(--text-secondary)'
            }}
          >
            <Bug size={14} /> Causal Bisection
          </button>
          <button 
            onClick={() => setActiveTab('rollback')}
            style={{ 
              padding: '6px 14px', borderRadius: '4px', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px',
              background: activeTab === 'rollback' ? 'var(--bg-subtle)' : 'transparent',
              color: activeTab === 'rollback' ? 'var(--text-primary)' : 'var(--text-secondary)'
            }}
          >
            <RotateCcw size={14} /> Atomic Rollback
          </button>
        </div>
      </div>

      {/* Main Tab Content */}
      <div style={{ flex: 1, padding: '24px 32px', overflowY: 'auto' }}>
        {activeTab === 'diff' && <MultiBranchTreeDiff />}
        {activeTab === 'bisection' && <CausalAnomalyBisection />}
        {activeTab === 'rollback' && <AtomicRollbackPreview />}
      </div>

    </div>
  );
};
