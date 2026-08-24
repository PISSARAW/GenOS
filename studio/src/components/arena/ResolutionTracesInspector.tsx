import React, { useCallback, useEffect, useState } from 'react';
import { FileText, Download, GitBranch, Terminal, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useToastStore } from '../../store/useToastStore';
import { api } from '../../api/client';

interface TraceStep {
  id: string;
  stepNumber: number;
  phase: 'Search' | 'Hypothesis' | 'AST_Transform' | 'Verification';
  description: string;
  latencyMs: number;
  astDiff: string;
}

const toHexId = (value: string, length: number) => {
  let hex = '';
  const source = value || 'genos';
  for (let i = 0; i < length / 2; i++) {
    const code = source.charCodeAt(i % source.length) + i * 7;
    hex += ((code % 256)).toString(16).padStart(2, '0');
  }
  return hex;
};

const buildOtlpExport = (bundle: any, steps: TraceStep[]) => {
  const baseMs = Date.parse(bundle?.startedAt || bundle?.timestamp || '') || Date.now();
  let cursorNs = baseMs * 1_000_000;
  const spans = steps.map((step) => {
    const startNs = cursorNs;
    cursorNs += Math.max(step.latencyMs, 0) * 1_000_000;
    return {
      traceId: /^[0-9a-f]{32}$/i.test(String(bundle?.traceId)) ? bundle.traceId : toHexId(String(bundle?.traceId || step.id), 32),
      spanId: /^[0-9a-f]{16}$/i.test(String(step.id)) ? String(step.id).toLowerCase() : toHexId(step.id, 16),
      name: `${step.phase}: ${step.description}`.slice(0, 200),
      kind: 'SPAN_KIND_INTERNAL',
      startTimeUnixNano: String(startNs),
      endTimeUnixNano: String(cursorNs),
      attributes: [
        { key: 'genos.step.number', value: { intValue: String(step.stepNumber) } },
        { key: 'genos.phase', value: { stringValue: step.phase } },
        { key: 'genos.latency.ms', value: { doubleValue: step.latencyMs } },
        ...(step.astDiff && step.astDiff !== 'No AST diff available.' ? [{ key: 'genos.ast_diff', value: { stringValue: step.astDiff.slice(0, 4096) } }] : [])
      ],
      status: { code: 'STATUS_CODE_OK' }
    };
  });
  return {
    resourceSpans: [
      {
        resource: {
          attributes: [
            { key: 'service.name', value: { stringValue: 'genos-solver-runtime' } }
          ]
        },
        scopeSpans: [
          {
            scope: { name: 'genos.resolution-traces', version: '1.0.0' },
            spans
          }
        ]
      }
    ]
  };
};

const escapeForHtmlEmbed = (data: unknown) =>
  JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');

