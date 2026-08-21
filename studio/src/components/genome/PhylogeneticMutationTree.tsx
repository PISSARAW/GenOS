import React, { useState } from 'react';
import { GitBranch, Dna, CheckCircle2, AlertOctagon, Award } from 'lucide-react';

interface PhylogenyNode {
  id: string;
  generation: number;
  label: string;
  mutationType: 'Role' | 'Strategy' | 'Tool_Access' | 'Guardrail';
  fitnessScore: number;
  isChampion: boolean;
  isApoptosis: boolean;
  geneDiff: string;
  x: number;
  y: number;
}

export const PhylogeneticMutationTree: React.FC = () => {
  const [selectedNode, setSelectedNode] = useState<PhylogenyNode | null>(null);

  const nodes: PhylogenyNode[] = [
    { id: 'g0-root', generation: 0, label: 'G0: Base Fleet Blueprint', mutationType: 'Role', fitnessScore: 82.0, isChampion: false, isApoptosis: false, geneDiff: '+ Base archetype prompts and standard MCP permissions', x: 280, y: 50 },
    { id: 'g1-branch-a', generation: 1, label: 'G1: Strict Type Heuristics', mutationType: 'Strategy', fitnessScore: 91.5, isChampion: false, isApoptosis: false, geneDiff: '+ Enforce TypeScript strict mode on all AST mutations\n+ Rule: max 3 params per function', x: 140, y: 160 },
    { id: 'g1-branch-b', generation: 1, label: 'G1: Unrestricted Tool Access', mutationType: 'Tool_Access', fitnessScore: 42.0, isChampion: false, isApoptosis: true, geneDiff: '- Removed circuit breaker quarantine\n[APOPTOSIS] Cascading failure triggered', x: 420, y: 160 },
    { id: 'g2-branch-c', generation: 2, label: 'G2: Causal Bisection Guardrail', mutationType: 'Guardrail', fitnessScore: 96.8, isChampion: true, isApoptosis: false, geneDiff: '+ Integrated binary search regression bisection\n+ Zero-copy branch rollback hook', x: 140, y: 280 },
    { id: 'g2-branch-d', generation: 2, label: 'G2: Beam Search Optimizer', mutationType: 'Strategy', fitnessScore: 88.0, isChampion: false, isApoptosis: false, geneDiff: '+ Expand top-3 candidates in parallel before commit', x: 300, y: 280 },
  ];

  const edges = [
    { from: 'g0-root', to: 'g1-branch-a' },
    { from: 'g0-root', to: 'g1-branch-b' },
    { from: 'g1-branch-a', to: 'g2-branch-c' },
    { from: 'g1-branch-a', to: 'g2-branch-d' }
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '24px', height: '100%' }}>
      
      {/* Tree Visualization */}
      <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', borderRadius: '6px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '10px 16px', background: 'var(--bg-subtle)', borderBottom: '1px solid var(--panel-border)', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <GitBranch size={14} color="var(--accent-blue)" /> Interactive Phylogenetic Mutation Tree (Evolution DAG)
        </div>

        <div style={{ flex: 1, position: 'relative', background: 'var(--bg-main)', minHeight: '340px' }}>
          <svg width="100%" height="100%" viewBox="0 0 560 360" style={{ display: 'block' }}>
            
            {/* Edges */}
            {edges.map((e, idx) => {
              const src = nodes.find((n) => n.id === e.from);
              const dst = nodes.find((n) => n.id === e.to);
              if (!src || !dst) return null;

              return (
                <line 
                  key={idx} 
                  x1={src.x} y1={src.y} 
                  x2={dst.x} y2={dst.y} 
                  stroke="var(--panel-border)" 
                  strokeWidth="2" 
                />
              );
            })}

            {/* Nodes */}
            {nodes.map((node) => {
              const isSelected = selectedNode?.id === node.id;
              let fill = '#1f6feb';
              let haloColor = 'none';

              if (node.isChampion) {
                fill = '#238636';
                haloColor = 'rgba(46, 160, 67, 0.4)';
              } else if (node.isApoptosis) {
                fill = '#cf222e';
                haloColor = 'rgba(207, 34, 46, 0.4)';
              }

              return (
                <g 
                  key={node.id} 
                  transform={`translate(${node.x}, ${node.y})`} 
                  style={{ cursor: 'pointer' }}
                  onClick={() => setSelectedNode(node)}
                >
                  {/* Halo */}
                  {haloColor !== 'none' && (
                    <circle r="22" fill={haloColor} />
                  )}
                  <circle 
                    r="14" 
                    fill={fill} 
                    stroke={isSelected ? '#ffffff' : 'var(--panel-border)'} 
                    strokeWidth={isSelected ? 2 : 1} 
                  />
                  <text x="0" y="4" textAnchor="middle" fill="#ffffff" fontSize="9" fontWeight="bold">
                    G{node.generation}
                  </text>
                  
                  <text x="0" y="24" textAnchor="middle" fill="var(--text-primary)" fontSize="11" fontWeight="600">
                    {node.label}
                  </text>
                  <text x="0" y="36" textAnchor="middle" fill="var(--text-secondary)" fontSize="9">
                    {node.fitnessScore}% Fitness
                  </text>
                </g>
              );
            })}

          </svg>
        </div>
      </div>

      {/* Node Detail / Gene Diff */}
      <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', borderRadius: '6px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '10px 16px', background: 'var(--bg-subtle)', borderBottom: '1px solid var(--panel-border)', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Dna size={14} color="var(--accent-purple)" /> Mutation Gene Diff
        </div>

        <div style={{ padding: '16px', flex: 1, display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto' }}>
          {selectedNode ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>{selectedNode.label}</span>
                {selectedNode.isChampion && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#d29922', fontSize: '0.75rem', fontWeight: 600 }}>
                    <Award size={12} /> Champion
                  </span>
                )}
                {selectedNode.isApoptosis && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--danger)', fontSize: '0.75rem', fontWeight: 600 }}>
                    <AlertOctagon size={12} /> Extinct
                  </span>
                )}
              </div>

              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                Gene Category: <strong>{selectedNode.mutationType}</strong> · Generation: <strong>G{selectedNode.generation}</strong>
              </div>

              <div style={{ background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '6px', padding: '12px', flex: 1 }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>Prompt Gene Modifications:</div>
                <pre style={{ margin: 0, fontFamily: 'monospace', fontSize: '0.8rem', color: '#3fb950', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                  {selectedNode.geneDiff}
                </pre>
              </div>
            </>
          ) : (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '32px 0' }}>
              Select any node in the phylogenetic tree to view genealogical mutations and fitness metrics.
            </div>
          )}
        </div>
      </div>

    </div>
  );
};
