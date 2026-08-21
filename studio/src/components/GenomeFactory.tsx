import React, { useState, useEffect } from 'react';
import { 
  Network, Share2, Plus, Bold, Italic, Link as LinkIcon, List, Code,
  Save, Dna, BrainCircuit, X
} from 'lucide-react';
import { api } from '../api/client';
import { useToastStore } from '../store/useToastStore';

export const GenomeFactory: React.FC = () => {
  const [graphMode, setGraphMode] = useState<'mindmap' | 'constellation'>('mindmap');
  const [cart, setCart] = useState<string[]>([]);
  const [editorTitle, setEditorTitle] = useState('');
  const [editorContent, setEditorContent] = useState('');
  const [nodes, setNodes] = useState<any[]>([]);
  const [edges, setEdges] = useState<any[]>([]);
  const showToast = useToastStore((state) => state.showToast);

  useEffect(() => {
    api.getGenomeGraph()
      .then((data) => {
        if (data?.nodes) setNodes(data.nodes);
        if (data?.edges) setEdges(data.edges);
      })
      .catch(() => {
        // Fallback default nodes
        setNodes([
          { id: 'n1', label: 'Rule #1: File Length <=400', type: 'core', mm: { x: 200, y: 150 }, const: { x: 180, y: 120 } },
          { id: 'n2', label: 'Rule #2: Params <=3', type: 'core', mm: { x: 450, y: 150 }, const: { x: 420, y: 140 } },
          { id: 'n3', label: 'Rule #5: Strict GitHub Dark', type: 'core', mm: { x: 320, y: 280 }, const: { x: 300, y: 260 } },
          { id: 'n4', label: 'RBAC Military Gate', type: 'leaf', mm: { x: 150, y: 350 }, const: { x: 140, y: 340 } },
          { id: 'n5', label: 'MCP Circuit Breaker', type: 'leaf', mm: { x: 500, y: 350 }, const: { x: 480, y: 340 } },
        ]);
        setEdges([
          { from: 'n1', to: 'n3' },
          { from: 'n2', to: 'n3' },
          { from: 'n3', to: 'n4' },
          { from: 'n3', to: 'n5' }
        ]);
      });
  }, []);

  const toggleCart = (id: string) => {
    if (cart.includes(id)) {
      setCart(cart.filter((item) => item !== id));
    } else {
      setCart([...cart, id]);
    }
  };

  const handleSynthesize = async () => {
    if (cart.length === 0) return;
    try {
      await api.synthesizeGenome({
        title: `Genome Synthesis (${cart.length} modules)`,
        content: `Compiled DNA package from nodes: ${cart.join(', ')}`,
        cart
      });
      showToast('success', 'Genome Synthesized', `Agent DNA synthesized successfully with ${cart.length} cognitive nodes.`);
      setCart([]);
    } catch (e: any) {
      showToast('error', 'Synthesis Failed', e.message);
    }
  };

  const handleInject = async () => {
    if (!editorTitle || !editorContent) return;
    try {
      await api.recordDecision({
        title: editorTitle,
        content: editorContent
      });
      showToast('success', 'Decision Recorded', `Injected "${editorTitle}" into global genome database.`);
      setEditorTitle('');
      setEditorContent('');
    } catch (e: any) {
      showToast('error', 'Injection Failed', e.message);
    }
  };

  const insertMarkdown = (prefix: string, suffix: string = '') => {
    setEditorContent((prev) => `${prev}${prefix}selected_text${suffix}`);
  };

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', background: 'var(--bg-main)' }}>
      
      {/* Left Panel: Network Graph */}
      <div style={{ flex: 1, position: 'relative', borderRight: '1px solid var(--panel-border)', background: 'var(--bg-main)', overflow: 'hidden' }}>
        
        {/* Graph Controls */}
        <div style={{ position: 'absolute', top: 24, left: 24, zIndex: 10, display: 'flex', gap: '8px', background: 'var(--bg-panel)', padding: '6px', borderRadius: '6px', border: '1px solid var(--panel-border)' }}>
          <button 
            onClick={() => setGraphMode('mindmap')}
            style={{ 
              display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer',
              background: graphMode === 'mindmap' ? 'var(--bg-subtle)' : 'transparent',
              color: graphMode === 'mindmap' ? 'var(--text-primary)' : 'var(--text-secondary)', border: 'none', fontSize: '0.8rem', fontWeight: 600
            }}
          >
            <Share2 size={14} /> Mind Map
          </button>
          <button 
            onClick={() => setGraphMode('constellation')}
            style={{ 
              display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer',
              background: graphMode === 'constellation' ? 'var(--bg-subtle)' : 'transparent',
              color: graphMode === 'constellation' ? 'var(--text-primary)' : 'var(--text-secondary)', border: 'none', fontSize: '0.8rem', fontWeight: 600
            }}
          >
            <Network size={14} /> Constellation
          </button>
        </div>

        <svg width="100%" height="100%" style={{ display: 'block' }}>
          {/* Edges */}
          {edges.map((edge, i) => {
            const fromNode = nodes.find((n) => n.id === edge.from);
            const toNode = nodes.find((n) => n.id === edge.to);
            if (!fromNode || !toNode) return null;
            
            const fromPos = graphMode === 'mindmap' ? fromNode.mm : fromNode.const;
            const toPos = graphMode === 'mindmap' ? toNode.mm : toNode.const;
            if (!fromPos || !toPos) return null;

            return (
              <line 
                key={i}
                x1={fromPos.x} y1={fromPos.y}
                x2={toPos.x} y2={toPos.y}
                stroke="var(--panel-border)"
                strokeWidth="2"
                style={{ transition: 'all 0.5s cubic-bezier(0.16, 1, 0.3, 1)' }}
              />
            );
          })}

          {/* Nodes */}
          {nodes.map((node) => {
            const pos = graphMode === 'mindmap' ? node.mm : node.const;
            if (!pos) return null;
            const isSelected = cart.includes(node.id);
            const isCore = node.type === 'core';
            
            const fillColor = isSelected ? '#bc8cff' : isCore ? '#1f6feb' : '#21262d';
            const strokeColor = isSelected ? '#d2a8ff' : isCore ? '#58a6ff' : '#8b949e';

            return (
              <g 
                key={node.id} 
                transform={`translate(${pos.x}, ${pos.y})`} 
                style={{ cursor: 'pointer', transition: 'all 0.5s cubic-bezier(0.16, 1, 0.3, 1)' }}
                onClick={() => toggleCart(node.id)}
              >
                <circle r={isCore ? "16" : "12"} fill={fillColor} stroke={strokeColor} strokeWidth="2" />
                
                {isCore && <g transform="translate(-8, -8)"><BrainCircuit size={16} color="white" /></g>}
                
                <text 
                  x="0" y={isCore ? "32" : "26"} 
                  textAnchor="middle"
                  fill={isSelected ? '#c9d1d9' : '#8b949e'} 
                  fontSize="13" 
                  fontWeight={isSelected ? "600" : "500"} 
                  fontFamily="sans-serif"
                >
                  {node.label}
                </text>
              </g>
            );
          })}
        </svg>

      </div>

      {/* Right Panel: Factory & Editor */}
      <div style={{ width: '450px', display: 'flex', flexDirection: 'column', background: 'var(--bg-panel)' }}>
        
        {/* Cherry-Picking Cart */}
        <div style={{ padding: '24px', borderBottom: '1px solid var(--panel-border)', background: 'var(--bg-subtle)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <Dna size={18} color="var(--accent-blue)" />
            <h2 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)' }}>Cognitive Cart</h2>
          </div>
          
          <div style={{ minHeight: '100px', background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '6px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {cart.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '16px 0' }}>
                Select nodes from the Graph to build the agent's context.
              </div>
            ) : (
              cart.map((id) => {
                const node = nodes.find((n) => n.id === id);
                return (
                  <div key={id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: 'var(--bg-subtle)', border: '1px solid var(--panel-border)', borderRadius: '4px', fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <BrainCircuit size={12} color="var(--accent-blue)" /> {node ? node.label : id}
                    </div>
                    <X size={14} color="var(--text-secondary)" style={{ cursor: 'pointer' }} onClick={() => toggleCart(id)} />
                  </div>
                );
              })
            )}
          </div>
          
          <button 
            onClick={handleSynthesize}
            className="gh-btn gh-btn-primary" 
            style={{ width: '100%', marginTop: '16px', padding: '8px', fontWeight: 600, justifyContent: 'center' }}
            disabled={cart.length === 0}
          >
            Synthesize Agent Genome ({cart.length})
          </button>
        </div>

        {/* WYSIWYG Editor (Record Decision) */}
        <div style={{ flex: 1, padding: '24px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <Plus size={18} color="var(--text-secondary)" />
            <h2 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)' }}>Record Decision</h2>
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', border: '1px solid var(--panel-border)', borderRadius: '6px', overflow: 'hidden', background: 'var(--bg-main)' }}>
            
            {/* Title Input */}
            <input 
              type="text" 
              placeholder="Decision Title (e.g. Use strict type checking)"
              value={editorTitle}
              onChange={(e) => setEditorTitle(e.target.value)}
              style={{ padding: '12px 16px', border: 'none', borderBottom: '1px solid var(--panel-border)', outline: 'none', fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)', background: 'var(--bg-main)' }}
            />

            {/* Toolbar */}
            <div style={{ display: 'flex', gap: '8px', padding: '8px 16px', borderBottom: '1px solid var(--panel-border)', background: 'var(--bg-subtle)' }}>
              <button onClick={() => insertMarkdown('**', '**')} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--text-secondary)' }}><Bold size={14} /></button>
              <button onClick={() => insertMarkdown('*', '*')} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--text-secondary)' }}><Italic size={14} /></button>
              <button onClick={() => insertMarkdown('[', '](url)')} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--text-secondary)' }}><LinkIcon size={14} /></button>
              <button onClick={() => insertMarkdown('- ')} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--text-secondary)' }}><List size={14} /></button>
              <button onClick={() => insertMarkdown('`', '`')} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--text-secondary)' }}><Code size={14} /></button>
            </div>

            {/* Textarea */}
            <textarea 
              placeholder="Write the technical details and justification for this rule. Future agents will ingest this knowledge."
              value={editorContent}
              onChange={(e) => setEditorContent(e.target.value)}
              style={{ flex: 1, padding: '16px', border: 'none', outline: 'none', resize: 'none', fontSize: '0.9rem', lineHeight: 1.5, color: 'var(--text-primary)', background: 'var(--bg-main)', fontFamily: 'inherit' }}
            />

            {/* Footer */}
            <div style={{ padding: '12px 16px', background: 'var(--bg-subtle)', borderTop: '1px solid var(--panel-border)', display: 'flex', justifyContent: 'flex-end' }}>
              <button 
                onClick={handleInject}
                className="gh-btn" 
                style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, color: 'var(--success)', borderColor: 'var(--success)' }}
                disabled={!editorTitle || !editorContent}
              >
                <Save size={14} /> Inject into Genome
              </button>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
};
