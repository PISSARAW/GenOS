import React, { useState } from 'react';
import { Package, GitBranch, BarChart3, Shuffle } from 'lucide-react';
import { PhylogeneticMutationTree } from './PhylogeneticMutationTree';
import { AlleleFrequencyAnalyzer } from './AlleleFrequencyAnalyzer';
import { GeneticCrossoverSynthesizer } from './GeneticCrossoverSynthesizer';

export const GenomeFactoryModule: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'phylogeny' | 'alleles' | 'crossover'>('phylogeny');

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-main)' }}>
      
      {/* Top Header */}
      <div style={{ padding: '20px 32px', background: 'var(--bg-panel)', borderBottom: '1px solid var(--panel-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Package size={20} color="var(--accent-purple)" />
            <h1 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Genome Factory & Chromosome Tree</h1>
          </div>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Cognitive DNA management, phylogenetic mutation trees, allele frequency analytics, and genetic recombination.
          </p>
        </div>

        {/* Tab Switcher */}
        <div style={{ display: 'flex', gap: '6px', background: 'var(--bg-main)', padding: '4px', borderRadius: '6px', border: '1px solid var(--panel-border)' }}>
          <button 
            onClick={() => setActiveTab('phylogeny')}
            style={{ 
              padding: '6px 14px', borderRadius: '4px', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px',
              background: activeTab === 'phylogeny' ? 'var(--bg-subtle)' : 'transparent',
              color: activeTab === 'phylogeny' ? 'var(--text-primary)' : 'var(--text-secondary)'
            }}
          >
            <GitBranch size={14} /> Phylogenetic Tree
          </button>
          <button 
            onClick={() => setActiveTab('alleles')}
            style={{ 
              padding: '6px 14px', borderRadius: '4px', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px',
              background: activeTab === 'alleles' ? 'var(--bg-subtle)' : 'transparent',
              color: activeTab === 'alleles' ? 'var(--text-primary)' : 'var(--text-secondary)'
            }}
          >
            <BarChart3 size={14} /> Allele Frequency
          </button>
          <button 
            onClick={() => setActiveTab('crossover')}
            style={{ 
              padding: '6px 14px', borderRadius: '4px', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px',
              background: activeTab === 'crossover' ? 'var(--bg-subtle)' : 'transparent',
              color: activeTab === 'crossover' ? 'var(--text-primary)' : 'var(--text-secondary)'
            }}
          >
            <Shuffle size={14} /> Genetic Crossover
          </button>
        </div>
      </div>

      {/* Main Tab Content */}
      <div style={{ flex: 1, padding: '24px 32px', overflowY: 'auto' }}>
        {activeTab === 'phylogeny' && <PhylogeneticMutationTree />}
        {activeTab === 'alleles' && <AlleleFrequencyAnalyzer />}
        {activeTab === 'crossover' && <GeneticCrossoverSynthesizer />}
      </div>

    </div>
  );
};
