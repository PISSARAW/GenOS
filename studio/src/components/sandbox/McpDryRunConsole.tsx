import React from 'react';
import { Terminal, ShieldAlert, Cpu, DollarSign, Clock } from 'lucide-react';

interface DryRunResult {
  output: string;
  latencyMs: number;
  tokensUsed: { input: number; output: number; total: number };
  estimatedCostUsd: number;
  blastRadius: {
    score: number;
    filesModified: string[];
    subprocesses: string[];
    riskLevel: 'Low' | 'Moderate' | 'High';
  };
}

export const McpDryRunConsole: React.FC<{ result: DryRunResult | null; isRunning: boolean }> = ({ result, isRunning }) => {
  return (
    <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', borderRadius: '6px', overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '100%' }}>
      
      {/* Header with Micro-Telemetry */}
      <div style={{ padding: '10px 16px', background: 'var(--bg-subtle)', borderBottom: '1px solid var(--panel-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Terminal size={14} color="var(--success)" /> VFS Dry-Run & Micro-Telemetry Monitor
        </div>

        {result && (
          <div style={{ display: 'flex', gap: '16px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Clock size={12} color="var(--accent-blue)" /> {result.latencyMs} ms
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Cpu size={12} color="var(--success)" /> {result.tokensUsed.total} tokens
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <DollarSign size={12} color="#d29922" /> ${result.estimatedCostUsd}
            </span>
          </div>
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto' }}>
        
        {/* Blast Radius Box */}
        {result && (
          <div style={{ 
            background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '6px', padding: '12px 16px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center'
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
                <ShieldAlert size={14} color={result.blastRadius.score > 50 ? 'var(--danger)' : 'var(--success)'} />
                Pre-Flight Blast Radius: <span style={{ color: result.blastRadius.score > 50 ? 'var(--danger)' : 'var(--success)' }}>Risk Score {result.blastRadius.score}/100</span>
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                Target Files: {result.blastRadius.filesModified.join(', ') || 'No file mutations detected (pure read/analysis)'}
              </div>
            </div>
            <div style={{ 
              padding: '2px 8px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 600,
              border: `1px solid ${result.blastRadius.riskLevel === 'High' ? 'var(--danger)' : 'var(--success)'}`,
              color: result.blastRadius.riskLevel === 'High' ? 'var(--danger)' : 'var(--success)'
            }}>
              {result.blastRadius.riskLevel} Risk
            </div>
          </div>
        )}

        {/* Output Console */}
        <div style={{ flex: 1, minHeight: '140px', background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '6px', padding: '12px', fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--text-primary)', overflowY: 'auto' }}>
          {isRunning ? (
            <div style={{ color: 'var(--accent-blue)' }}>&gt; Simulating tool execution in isolated VFS sandbox...</div>
          ) : result ? (
            <div>
              <div style={{ color: 'var(--text-secondary)', marginBottom: '8px' }}>// Dry-Run Simulation Output</div>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', color: '#3fb950', lineHeight: 1.5 }}>
                {result.output}
              </pre>
            </div>
          ) : (
            <div style={{ color: 'var(--text-muted)' }}>
              &gt; Ready. Configure parameters and click "Execute in Dry-Run Sandbox" to simulate blast radius.
            </div>
          )}
        </div>

      </div>

    </div>
  );
};
