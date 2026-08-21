import React from 'react';
import { Bot } from 'lucide-react';
import { SwarmControlCenter } from './SwarmControlCenter';

interface AgentsPageProps {
  onSelectAgent: () => void;
}

export const AgentsPage: React.FC<AgentsPageProps> = ({ onSelectAgent }) => (
  <div style={{ width: '100%', height: '100%', overflowY: 'auto', background: 'var(--bg-main)' }}>
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 32px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
        <Bot size={20} color="var(--accent-blue)" />
        <h1 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1.5rem' }}>Agents</h1>
      </div>
      <p style={{ margin: '0 0 8px', color: 'var(--text-secondary)' }}>Inspect and coordinate the agents currently connected to the GenOS Fleet.</p>
    </div>
    <div style={{ height: 'calc(100% - 92px)' }}><SwarmControlCenter onSelectAgent={onSelectAgent} /></div>
  </div>
);
