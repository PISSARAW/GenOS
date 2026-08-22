import React, { useMemo, useState } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useGenOSStore } from '../store/useGenOSStore';
import { Camera, GitCommit, PlayCircle } from 'lucide-react';

// Custom Snapshot Node
const SnapshotNode = ({ data }: any) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div 
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        width: 40,
        height: 40,
        borderRadius: '50%',
        background: data.isHead ? '#1f6feb' : '#161b22',
        border: data.isHead ? '2px solid #58a6ff' : '2px solid #30363d',
        boxShadow: isHovered ? '0 4px 12px rgba(0,0,0,0.5)' : '0 1px 3px rgba(0,0,0,0.3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        transition: 'all 0.2s',
        transform: isHovered ? 'scale(1.1)' : 'scale(1)',
        position: 'relative'
      }}
    >
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <GitCommit size={16} color={data.isHead ? '#ffffff' : '#8b949e'} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />

      {/* Tooltip */}
      {isHovered && (
        <div style={{
          position: 'absolute',
          top: -100,
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'var(--bg-panel)',
          border: '1px solid var(--panel-border)',
          borderRadius: '6px',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)',
          padding: '12px',
          width: 220,
          zIndex: 100,
          textAlign: 'left',
          pointerEvents: 'none'
        }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>{data.label}</div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '2px' }}><strong>Author:</strong> {data.author || 'GenOS Agent'}</div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '2px' }}><strong>Last action:</strong> {data.reason || 'Not recorded'}</div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{data.timestamp || 'No timestamp'}</div>
        </div>
      )}
    </div>
  );
};

const nodeTypes = {
  snapshot: SnapshotNode,
};

export const WorkspaceTimelineManager: React.FC = () => {
  const clones = useGenOSStore((state) => state.clones);

  const initialNodes: Node[] = useMemo(() => {
    return clones.map((clone, index) => ({
      id: clone.id,
      type: 'snapshot',
      position: { x: index * 150, y: 150 },
      data: {
        label: clone.name,
        isHead: index === clones.length - 1,
        author: clone.role || clone.agentType || 'Agent',
        reason: clone.lastAction || 'Auto-checkpoint',
        timestamp: 'Timestamp not recorded'
      }
    }));
  }, [clones]);

  const initialEdges: Edge[] = useMemo(() => {
    const edges: Edge[] = [];
    for (let i = 1; i < clones.length; i++) {
      edges.push({
        id: `e-${clones[i - 1].id}-${clones[i].id}`,
        source: clones[i - 1].id,
        target: clones[i].id,
        type: 'smoothstep',
        animated: false,
        style: { stroke: '#30363d', strokeWidth: 2 },
      });
    }
    return edges;
  }, [clones]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  React.useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-main)', position: 'relative' }}>
      
      {/* Header */}
      <div style={{ 
        padding: '16px 24px', 
        borderBottom: '1px solid var(--panel-border)', 
        display: 'flex', 
        justifyContent: 'space-between',
        alignItems: 'center',
        background: 'var(--bg-panel)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Persisted agent lineage</span>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--text-primary)', background: 'var(--bg-subtle)', padding: '4px 10px', borderRadius: '16px', border: '1px solid var(--panel-border)' }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#3fb950' }}></div>
            <strong>LATEST LISTED AGENT:</strong> {clones[clones.length - 1]?.name || 'None'}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button 
            disabled
            className="gh-btn"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)' }}
          >
            <PlayCircle size={16} /> Replay unavailable
          </button>
          <button disabled title="A durable workspace snapshot provider is not configured." className="gh-btn" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Camera size={16} /> Snapshot unavailable
          </button>
        </div>
      </div>

      {/* Graph */}
      <div style={{ flex: 1, position: 'relative' }}>
        <p style={{ position: 'absolute', zIndex: 2, top: 8, left: 16, color: 'var(--text-secondary)', fontSize: '0.75rem' }}>This view is an agent-lineage visualization. It does not represent filesystem snapshots or support replay.</p>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          fitView
        >
          <Controls style={{ background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', borderRadius: '4px' }} />
          <MiniMap nodeStrokeColor="#30363d" nodeColor="#161b22" maskColor="rgba(13, 17, 23, 0.8)" style={{ background: 'var(--bg-panel)', border: '1px solid var(--panel-border)' }} />
          <Background gap={20} size={1} color="var(--panel-border)" />
        </ReactFlow>
      </div>

    </div>
  );
};

export default WorkspaceTimelineManager;
