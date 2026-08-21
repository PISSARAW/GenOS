import React, { useState, useEffect } from 'react';
import { 
  Play, Pause, SkipBack, SkipForward, ArrowLeft, GitMerge, FileCode,
  X, RotateCcw
} from 'lucide-react';
import { api } from '../api/client';
import { useToastStore } from '../store/useToastStore';

interface TimeMachineProps {
  workspace: any;
  onBack: () => void;
}

export const WorkspaceTimeMachine: React.FC<TimeMachineProps> = ({ workspace, onBack }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const showToast = useToastStore((state) => state.showToast);

  const workspaceId = workspace.id || workspace.title || 'ws-main';

  useEffect(() => {
    api.getSnapshots(workspaceId)
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setSnapshots(data);
        } else setSnapshots([]);
      })
      .catch(() => setSnapshots([]));
  }, [workspaceId]);

  const nodes = snapshots.map((s, i) => ({
    id: i,
    originalId: s.id,
    x: 220 + (i % 2 === 1 ? 40 : 0),
    y: 60 + i * 110,
    title: s.label || `Snapshot #${s.step_number ?? i}`,
    author: s.snapshot_type || 'system',
    hash: s.commit_hash || 'c819fa2',
    type: s.snapshot_type === 'merge' ? 'merge' : 'agent',
    raw: s
  }));

  const edges = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    edges.push({ from: i, to: i + 1 });
  }

  const maxStep = Math.max(0, nodes.length - 1);

  useEffect(() => {
    let interval: any;
    if (isPlaying) {
      interval = setInterval(() => {
        setCurrentStep((prev) => {
          if (prev >= maxStep) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, 1500);
    }
    return () => clearInterval(interval);
  }, [isPlaying, maxStep]);

  const handleRestore = async (step: number) => {
    try {
      await api.restoreSnapshot(workspaceId, step);
      showToast('success', 'Workspace Rolled Back', `Restored workspace state to Step ${step}.`);
      setSelectedNode(null);
    } catch (e: any) {
      showToast('error', 'Restore Failed', e.message);
    }
  };

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-main)', position: 'relative' }}>
      
      {/* Top Header */}
      <div style={{ padding: '20px 32px', borderBottom: '1px solid var(--panel-border)', background: 'var(--bg-panel)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button onClick={onBack} className="gh-btn" style={{ padding: '6px' }}>
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 style={{ fontSize: '1.15rem', margin: 0, color: 'var(--text-primary)' }}>{workspace.title || workspace.name}</h1>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Timeline Explorer & Lineage Playback</div>
          </div>
        </div>
        <div style={{ padding: '4px 12px', background: 'var(--bg-subtle)', border: '1px solid var(--panel-border)', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)' }}>
          Step {currentStep} / {maxStep}
        </div>
      </div>

      {/* Main SVG Graph Area */}
      <div style={{ flex: 1, overflow: 'auto', position: 'relative', background: 'var(--bg-main)' }}>
        
        <svg width="100%" height={Math.max(600, nodes.length * 130 + 100)} style={{ display: 'block' }}>
          {/* Edges */}
          {edges.map((edge, i) => {
            const fromNode = nodes.find((n) => n.id === edge.from);
            const toNode = nodes.find((n) => n.id === edge.to);
            if (!fromNode || !toNode) return null;
            const isActive = toNode.id <= currentStep;

            const d = `M ${fromNode.x} ${fromNode.y} C ${fromNode.x} ${(fromNode.y + toNode.y)/2}, ${toNode.x} ${(fromNode.y + toNode.y)/2}, ${toNode.x} ${toNode.y}`;

            return (
              <path 
                key={i}
                d={d}
                fill="none"
                stroke={isActive ? 'var(--accent-blue)' : 'var(--panel-border)'}
                strokeWidth="2"
                style={{ transition: 'stroke 0.3s ease' }}
              />
            );
          })}

          {/* Nodes */}
          {nodes.map((node) => {
            const isActive = node.id <= currentStep;
            const isAgent = node.type === 'agent';
            const isMerge = node.type === 'merge';

            const fillColor = !isActive ? '#161b22' : isAgent ? '#1f6feb' : isMerge ? '#238636' : '#58a6ff';
            const strokeColor = !isActive ? '#30363d' : isAgent ? '#58a6ff' : isMerge ? '#3fb950' : '#79c0ff';

            return (
              <g 
                key={node.id} 
                transform={`translate(${node.x}, ${node.y})`} 
                style={{ cursor: isActive ? 'pointer' : 'default', opacity: isActive ? 1 : 0.4, transition: 'all 0.3s ease' }}
                onClick={() => isActive && setSelectedNode(node)}
              >
                <circle r="12" fill={fillColor} stroke={strokeColor} strokeWidth="3" />
                {isMerge && <g transform="translate(-6, -6)"><GitMerge size={12} color="white" /></g>}
                
                <text x="24" y="4" fill={isActive ? 'var(--text-primary)' : 'var(--text-muted)'} fontSize="13" fontWeight="600" fontFamily="sans-serif">
                  {node.title}
                </text>
                <text x="24" y="20" fill="var(--text-secondary)" fontSize="11" fontFamily="sans-serif">
                  {node.author} · <tspan fontFamily="monospace">{node.hash}</tspan>
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Time Player Slider */}
      <div style={{ padding: '16px 32px', background: 'var(--bg-panel)', borderTop: '1px solid var(--panel-border)', display: 'flex', alignItems: 'center', gap: '16px' }}>
        <button onClick={() => setCurrentStep(0)} className="gh-btn" style={{ padding: '8px', borderRadius: '50%' }}>
          <SkipBack size={16} />
        </button>
        <button onClick={() => setIsPlaying(!isPlaying)} className="gh-btn gh-btn-primary" style={{ padding: '10px', borderRadius: '50%' }}>
          {isPlaying ? <Pause size={18} /> : <Play size={18} />}
        </button>
        <button onClick={() => setCurrentStep(maxStep)} className="gh-btn" style={{ padding: '8px', borderRadius: '50%' }}>
          <SkipForward size={16} />
        </button>
        
        <input 
          type="range" 
          min="0" 
          max={maxStep} 
          value={currentStep}
          onChange={(e) => {
            setCurrentStep(parseInt(e.target.value));
            setIsPlaying(false);
          }}
          style={{ flex: 1, margin: '0 16px', cursor: 'pointer', accentColor: 'var(--accent-blue)' }}
        />
      </div>

      {/* Diff / Snapshot Modal */}
      {selectedNode && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.6)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: '700px', maxHeight: '80vh', background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', borderRadius: '6px', boxShadow: '0 16px 48px rgba(0,0,0,0.6)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            
            {/* Modal Header */}
            <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--panel-border)', background: 'var(--bg-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)' }}>{selectedNode.title}</h3>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Commit: <span style={{ fontFamily: 'monospace' }}>{selectedNode.hash}</span> · Step {selectedNode.id}</div>
              </div>
              <button onClick={() => setSelectedNode(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ flex: 1, padding: '24px', background: 'var(--bg-main)', overflowY: 'auto' }}>
              <div style={{ border: '1px solid var(--panel-border)', borderRadius: '6px', background: 'var(--bg-panel)', overflow: 'hidden' }}>
                <div style={{ padding: '8px 16px', background: 'var(--bg-subtle)', borderBottom: '1px solid var(--panel-border)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  <FileCode size={14} /> Snapshot Metadata & State
                </div>
                
                <pre style={{ padding: '16px', fontFamily: 'monospace', fontSize: '0.8rem', lineHeight: 1.5, color: 'var(--text-primary)', whiteSpace: 'pre-wrap', margin: 0 }}>
{JSON.stringify(selectedNode.raw, null, 2)}
                </pre>
              </div>
            </div>

            {/* Modal Footer */}
            <div style={{ padding: '12px 24px', borderTop: '1px solid var(--panel-border)', background: 'var(--bg-subtle)', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button onClick={() => setSelectedNode(null)} className="gh-btn">Close</button>
              <button onClick={() => handleRestore(selectedNode.id)} className="gh-btn gh-btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <RotateCcw size={14} /> Rollback to this Snapshot
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
