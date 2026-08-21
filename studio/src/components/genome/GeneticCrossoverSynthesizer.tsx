import React, { useEffect, useState } from 'react';
import { Dna, Shuffle, Sparkles, Check } from 'lucide-react';
import { api } from '../../api/client';
import { useToastStore } from '../../store/useToastStore';

export const GeneticCrossoverSynthesizer: React.FC = () => {
  const [parents, setParents] = useState<any[]>([]);
  const [parentAId, setParentAId] = useState('');
  const [parentBId, setParentBId] = useState('');
  const [strategy, setStrategy] = useState('uniform');
  const [mutationRate, setMutationRate] = useState(5);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [childGenome, setChildGenome] = useState<any>(null);
  const showToast = useToastStore((state) => state.showToast);

  useEffect(() => {
    api.getPhylogeneticTree().then((tree: any) => {
      const available = (Array.isArray(tree?.nodes) ? tree.nodes : []).filter((node: any) => node.genes && Array.isArray(node.genes.tools));
      setParents(available);
      setParentAId(available[0]?.id || '');
      setParentBId(available[1]?.id || '');
    }).catch(() => setParents([]));
  }, []);

  const handleSynthesize = async () => {
    setIsSynthesizing(true);
    try {
      const res = await api.synthesizeCrossover({
        parentA: parents.find((parent) => parent.id === parentAId),
        parentB: parents.find((parent) => parent.id === parentBId),
        strategy,
        mutationRate
      });
      setChildGenome(res);
      showToast('success', 'Crossover Completed', 'Backend returned the synthesized genome.');
    } catch (e: any) {
      showToast('error', 'Crossover Failed', e.message);
    } finally {
      setIsSynthesizing(false);
    }
  };

  return (
    <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', borderRadius: '6px', overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '100%' }}>
      
      <div style={{ padding: '12px 16px', background: 'var(--bg-subtle)', borderBottom: '1px solid var(--panel-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Shuffle size={14} color="var(--accent-purple)" /> Guided Genetic Crossover Synthesizer (Parent Agent Recombination)
        </div>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Requires two recorded parent genomes</span>
      </div>

      <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px', flex: 1, overflowY: 'auto' }}>
        
        {/* Parent Selectors */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>Parent Agent A (Genome Alpha)</label>
            <select 
              value={parentAId} 
              onChange={(e) => setParentAId(e.target.value)} 
              style={{ width: '100%', padding: '6px 10px', background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.8rem' }}
            >
              <option value="">No recorded genome</option>
              {parents.map((parent) => <option key={parent.id} value={parent.id}>{parent.name || parent.label || parent.id}</option>)}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>Parent Agent B (Genome Beta)</label>
            <select 
              value={parentBId} 
              onChange={(e) => setParentBId(e.target.value)} 
              style={{ width: '100%', padding: '6px 10px', background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.8rem' }}
            >
              <option value="">No recorded genome</option>
              {parents.map((parent) => <option key={parent.id} value={parent.id}>{parent.name || parent.label || parent.id}</option>)}
            </select>
          </div>
        </div>

        {/* Crossover Strategy & Mutation Rate */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>Crossover Operator</label>
            <select 
              value={strategy} 
              onChange={(e) => setStrategy(e.target.value)} 
              style={{ width: '100%', padding: '6px 10px', background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.8rem' }}
            >
              <option value="uniform">Uniform Crossover</option>
              <option value="single_point">Single-Point Crossover</option>
              <option value="multi_point">Multi-Point Recombination</option>
            </select>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '4px' }}>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Hypermutation Rate</span>
              <span style={{ color: 'var(--accent-purple)', fontFamily: 'monospace' }}>{mutationRate}%</span>
            </div>
            <input 
              type="range" min="0" max="15" value={mutationRate} 
              onChange={(e) => setMutationRate(parseInt(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--accent-purple)' }}
            />
          </div>
        </div>

        <button 
          onClick={handleSynthesize} 
          disabled={isSynthesizing || !parentAId || !parentBId || parentAId === parentBId} 
          className="gh-btn gh-btn-primary" 
          style={{ padding: '8px 16px', justifyContent: 'center' }}
        >
          <Sparkles size={14} /> {isSynthesizing ? 'Recombining Genomes...' : 'Synthesize Recombinant Child Agent'}
        </button>

        {/* Resulting Child Agent Preview */}
        {childGenome && (
          <div style={{ background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '6px', padding: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Dna size={14} /> Synthesized Genome: {childGenome.childId}
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--success)', fontWeight: 600 }}>
                Predicted Fitness: {childGenome.predictedFitnessScore}%
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {(childGenome.mutations || []).length === 0 && <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>No mutation was recorded.</div>}
              {(childGenome.mutations || []).map((mutation: any, i: number) => (
                <div key={i} style={{ fontSize: '0.75rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Check size={12} color="var(--success)" /> {mutation.gene}: {mutation.delta}
                </div>
              ))}
            </div>
          </div>
        )}

      </div>

    </div>
  );
};
