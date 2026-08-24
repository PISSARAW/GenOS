import React, { useState } from 'react';
import { Terminal, ShieldAlert, Clock, Copy, Check } from 'lucide-react';

interface DryRunResult {
  toolName: string;
  latencyMs: number;
  latencySource?: string;
  producedAt?: number;
  blastRadiusScore: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  sideEffects: {
    filesCreated: string[];
    filesModified: string[];
    filesDeleted: string[];
    subprocesses: string[];
  };
  predictedVfsDiff: { totalChanges: number; simulatedPaths: string[] };
}

const RISK_COLORS: Record<DryRunResult['riskLevel'], string> = {
  LOW: 'var(--success)',
  MEDIUM: 'var(--warning)',
  HIGH: 'var(--danger)',
};

export const McpDryRunConsole: React.FC<{ result: DryRunResult | null; isRunning: boolean }> = ({ result, isRunning }) => {
  const [copied, setCopied] = useState(false);
  const dump = result ? JSON.stringify({ sideEffects: result.sideEffects, predictedVfsDiff: result.predictedVfsDiff }, null, 2) : '';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(dump);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

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
              <Clock size={12} color="var(--accent-blue)" /> {result.latencyMs} ms{result.latencySource ? ` (${result.latencySource})` : ''}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              {result.toolName}
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
                <ShieldAlert size={14} color={RISK_COLORS[result.riskLevel]} />
                Pre-Flight Blast Radius: <span style={{ color: result.blastRadiusScore > 50 ? 'var(--danger)' : 'var(--success)' }}>Risk Score {result.blastRadiusScore}/100</span>
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                Target Files: {[...result.sideEffects.filesCreated, ...result.sideEffects.filesModified, ...result.sideEffects.filesDeleted].join(', ') || 'No file mutations predicted (read/analysis only)'}
              </div>
              {result.producedAt && (
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                  Produced at {new Date(result.producedAt).toLocaleTimeString()}
                </div>
              )}
            </div>
            <div style={{
              padding: '2px 8px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 600,
              border: `1px solid ${RISK_COLORS[result.riskLevel]}`,
              color: RISK_COLORS[result.riskLevel]
            }}>
              {result.riskLevel} Risk
            </div>
          </div>
        )}

        {/* Output Console */}
        <div style={{ flex: 1, minHeight: '140px', background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '6px', padding: '12px', fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--text-primary)', overflowY: 'auto', position: 'relative' }}>
          {isRunning ? (
            <div style={{ color: 'var(--accent-blue)' }}>&gt; Simulating tool execution in isolated VFS sandbox...</div>
          ) : result ? (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>// Backend dry-run result</span>
                <button
                  onClick={handleCopy}
                  className="gh-btn"
                  title="Copy JSON to clipboard"
                  style={{ fontSize: '0.7rem', padding: '2px 8px', display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  {copied ? <><Check size={10} /> Copied</> : <><Copy size={10} /> Copy JSON</>}
                </button>
              </div>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', color: '#3fb950', lineHeight: 1.5 }}>
                {dump}
              </pre>
            </div>
          ) : (
            <div style={{ color: 'var(--text-muted)' }}>
              &gt; Ready. Configure parameters and click "Run VFS Dry-Run" to simulate blast radius.
            </div>
          )}
        </div>

      </div>

    </div>
  );
};
