import React, { useState, useEffect } from 'react';
import { Wrench, Play, Shield, Terminal } from 'lucide-react';
import { api } from '../../api/client';
import { useToastStore } from '../../store/useToastStore';
import { McpSchemaFormBuilder } from './McpSchemaFormBuilder';
import { McpDryRunConsole } from './McpDryRunConsole';
import { McpCircuitBreakerTable, type McpToolItem } from './McpCircuitBreakerTable';
import { getToolAlias } from '../../utils/toolLabels';

export const McpSandboxModule: React.FC = () => {
  const [tools, setTools] = useState<McpToolItem[]>([]);
  const [selectedToolName, setSelectedToolName] = useState('genos_inspect');
  const [formArgs, setFormArgs] = useState<Record<string, any>>({});
  const [dryRunResult, setDryRunResult] = useState<any>(null);
  const [isRunning, setIsRunning] = useState(false);
  const showToast = useToastStore((state) => state.showToast);

  const fetchTools = () => {
    api.listTools()
      .then((data: any[]) => {
        if (Array.isArray(data)) setTools(data);
      })
      .catch(() => {});
  };

  useEffect(() => {
    fetchTools();
  }, []);

  const handleDryRun = async () => {
    setIsRunning(true);
    const start = performance.now();
    try {
      const res = await api.dryRunMcpTool(selectedToolName, formArgs);
      const elapsed = Math.round(performance.now() - start);
      
      setDryRunResult({ ...res, latencyMs: elapsed });
      showToast('success', 'Dry-Run Completed', `Backend dry-run analysis completed in ${elapsed}ms; no MCP transport was executed.`);
    } catch (e: any) {
      showToast('error', 'Execution Error', e.message);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-main)' }}>
      
      {/* Top Header */}
      <div style={{ padding: '20px 32px', background: 'var(--bg-panel)', borderBottom: '1px solid var(--panel-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Wrench size={20} color="var(--accent-blue)" />
            <h1 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>MCP Arsenal & Dry-Run Sandbox</h1>
          </div>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Model Context Protocol server testing, dynamic schema parameter builder, and VFS dry-run simulation.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <select 
            value={selectedToolName} 
            onChange={(e) => setSelectedToolName(e.target.value)}
            style={{ padding: '6px 12px', background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.85rem', fontWeight: 600 }}
          >
            {tools.map((t) => (
              <option key={t.id || t.name} value={t.name}>{getToolAlias(t.name)} ({t.category})</option>
            ))}
          </select>
          <button 
            onClick={handleDryRun} 
            disabled={isRunning}
            className="gh-btn gh-btn-primary" 
            style={{ padding: '6px 16px', fontSize: '0.85rem' }}
          >
            <Play size={14} /> {isRunning ? 'Analysing VFS...' : 'Run VFS Dry-Run'}
          </button>
        </div>
      </div>

      {/* Main Content Split */}
      <div style={{ flex: 1, padding: '24px 32px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', minHeight: '340px' }}>
          <McpSchemaFormBuilder toolName={selectedToolName} onChange={(args) => setFormArgs(args)} />
          <McpDryRunConsole result={dryRunResult} isRunning={isRunning} />
        </div>

        <McpCircuitBreakerTable tools={tools} onRefresh={fetchTools} />

      </div>

    </div>
  );
};
