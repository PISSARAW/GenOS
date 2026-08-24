import React, { useState, useEffect } from 'react';
import { Wrench, Play, Terminal, Zap } from 'lucide-react';
import { api } from '../../api/client';
import { useToastStore } from '../../store/useToastStore';
import { RBAC_Gate } from '../RBAC_Gate';
import { McpSchemaFormBuilder } from './McpSchemaFormBuilder';
import { McpDryRunConsole } from './McpDryRunConsole';
import { McpCircuitBreakerTable, type McpToolItem } from './McpCircuitBreakerTable';
import { getToolAlias } from '../../utils/toolLabels';

const resolveLatency = (res: any, fallbackMs: number): { latencyMs: number; latencySource: 'backend' | 'round-trip incl. network' } => {
  const backend = typeof res?.latencyMs === 'number' ? res.latencyMs : typeof res?.latency === 'number' ? res.latency : typeof res?.durationMs === 'number' ? res.durationMs : null;
  return backend != null
    ? { latencyMs: Math.round(backend), latencySource: 'backend' }
    : { latencyMs: fallbackMs, latencySource: 'round-trip incl. network' };
};

export const McpSandboxModule: React.FC = () => {
  const [tools, setTools] = useState<McpToolItem[]>([]);
  const [toolFilter, setToolFilter] = useState('');
  const [selectedToolName, setSelectedToolName] = useState('genos_inspect');
  const [formArgs, setFormArgs] = useState<Record<string, any>>({});
  const [argsValid, setArgsValid] = useState(true);
  const [dryRunResult, setDryRunResult] = useState<any>(null);
  const [executionResult, setExecutionResult] = useState<any>(null);
  const [isRunningDry, setIsRunningDry] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const showToast = useToastStore((state) => state.showToast);

  const fetchTools = () => {
    api.listTools()
      .then((data: any[]) => {
        if (!Array.isArray(data)) return;
        setTools(data);
        setSelectedToolName((current) =>
          data.some((t) => t.name === current) ? current : (data[0]?.name || current)
        );
      })
      .catch((e: any) => showToast('error', 'MCP Tools Unavailable', e?.message || 'Backend unreachable.'));
  };

  useEffect(() => {
    fetchTools();
  }, []);

  const handleDryRun = async () => {
    setIsRunningDry(true);
    const start = performance.now();
    try {
      const res = await api.dryRunMcpTool(selectedToolName, formArgs);
      const { latencyMs, latencySource } = resolveLatency(res, Math.round(performance.now() - start));
      setDryRunResult({ ...res, latencyMs, latencySource, producedAt: Date.now() });
      showToast('success', 'Dry-Run Completed', `Backend dry-run analysis completed in ${latencyMs}ms (${latencySource}); no MCP transport was executed.`);
    } catch (e: any) {
      showToast('error', 'Execution Error', e.message);
    } finally {
      setIsRunningDry(false);
    }
  };

  // Real execution path: POST /api/mcp/execute spawns the genos-mcp binary.
  // Destructive by nature, so the control stays behind the RBAC gate and
  // never runs as a side effect of the dry-run analysis.
  const handleExecute = async () => {
    setIsExecuting(true);
    const start = performance.now();
    try {
      const res = await api.executeTool(selectedToolName, formArgs);
      const { latencyMs, latencySource } = resolveLatency(res, Math.round(performance.now() - start));
      setExecutionResult({ ...res, executed: true, latencyMs, latencySource, producedAt: Date.now() });
      showToast('success', 'Tool Executed', `${getToolAlias(selectedToolName)} ran through the real MCP transport.`);
    } catch (e: any) {
      setExecutionResult({ executed: true, failed: true, error: e?.message || String(e), toolName: selectedToolName, producedAt: Date.now() });
      showToast('error', 'Real Execution Failed', e.message);
    } finally {
      setIsExecuting(false);
    }
  };

  const normalizedFilter = toolFilter.trim().toLowerCase();
  const filteredTools = normalizedFilter
    ? tools.filter((t) =>
        t.name.toLowerCase().includes(normalizedFilter) ||
        t.category.toLowerCase().includes(normalizedFilter) ||
        getToolAlias(t.name).toLowerCase().includes(normalizedFilter))
    : tools;

  const execOk = executionResult && !executionResult.failed && executionResult.success !== false && !executionResult.error;

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
            Model Context Protocol server testing, dynamic schema parameter builder, VFS dry-run simulation, and gated real execution.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input
            value={toolFilter}
            onChange={(e) => setToolFilter(e.target.value)}
            placeholder="Filter arsenal…"
            style={{ padding: '6px 12px', background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.85rem', width: '160px', outline: 'none' }}
          />
          <select
            value={selectedToolName}
            onChange={(e) => setSelectedToolName(e.target.value)}
            style={{ padding: '6px 12px', background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.85rem', fontWeight: 600 }}
          >
            {!filteredTools.some((t) => t.name === selectedToolName) && (
              <option value={selectedToolName}>{getToolAlias(selectedToolName)} (filtered out)</option>
            )}
            {filteredTools.map((t) => (
              <option key={t.id || t.name} value={t.name}>{getToolAlias(t.name)} ({t.category})</option>
            ))}
          </select>
          <button
            onClick={handleDryRun}
            disabled={isRunningDry || !argsValid}
            title={!argsValid ? 'Fix form validation errors before running' : undefined}
            className="gh-btn gh-btn-primary"
            style={{ padding: '6px 16px', fontSize: '0.85rem' }}
          >
            <Play size={14} /> {isRunningDry ? 'Analysing VFS...' : 'Run VFS Dry-Run'}
          </button>
          <RBAC_Gate>
            <button
              onClick={handleExecute}
              disabled={isExecuting || !argsValid}
              title={!argsValid ? 'Fix form validation errors before executing' : undefined}
              className="gh-btn"
              style={{ padding: '6px 16px', fontSize: '0.85rem', color: 'var(--danger)', borderColor: 'var(--danger)' }}
            >
              <Zap size={14} /> {isExecuting ? 'Executing…' : 'Execute for Real'}
            </button>
          </RBAC_Gate>
        </div>
      </div>

      {/* Main Content Split */}
      <div style={{ flex: 1, padding: '24px 32px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', minHeight: '340px' }}>
          <McpSchemaFormBuilder toolName={selectedToolName} onChange={(args) => setFormArgs(args)} onValidityChange={setArgsValid} />
          <McpDryRunConsole result={dryRunResult} isRunning={isRunningDry} />
        </div>

        {/* Real Execution Output — separate shape from the dry-run prediction */}
        {executionResult && (
          <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', borderRadius: '6px', overflow: 'hidden' }}>
            <div style={{ padding: '10px 16px', background: 'var(--bg-subtle)', borderBottom: '1px solid var(--panel-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Terminal size={14} color={execOk ? 'var(--success)' : 'var(--danger)'} />
                Real Execution Output · {getToolAlias(executionResult.toolName || selectedToolName)}
              </div>
              <div style={{ display: 'flex', gap: '16px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                <span style={{
                  padding: '2px 8px', borderRadius: '12px', fontWeight: 600,
                  border: `1px solid ${execOk ? 'var(--success)' : 'var(--danger)'}`,
                  color: execOk ? 'var(--success)' : 'var(--danger)'
                }}>
                  {execOk ? 'SUCCESS' : 'FAILED'}
                </span>
                <span>{executionResult.latencyMs} ms ({executionResult.latencySource})</span>
                {executionResult.producedAt && (
                  <span>at {new Date(executionResult.producedAt).toLocaleTimeString()}</span>
                )}
              </div>
            </div>
            <pre style={{ margin: 0, padding: '12px 16px', background: 'var(--bg-main)', fontFamily: 'monospace', fontSize: '0.8rem', color: execOk ? '#3fb950' : 'var(--danger)', whiteSpace: 'pre-wrap', overflowY: 'auto', maxHeight: '260px' }}>
              {JSON.stringify(executionResult.output ?? executionResult.result ?? executionResult.data ?? executionResult, null, 2)}
            </pre>
          </div>
        )}

        <McpCircuitBreakerTable tools={tools} onRefresh={fetchTools} />

      </div>

    </div>
  );
};
