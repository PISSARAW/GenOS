import { useState } from 'react';

export function GriotExecutionHeader({ data, duration }: { data?: any; duration?: string }) {
  const agents = data?.agents || [];
  const events = data?.telemetry || [];
  const [isOpen, setIsOpen] = useState(false);

  return (
    <details className="execution-header" open={isOpen} onToggle={(e) => setIsOpen((e.target as HTMLDetailsElement).open)}>
      <summary className="execution-summary">
        <span className="execution-title">Exécution durant {duration || '9m 44s'}</span>
        <svg className={`execution-chevron ${isOpen ? 'open' : ''}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M9 18l6-6-6-6" />
        </svg>
      </summary>
      <div className="execution-body">
        {agents.length > 0 && (
          <div className="execution-section">
            <span className="execution-section-title">Agents déployés</span>
            <div className="agents-list">
              {agents.map((ag: any, i: number) => (
                <div key={i} className="agent-badge">
                  <span className={`status-dot ${ag.status || 'completed'}`} />
                  {ag.id?.replace('griot_orchestrator_', 'orch_').replace('worker_griot_', 'worker_') || `Agent ${i + 1}`}
                </div>
              ))}
            </div>
          </div>
        )}
        {events.length > 0 ? (
          <div className="execution-section">
            <span className="execution-section-title">Timeline des événements</span>
            <div className="timeline-container">
              {events.map((ev: any, i: number) => (
                <div key={i} className="timeline-item">
                  <span className="timeline-action">{ev.action || ev.event_type || 'EVENT'}</span>
                  <span className="timeline-detail">{ev.detail || 'Opération effectuée'}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="execution-section">
            <span className="timeline-detail">Exécution cognitive GenOS effectuée avec succès.</span>
          </div>
        )}
      </div>
    </details>
  );
}
