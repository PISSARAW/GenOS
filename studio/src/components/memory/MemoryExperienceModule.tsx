import React, { useState } from 'react';
import { Database, Search, Award, GitFork } from 'lucide-react';
import { VectorSemanticSearch } from './VectorSemanticSearch';
import { GoldenPathCherryPicker } from './GoldenPathCherryPicker';
import { CounterfactualReplay } from './CounterfactualReplay';

export const MemoryExperienceModule: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'search' | 'cherrypick' | 'whatif'>('search');

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-main)' }}>
      
      {/* Top Header */}
      <div style={{ padding: '20px 32px', background: 'var(--bg-panel)', borderBottom: '1px solid var(--panel-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Database size={20} color="var(--accent-blue)" />
            <h1 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Memory & Episodic Experience Engine</h1>
          </div>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Vector cosine semantic recall, sub-trajectory golden path synthesis, and counterfactual What-If branching.
          </p>
        </div>

        {/* Tab Switcher */}
        <div style={{ display: 'flex', gap: '6px', background: 'var(--bg-main)', padding: '4px', borderRadius: '6px', border: '1px solid var(--panel-border)' }}>
          <button 
            onClick={() => setActiveTab('search')}
            style={{ 
              padding: '6px 14px', borderRadius: '4px', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px',
              background: activeTab === 'search' ? 'var(--bg-subtle)' : 'transparent',
              color: activeTab === 'search' ? 'var(--text-primary)' : 'var(--text-secondary)'
            }}
          >
            <Search size={14} /> Vector Semantic Search
          </button>
          <button 
            onClick={() => setActiveTab('cherrypick')}
            style={{ 
              padding: '6px 14px', borderRadius: '4px', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px',
              background: activeTab === 'cherrypick' ? 'var(--bg-subtle)' : 'transparent',
              color: activeTab === 'cherrypick' ? 'var(--text-primary)' : 'var(--text-secondary)'
            }}
          >
            <Award size={14} /> Golden Path Synthesis
          </button>
          <button 
            onClick={() => setActiveTab('whatif')}
            style={{ 
              padding: '6px 14px', borderRadius: '4px', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px',
              background: activeTab === 'whatif' ? 'var(--bg-subtle)' : 'transparent',
              color: activeTab === 'whatif' ? 'var(--text-primary)' : 'var(--text-secondary)'
            }}
          >
            <GitFork size={14} /> What-If Branching
          </button>
        </div>
      </div>

      {/* Main Tab Content */}
      <div style={{ flex: 1, padding: '24px 32px', overflowY: 'auto' }}>
        {activeTab === 'search' && <VectorSemanticSearch />}
        {activeTab === 'cherrypick' && <GoldenPathCherryPicker />}
        {activeTab === 'whatif' && <CounterfactualReplay />}
      </div>

    </div>
  );
};
