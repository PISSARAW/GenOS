import React, { useMemo } from 'react';
import { useGenOSStore } from '../store/useGenOSStore';

export const TracingView: React.FC = () => {
  const { traces } = useGenOSStore();

  const allSpans = useMemo(() => {
    return Object.values(traces).flat().sort((a, b) => a.startTime - b.startTime);
  }, [traces]);

  const minStart = allSpans.length > 0 ? allSpans[0].startTime : 0;
  const maxEnd = allSpans.length > 0 ? Math.max(...allSpans.map(s => s.endTime || s.startTime + 100)) : 1000;
  const totalDuration = Math.max(maxEnd - minStart, 1000); // At least 1000ms

  return (
    <div className="mac-panel flex-col" style={{ flexGrow: 1, overflow: 'hidden' }}>
      <div className="p-4" style={{ borderBottom: '1px solid var(--panel-border)', background: 'var(--bg-main)' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Runtime trace waterfall</h3>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>Live observer spans · persisted runtime events</div>
      </div>
      <div className="p-4" style={{ flexGrow: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', borderBottom: '1px solid var(--panel-border)', paddingBottom: '4px', marginBottom: '8px', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
          <div style={{ width: '250px' }}>Operation</div>
          <div style={{ flexGrow: 1 }}>Timeline (ms)</div>
          <div style={{ width: '100px', textAlign: 'right' }}>Status</div>
        </div>
        
        {allSpans.map(span => {
          const duration = (span.endTime || span.startTime + 100) - span.startTime;
          const relativeStart = span.startTime - minStart;
          
          return (
            <div key={span.id} style={{ display: 'flex', alignItems: 'center', fontSize: '0.85rem' }}>
              <div style={{ width: '250px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={span.name}>
                {span.name}
              </div>
              <div style={{ flexGrow: 1, display: 'flex', alignItems: 'center', position: 'relative', height: '24px' }}>
                <div 
                  style={{
                    position: 'absolute',
                    left: `${(relativeStart / totalDuration) * 100}%`,
                    width: `${(duration / totalDuration) * 100}%`,
                    height: '16px',
                    background: span.error ? 'var(--error)' : 'var(--accent-blue)',
                    borderRadius: '3px',
                    minWidth: '2px'
                  }}
                />
                <span style={{ position: 'absolute', left: `${((relativeStart + duration) / totalDuration) * 100}%`, marginLeft: '8px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  {duration}ms
                </span>
              </div>
              <div style={{ width: '100px', textAlign: 'right', color: span.error ? 'var(--error)' : 'var(--success)' }}>
                {span.error ? 'Error' : 'OK'}
              </div>
            </div>
          );
        })}
        {allSpans.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: '2rem' }}>
            No runtime trace spans recorded yet.
          </div>
        )}
      </div>
    </div>
  );
};
