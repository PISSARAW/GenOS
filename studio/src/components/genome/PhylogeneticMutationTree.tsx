import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { GitBranch, Dna, AlertOctagon, Award, Copy, Skull } from 'lucide-react';
import { api } from '../../api/client';
import { useToastStore } from '../../store/useToastStore';

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
  const [nodes, setNodes] = useState<PhylogenyNode[]>([]);
  const [edges, setEdges] = useState<{ from: string; to: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isActing, setIsActing] = useState(false);
  const showToast = useToastStore((state) => state.showToast);

  const loadTree = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const tree: any = await api.getPhylogeneticTree();
      const sourceNodes = Array.isArray(tree?.nodes) ? tree.nodes : [];
      const cols = Math.max(1, Math.ceil(Math.sqrt(sourceNodes.length)));
      setNodes(sourceNodes.map((node: any, index: number) => ({
        id: node.id,
        generation: Number(node.generation || 0),
        label: node.name || node.label || node.id,
        mutationType: node.mutationType || 'Strategy',
        fitnessScore: Number(node.fitnessScore || 0),
        isChampion: node.status === 'CHAMPION',
        isApoptosis: node.status === 'EXTINCT' || node.status === 'Apoptosis',
        geneDiff: node.geneDiff || node.summary || '',
        x: Number(node.x ?? node.pos?.x ?? (100 + (index % cols) * 120)),
        y: Number(node.y ?? node.pos?.y ?? (80 + Math.floor(index / cols) * 100))
      })));
      setEdges((Array.isArray(tree?.edges) ? tree.edges : []).map((edge: any) => ({ from: edge.from || edge.source, to: edge.to || edge.target })));
    } catch (e: any) {
      setNodes([]);
      setEdges([]);
      setError(e.message || 'Failed to load the phylogenetic tree.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTree();
  }, [loadTree]);

  const viewBox = useMemo(() => {
    if (nodes.length === 0) return '0 0 560 360';
    const pad = 80;
    const minX = Math.min(...nodes.map((n) => n.x)) - pad;
    const maxX = Math.max(...nodes.map((n) => n.x)) + pad;
    const minY = Math.min(...nodes.map((n) => n.y)) - pad;
    const maxY = Math.max(...nodes.map((n) => n.y)) + pad;
    return `${minX} ${minY} ${Math.max(maxX - minX, 320)} ${Math.max(maxY - minY, 240)}`;
  }, [nodes]);

  const handleCloneNode = async () => {
    if (!selectedNode) return;
    if (!window.confirm(`Clone node "${selectedNode.label}"?`)) return;
    setIsActing(true);
    try {
      await api.cloneNode(selectedNode.id);
      showToast('success', 'Node Cloned', `"${selectedNode.label}" was cloned.`);
      setSelectedNode(null);
      await loadTree();
    } catch (e: any) {
      showToast('error', 'Clone Failed', e.message);
    } finally {
      setIsActing(false);
    }
  };

  const handleKillNode = async () => {
    if (!selectedNode) return;
    if (!window.confirm(`Kill node "${selectedNode.label}"? This may terminate a live agent lineage.`)) return;
    setIsActing(true);
    try {
      await api.killNode(selectedNode.id);
      showToast('success', 'Node Killed', `"${selectedNode.label}" was terminated.`);
      setSelectedNode(null);
      await loadTree();
    } catch (e: any) {
      showToast('error', 'Kill Failed', e.message);
    } finally {
      setIsActing(false);
    }
  };

  const renderDiffLine = (line: string, index: number) => {
    const color = line.startsWith('-') ? '#f85149' : line.startsWith('+') ? '#3fb950' : 'var(--text-secondary)';
    return <div key={index} style={{ color, whiteSpace: 'pre-wrap' }}>{line}</div>;
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '24px', height: '100%' }}>
      
      {/* Tree Visualization */}
      <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', borderRadius: '6px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '10px 16px', background: 'var(--bg-subtle)', borderBottom: '1px solid var(--panel-border)', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <GitBranch size={14} color="var(--accent-blue)" /> Interactive Phylogenetic Mutation Tree (Evolution DAG)
        </div>

        <div style={{ flex: 1, position: 'relative', background: 'var(--bg-main)', minHeight: '340px' }}>
          {error && (
            <div style={{ padding: '10px 16px', background: 'rgba(248, 81, 73, 0.1)', borderBottom: '1px solid var(--danger)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--danger)' }}>Failed to load phylogeny: {error}</span>
              <button onClick={loadTree} className="gh-btn" style={{ padding: '4px 10px', fontSize: '0.75rem' }}>Retry</button>
            </div>
          )}
          {isLoading ? (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              Loading phylogenetic tree...
            </div>
          ) : (
          <svg width="100%" height="100%" viewBox={viewBox} style={{ display: 'block' }}>
            
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
          )}
          {!isLoading && !error && nodes.length === 0 && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              No phylogenetic nodes recorded.
            </div>
          )}
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
                <pre style={{ margin: 0, fontFamily: 'monospace', fontSize: '0.8rem', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                  {selectedNode.geneDiff.split('\n').map(renderDiffLine)}
                </pre>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={handleCloneNode}
                  disabled={isActing}
                  className="gh-btn"
                  style={{ padding: '6px 12px', fontSize: '0.75rem', flex: 1, justifyContent: 'center' }}
                >
                  <Copy size={12} /> {isActing ? 'Working...' : 'Clone node'}
                </button>
                <button
                  onClick={handleKillNode}
                  disabled={isActing}
                  className="gh-btn"
                  style={{ padding: '6px 12px', fontSize: '0.75rem', flex: 1, justifyContent: 'center', color: 'var(--danger)' }}
                >
                  <Skull size={12} /> Kill node
                </button>
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
