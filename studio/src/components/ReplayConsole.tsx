import React from 'react';
import { Play, SkipBack, SkipForward, Clock } from 'lucide-react';

export interface ReplayConsoleProps {
  startTime?: string;
  currentTime?: string;
  endTime?: string;
  currentStep?: number;
  progressPercent?: number;
}

export const ReplayConsole: React.FC<ReplayConsoleProps> = ({
  startTime = '00:00',
  currentTime = '00:00',
  endTime = '00:00',
  currentStep = 0,
  progressPercent = 0
}) => {
  return (
    <div style={{ 
      position: 'absolute', 
      bottom: '24px', 
      left: '50%', 
      transform: 'translateX(-50%)', 
      width: '70%', 
      zIndex: 10,
      background: 'var(--bg-panel)',
      border: '1px solid var(--panel-border)',
      borderRadius: '6px',
      boxShadow: '0 16px 32px rgba(0, 0, 0, 0.6)',
      padding: '16px 24px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between'
    }}>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <button style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex' }}>
          <SkipBack size={20} />
        </button>
        <button style={{ border: 'none', background: 'var(--bg-subtle)', borderRadius: '50%', width: '40px', height: '40px', cursor: 'pointer', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Play size={20} fill="currentColor" />
        </button>
        <button style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex' }}>
          <SkipForward size={20} />
        </button>
      </div>
      
      <div style={{ flexGrow: 1, margin: '0 32px', position: 'relative' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '8px' }}>
          <span>{startTime}</span>
          <span style={{ color: 'var(--accent-blue)', fontWeight: 600 }}>Current ({currentTime})</span>
          <span>{endTime}</span>
        </div>
        <div style={{ height: '6px', background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '3px', position: 'relative' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: `${progressPercent}%`, background: '#1f6feb', borderRadius: '3px' }}></div>
          {/* Playhead */}
          <div style={{ position: 'absolute', top: '-4px', left: `${progressPercent}%`, height: '14px', width: '4px', background: 'var(--text-primary)', borderRadius: '2px', cursor: 'ew-resize' }}></div>
        </div>
      </div>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)', borderLeft: '1px solid var(--panel-border)', paddingLeft: '24px' }}>
        <Clock size={16} /> Step {currentStep}
      </div>
      
    </div>
  );
};
