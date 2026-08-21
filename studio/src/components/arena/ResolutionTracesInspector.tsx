import React, { useState } from 'react';
import { FileText, Download, GitBranch, Terminal, CheckCircle2 } from 'lucide-react';
import { useToastStore } from '../../store/useToastStore';

interface TraceStep {
  id: string;
  stepNumber: number;
  phase: 'Search' | 'Hypothesis' | 'AST_Transform' | 'Verification';
  description: string;
  latencyMs: number;
  astDiff: string;
}

export const ResolutionTracesInspector: React.FC = () => {
  const [selectedFormat, setSelectedFormat] = useState<'json' | 'otel' | 'html'>('json');
  const [activeStepId, setActiveStepId] = useState<string>('tr-1');
  const showToast = useToastStore((state) => state.showToast);

  const steps: TraceStep[] = [
    {
      id: 'tr-1',
      stepNumber: 1,
      phase: 'Search',
      description: 'MCTS expansion exploring 4 AST replacement candidates for authentication token validation.',
      latencyMs: 45,
      astDiff: '// Candidate 1: Regex validation\n// Candidate 2: Byte-length parity\n// Candidate 3: Cryptographic signature HMAC verify'
    },
    {
      id: 'tr-2',
      stepNumber: 2,
      phase: 'Hypothesis',
      description: 'Selected Candidate 3. Synthesized HMAC-SHA256 constant-time comparison helper to prevent timing attacks.',
      latencyMs: 82,
      astDiff: '+ import { timingSafeEqual } from "crypto";\n+ export function verifyTokenSafe(a: Buffer, b: Buffer) {\n+   return timingSafeEqual(a, b);\n+ }'
    },
    {
      id: 'tr-3',
      stepNumber: 3,
      phase: 'AST_Transform',
      description: 'Applied surgical patch to src/api/auth.ts with zero regression on adjacent functions.',
      latencyMs: 38,
      astDiff: '- function insecureCheck(a, b) { return a === b; }\n+ function insecureCheck(a, b) { return verifyTokenSafe(a, b); }'
    },
    {
      id: 'tr-4',
      stepNumber: 4,
      phase: 'Verification',
      description: 'Executed test suite (58 assertions). 100% pass rate. 0 CVEs detected by Adversarial Reviewer.',
      latencyMs: 120,
      astDiff: '[TEST] 58 tests passed in 120ms.\n[ADVERSARIAL_QA] 0 vulnerabilities detected.'
    }
  ];

  const activeStep = steps.find((s) => s.id === activeStepId) || steps[0];

  const handleExport = () => {
    const traceBundle = {
      traceId: `trace-${Date.now()}`,
      format: selectedFormat,
      exportedAt: new Date().toISOString(),
      solver: 'MCTS-Explorer',
      steps
    };
    const blob = new Blob([JSON.stringify(traceBundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `genos_trace_bundle.${selectedFormat === 'html' ? 'html' : 'json'}`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('success', 'Trace Bundle Exported', `Downloaded ${selectedFormat.toUpperCase()} trace bundle with ${steps.length} execution steps.`);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', height: '100%' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-panel)', padding: '12px 16px', borderRadius: '6px', border: '1px solid var(--panel-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <FileText size={16} color="var(--accent-blue)" />
          <div>
            <h3 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-primary)' }}>Universal Resolution Trace Inspector</h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>OpenTelemetry Spans & AST Execution DAG</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <select 
            value={selectedFormat} 
            onChange={(e) => setSelectedFormat(e.target.value as any)}
            style={{ padding: '4px 8px', background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.75rem' }}
          >
            <option value="json">JSON-DAG Bundle</option>
            <option value="otel">OpenTelemetry / Jaeger</option>
            <option value="html">Standalone HTML Replay</option>
          </select>
          <button onClick={handleExport} className="gh-btn gh-btn-primary" style={{ fontSize: '0.75rem', padding: '4px 12px' }}>
            <Download size={14} /> Export Trace
          </button>
        </div>
      </div>

      {/* Main Split Body */}
      <div style={{ display: 'flex', gap: '16px', flex: 1, minHeight: '300px' }}>
        
        {/* Step List */}
        <div style={{ width: '320px', background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', borderRadius: '6px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--panel-border)', background: 'var(--bg-subtle)', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <GitBranch size={14} /> Execution Steps
          </div>
          <div style={{ flex: 1, padding: '8px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {steps.map((step) => {
              const isSelected = step.id === activeStepId;
              return (
                <div 
                  key={step.id}
                  onClick={() => setActiveStepId(step.id)}
                  className="hover-bg-gray"
                  style={{ 
                    padding: '10px 12px', borderRadius: '6px', cursor: 'pointer',
                    background: isSelected ? 'var(--bg-subtle)' : 'transparent',
                    border: isSelected ? '1px solid var(--accent-blue)' : '1px solid transparent'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '0.75rem' }}>
                    <span style={{ fontWeight: 600, color: 'var(--accent-blue)' }}>Step #{step.stepNumber} · {step.phase}</span>
                    <span style={{ color: 'var(--text-secondary)' }}>{step.latencyMs}ms</span>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-primary)', lineHeight: 1.4 }}>
                    {step.description}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Step Detail / AST Code */}
        <div style={{ flex: 1, background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', borderRadius: '6px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--panel-border)', background: 'var(--bg-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              <Terminal size={14} /> Step #{activeStep.stepNumber} AST Transformation Diff
            </div>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: 'var(--success)' }}>
              <CheckCircle2 size={12} /> AST Validated
            </span>
          </div>

          <div style={{ flex: 1, padding: '16px', background: 'var(--bg-main)', overflow: 'auto' }}>
            <pre style={{ margin: 0, fontFamily: 'monospace', fontSize: '0.85rem', lineHeight: 1.6, color: 'var(--text-primary)' }}>
              {activeStep.astDiff}
            </pre>
          </div>
        </div>

      </div>

    </div>
  );
};