const buildHtmlReplay = (bundle: any, steps: TraceStep[]) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>GenOS Trace Replay${bundle?.traceId ? ` · ${bundle.traceId}` : ''}</title>
<style>
  body { font-family: -apple-system, "Segoe UI", sans-serif; background: #0d1117; color: #e6edf3; margin: 0; padding: 24px; }
  h1 { font-size: 1.1rem; margin: 0 0 4px 0; }
  .meta { color: #8b949e; font-size: 0.8rem; margin-bottom: 20px; }
  table { border-collapse: collapse; width: 100%; font-size: 0.85rem; }
  th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid #21262d; }
  th { color: #8b949e; background: #161b22; position: sticky; top: 0; }
  tr:hover td { background: #161b22; cursor: pointer; }
  tr.active td { background: #1c2530 !important; }
  .phase { color: #58a6ff; font-weight: 600; font-size: 0.75rem; }
  .bar-cell { width: 30%; }
  .bar { height: 6px; background: #21262d; border-radius: 3px; overflow: hidden; }
  .bar > div { height: 100%; background: #3fb950; }
  pre { background: #010409; border: 1px solid #21262d; border-radius: 6px; padding: 12px; font-size: 0.8rem; white-space: pre-wrap; word-break: break-word; display: none; margin-top: 12px; }
</style>
</head>
<body>
<h1>GenOS Resolution Trace Replay</h1>
<div class="meta">Trace ${bundle?.traceId ?? 'n/a'} · ${steps.length} spans · Total ${steps.reduce((acc, s) => acc + s.latencyMs, 0)}ms</div>
<table id="grid">
<thead><tr><th>#</th><th>Phase</th><th>Description</th><th class="bar-cell">Latency (ms)</th></tr></thead>
<tbody></tbody>
</table>
<pre id="detail"></pre>
<script id="trace-data" type="application/json">${escapeForHtmlEmbed(steps)}</script>
<script>
(function () {
  var steps = JSON.parse(document.getElementById('trace-data').textContent);
  var tbody = document.querySelector('#grid tbody');
  var detail = document.getElementById('detail');
  var maxLatency = Math.max.apply(null, [1].concat(steps.map(function (s) { return s.latencyMs; })));
  steps.forEach(function (step) {
    var row = document.createElement('tr');
    row.innerHTML =
      '<td>' + step.stepNumber + '</td>' +
      '<td><span class="phase">' + step.phase + '</span></td>' +
      '<td>' + step.description.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</td>' +
      '<td class="bar-cell"><div style="display:flex;align-items:center;gap:8px;"><div class="bar" style="flex:1;"><div style="width:' +
      Math.round((step.latencyMs / maxLatency) * 100) + '%"></div></div><span>' + step.latencyMs + '</span></div></td>';
    row.addEventListener('click', function () {
      Array.prototype.forEach.call(tbody.children, function (r) { r.classList.remove('active'); });
      row.classList.add('active');
      detail.style.display = 'block';
      detail.textContent = step.astDiff || 'No AST diff available.';
    });
    tbody.appendChild(row);
  });
})();
</script>
</body>
</html>`;

export const ResolutionTracesInspector: React.FC = () => {
  const [selectedFormat, setSelectedFormat] = useState<'json' | 'otel' | 'html'>('json');
  const [tournamentIdInput, setTournamentIdInput] = useState('');
  const [appliedTournamentId, setAppliedTournamentId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeStepId, setActiveStepId] = useState<string | null>(null);
  const showToast = useToastStore((state) => state.showToast);

  const [steps, setSteps] = useState<TraceStep[]>([]);
  const [traceBundle, setTraceBundle] = useState<any>(null);

  const loadTrace = useCallback((id: string) => {
    setIsLoading(true);
    setError(null);
    api.getArenaTrace(id.trim() || undefined)
      .then((bundle: any) => {
        setTraceBundle(bundle?.traceId ? bundle : null);
        setSteps((bundle?.spans || []).map((span: any, index: number) => ({
          id: span.spanId,
          stepNumber: span.stepNumber || index + 1,
          phase: span.phase || 'Verification',
          description: span.description || span.name,
          latencyMs: span.latencyMs || 0,
          astDiff: span.astDiff || 'No AST diff available.'
        })));
      })
      .catch((e: any) => {
        setTraceBundle(null);
        setSteps([]);
        setError(e?.message || 'Failed to load the resolution trace.');
      })
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    loadTrace(appliedTournamentId);
  }, [loadTrace, appliedTournamentId]);

  const activeStep = steps.find((s) => s.id === activeStepId) || null;

  const handleApplyTournamentId = () => {
    setAppliedTournamentId(tournamentIdInput.trim());
  };

  const handleExport = () => {
    if (!traceBundle || steps.length === 0) {
      showToast('info', 'No Trace Available', 'Run a real solver tournament before exporting a trace.');
      return;
    }
    let content: string;
    let mimeType: string;
    let extension: string;
    if (selectedFormat === 'html') {
      content = buildHtmlReplay(traceBundle, steps);
      mimeType = 'text/html';
      extension = 'html';
    } else if (selectedFormat === 'otel') {
      content = JSON.stringify(buildOtlpExport(traceBundle, steps), null, 2);
      mimeType = 'application/json';
      extension = 'json';
    } else {
      content = JSON.stringify(traceBundle, null, 2);
      mimeType = 'application/json';
      extension = 'json';
    }
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `genos_trace_bundle_${traceBundle.traceId}.${extension}`;
    a.click();
    URL.revokeObjectURL(url);
    const label = selectedFormat === 'otel' ? 'OTLP-compatible JSON' : selectedFormat === 'html' ? 'Standalone HTML replay' : 'JSON-DAG bundle';
    showToast('success', 'Trace Bundle Exported', `Downloaded ${label} with ${steps.length} execution steps.`);
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
          <input
            type="text"
            value={tournamentIdInput}
            onChange={(e) => setTournamentIdInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleApplyTournamentId()}
            placeholder="Tournament ID (empty = latest)"
            title="Leave empty to load the latest tournament trace"
            style={{ padding: '4px 8px', background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.75rem', width: '220px' }}
          />
          <button onClick={handleApplyTournamentId} className="gh-btn" style={{ fontSize: '0.75rem', padding: '4px 10px' }}>
            Load
          </button>
          <select
            value={selectedFormat}
            onChange={(e) => setSelectedFormat(e.target.value as any)}
            style={{ padding: '4px 8px', background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.75rem' }}
          >
            <option value="json">JSON-DAG Bundle (.json)</option>
            <option value="otel">OpenTelemetry / Jaeger (OTLP JSON)</option>
            <option value="html">Standalone HTML Replay</option>
          </select>
          <button onClick={handleExport} className="gh-btn gh-btn-primary" style={{ fontSize: '0.75rem', padding: '4px 12px' }}>
            <Download size={14} /> Export Trace
          </button>
        </div>
      </div>

      {error && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(248, 81, 73, 0.1)', border: '1px solid #f85149', borderRadius: '6px', padding: '10px 16px' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#f85149', fontSize: '0.85rem' }}>
            <AlertTriangle size={14} /> {error}
          </span>
          <button onClick={() => loadTrace(appliedTournamentId)} className="gh-btn gh-btn-primary" style={{ fontSize: '0.75rem', padding: '4px 12px' }}>
            Retry
          </button>
        </div>
      )}

      {/* Main Split Body */}
      <div style={{ display: 'flex', gap: '16px', flex: 1, minHeight: '300px' }}>

        {/* Step List */}
        <div style={{ width: '320px', background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', borderRadius: '6px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--panel-border)', background: 'var(--bg-subtle)', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <GitBranch size={14} /> Execution Steps
          </div>
          <div style={{ flex: 1, padding: '8px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {!error && isLoading && (
              <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Loading trace...</div>
            )}
            {!error && !isLoading && steps.length === 0 && (
              <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>No trace recorded yet. Run a solver tournament first.</div>
            )}
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
              <Terminal size={14} /> {activeStep ? `Step #${activeStep.stepNumber} Execution Detail` : 'No execution trace selected'}
            </div>
            {activeStep && <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: 'var(--success)' }}><CheckCircle2 size={12} /> Recorded</span>}
          </div>

          <div style={{ flex: 1, padding: '16px', background: 'var(--bg-main)', overflow: 'auto' }}>
            <pre style={{ margin: 0, fontFamily: 'monospace', fontSize: '0.85rem', lineHeight: 1.6, color: 'var(--text-primary)' }}>
              {activeStep?.astDiff || 'No trace data available.'}
            </pre>
          </div>
        </div>

      </div>

    </div>
  );
};
