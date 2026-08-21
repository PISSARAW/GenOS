import React, { useMemo } from 'react';
import { ReactFlow, Controls, Background, BackgroundVariant, Handle, Position } from '@xyflow/react';
import type { Node, Edge } from '@xyflow/react';
import * as ContextMenu from '@radix-ui/react-context-menu';
import '@xyflow/react/dist/style.css';
import { useGenOSStore } from '../store/useGenOSStore';
import type { MCTSTreeNode } from '../store/useGenOSStore';
import { api } from '../api/client';
import { useToastStore } from '../store/useToastStore';

const HardwareDeviceNode = ({ data }: any) => {
  const showToast = useToastStore((state) => state.showToast);

  const handleInspect = async () => {
    try {
      await api.inspectNode(data.id);
      showToast('info', 'Node Inspected', `Inspecting state for ${data.label}`);
    } catch (e: any) {
      showToast('error', 'Inspect Failed', e.message);
    }
  };

  const handleClone = async () => {
    try {
      await api.cloneNode(data.id);
      showToast('success', 'Agent Cloned', `Spawned fork for ${data.label}`);
    } catch (e: any) {
      showToast('error', 'Clone Failed', e.message);
    }
  };

  const handleKill = async () => {
    try {
      await api.killNode(data.id);
      showToast('warning', 'Agent Terminated', `Terminated ${data.label}`);
    } catch (e: any) {
      showToast('error', 'Terminate Failed', e.message);
    }
  };

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger>
        <div className="device-node">
          <Handle type="target" position={Position.Top} style={{ background: '#30363d', border: 'none', width: '8px', height: '8px' }} />
          <div className="device-header">
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '120px' }}>{data.label}</span>
            <div className="device-indicator" style={{ background: data.score > 0.8 ? 'var(--success)' : data.score > 0.4 ? 'var(--warning)' : 'var(--error)' }} />
          </div>
          <div className="device-body">
            <div className="flex-between"><span>Visits:</span> <strong>{data.visits}</strong></div>
            <div className="flex-between"><span>Score:</span> <strong>{data.score.toFixed(2)}</strong></div>
          </div>
          <div className="device-port-row">
            <div className="device-port"></div>
            <div className="device-port"></div>
            <div className="device-port"></div>
            <div className="device-port"></div>
          </div>
          <Handle type="source" position={Position.Bottom} style={{ background: '#30363d', border: 'none', width: '8px', height: '8px' }} />
        </div>
      </ContextMenu.Trigger>
      
      <ContextMenu.Portal>
        <ContextMenu.Content className="mac-context-menu" style={{ zIndex: 2000 }}>
          <ContextMenu.Item className="mac-menu-item" onSelect={handleInspect}>Inspect Node</ContextMenu.Item>
          <ContextMenu.Item className="mac-menu-item" onSelect={handleClone}>Clone Agent</ContextMenu.Item>
          <ContextMenu.Separator className="mac-menu-separator" />
          <ContextMenu.Item className="mac-menu-item" style={{ color: 'var(--error)' }} onSelect={handleKill}>Terminate Agent</ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
};

const nodeTypes = {
  hardwareDevice: HardwareDeviceNode,
};

export const TreeViewer: React.FC = () => {
  const { mctsTrees } = useGenOSStore();

  const { nodes, edges } = useMemo(() => {
    const newNodes: Node[] = [];
    const newEdges: Edge[] = [];
    const yOffset = 50;

    Object.entries(mctsTrees).forEach(([, rootNode], index) => {
      // Refactored to accept <= 3 parameters (node, pos)
      const traverse = (node: MCTSTreeNode, pos: { x: number; y: number }) => {
        newNodes.push({
          id: node.id,
          type: 'hardwareDevice',
          position: { x: pos.x, y: pos.y },
          data: { id: node.id, label: node.state, score: node.score, visits: node.visits }
        });

        if (node.children && node.children.length > 0) {
          const width = 240;
          const startX = pos.x - ((node.children.length - 1) * width) / 2;
          
          node.children.forEach((child, i) => {
            const childX = startX + (i * width);
            const childY = pos.y + 160;
            
            newEdges.push({
              id: `e-${node.id}-${child.id}`,
              source: node.id,
              target: child.id,
              animated: true,
              style: { stroke: child.score > 0.8 ? 'var(--success)' : 'var(--text-muted)', strokeWidth: 2 }
            });
            
            traverse(child, { x: childX, y: childY });
          });
        }
      };
      
      traverse(rootNode, { x: 250 + (index * 600), y: yOffset });
    });

    if (newNodes.length === 0) {
      newNodes.push({
        id: 'root-idle',
        position: { x: 250, y: 250 },
        data: { id: 'root-idle', label: 'Awaiting MCTS Lineage...', score: 0.9, visits: 1 },
        type: 'hardwareDevice'
      });
    }

    return { nodes: newNodes, edges: newEdges };
  }, [mctsTrees]);

  return (
    <div style={{ width: '100%', height: '100%', overflow: 'hidden', flexGrow: 1, background: 'var(--bg-main)' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
      >
        <Background variant={BackgroundVariant.Lines} gap={40} size={1} color="var(--panel-border)" />
        <Controls 
          style={{ 
            background: 'var(--bg-panel)', 
            border: '1px solid var(--panel-border)', 
            borderRadius: 'var(--radius-sm)'
          }} 
        />
      </ReactFlow>
    </div>
  );
};
